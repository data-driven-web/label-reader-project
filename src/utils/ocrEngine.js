/**
 * ocrEngine — Layer 2: Tesseract.js wrapper and zone-based parallel
 * extraction (2-3s target).
 *
 * The image is never OCR'd as one block. It is divided into the zones
 * defined by the Layer 1 template and each zone is recognized
 * simultaneously via a worker pool (Promise.all across a Tesseract
 * scheduler). Each zone returns { text, confidence } and is mapped to the
 * fields it carries.
 *
 * All Tesseract assets (worker JS, WASM core, English language data) are
 * served from /public/tesseract. Conservative choice: zero runtime requests
 * to external CDNs, so the tool works on restricted federal networks and
 * offline, and the Vercel deployment is fully self-contained.
 */
import { createScheduler, createWorker } from 'tesseract.js';

const TESSERACT_OPTIONS = {
  workerPath: '/tesseract/worker.min.js',
  corePath: '/tesseract/core',
  langPath: '/tesseract/lang'
};

// Pool of 4 matches the batch concurrency limit and lets the four zones of
// a single label run truly in parallel.
const POOL_SIZE = 4;

// Per spec: anything over 15 seconds surfaces a retry prompt.
export const ZONE_TIMEOUT_MS = 15000;

let schedulerPromise = null;

async function buildScheduler() {
  const scheduler = createScheduler();
  const workers = await Promise.all(
    Array.from({ length: POOL_SIZE }, () =>
      // OEM 1 = LSTM engine only (matches the bundled *-lstm core).
      createWorker('eng', 1, TESSERACT_OPTIONS)
    )
  );
  workers.forEach((w) => scheduler.addWorker(w));
  return scheduler;
}

/** Lazily initialize the shared worker pool (first call pays the WASM load). */
export function getScheduler() {
  if (!schedulerPromise) schedulerPromise = buildScheduler();
  return schedulerPromise;
}

/** Optional warm-up so the first label scan doesn't pay worker startup. */
export function warmUpOcr() {
  getScheduler().catch(() => { /* surfaced on first real scan instead */ });
}

export async function terminateOcr() {
  if (schedulerPromise) {
    const scheduler = await schedulerPromise;
    schedulerPromise = null;
    await scheduler.terminate();
  }
}

/** Load a File, Blob, URL, or existing element into an HTMLImageElement. */
export function loadImage(source) {
  if (source instanceof HTMLImageElement && source.complete) {
    return Promise.resolve(source);
  }
  return new Promise((resolve, reject) => {
    const img = new Image();
    let revoke = null;
    if (source instanceof Blob) {
      const url = URL.createObjectURL(source);
      revoke = () => URL.revokeObjectURL(url);
      img.src = url;
    } else if (typeof source === 'string') {
      img.src = source;
    } else if (source instanceof HTMLImageElement) {
      img.src = source.src;
    } else {
      reject(new Error('Unsupported image source'));
      return;
    }
    img.onload = () => { if (revoke) revoke(); resolve(img); };
    img.onerror = () => {
      if (revoke) revoke();
      const err = new Error('Image could not be decoded');
      err.code = 'CORRUPTED_FILE';
      reject(err);
    };
  });
}

/**
 * Crop one template zone onto its own canvas. Zones narrower than 1000px
 * are upscaled 2x — Tesseract accuracy drops sharply below ~300dpi
 * equivalent, and a cheap canvas upscale recovers most of it.
 */
function cropZone(img, zone) {
  const W = img.naturalWidth, H = img.naturalHeight;
  const sx = Math.round(W * zone.x);
  const sy = Math.round(H * zone.y);
  const sw = Math.max(1, Math.round(W * zone.w));
  const sh = Math.max(1, Math.round(H * zone.h));
  const scale = sw < 1000 ? 2 : 1;
  const canvas = document.createElement('canvas');
  canvas.width = sw * scale;
  canvas.height = sh * scale;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function withTimeout(promise, ms, label) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      const err = new Error(`Zone "${label}" timed out after ${ms / 1000}s`);
      err.code = 'TIMEOUT';
      reject(err);
    }, ms);
    promise.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); }
    );
  });
}

/**
 * Extract all fields from a label image using the given template.
 *
 * @param {File|Blob|string|HTMLImageElement} imageSource
 * @param {object} template - from templateClassifier (zones + fields)
 * @param {object} [opts]
 * @param {(message: string) => void} [opts.onStatus] - live status line feed
 * @param {(zoneName: string, result: object) => void} [opts.onZoneComplete]
 * @returns {Promise<{zones, fields, allText, overallConfidence, durationMs}>}
 */
export async function extractLabelFields(imageSource, template, opts = {}) {
  const { onStatus = () => {}, onZoneComplete = () => {} } = opts;
  const img = await loadImage(imageSource);
  const scheduler = await getScheduler();
  const started = performance.now();

  const zones = {};
  const zoneNames = Object.keys(template.zones);

  await Promise.all(
    zoneNames.map(async (zoneName) => {
      const zone = template.zones[zoneName];
      onStatus(`Reading ${zone.statusLabel} zone...`);
      const canvas = cropZone(img, zone);
      const t0 = performance.now();
      const { data } = await withTimeout(
        scheduler.addJob('recognize', canvas),
        ZONE_TIMEOUT_MS,
        zone.statusLabel
      );
      const result = {
        text: (data.text || '').trim(),
        confidence: data.confidence ?? 0,
        durationMs: Math.round(performance.now() - t0)
      };
      zones[zoneName] = result;
      onZoneComplete(zoneName, result);
    })
  );

  // Map zone text onto the fields each zone carries. Several fields can
  // share one zone (producer / net contents / origin live in the info
  // band); Tier 1 pattern anchors isolate the individual values.
  const fields = {};
  for (const zoneName of zoneNames) {
    const zone = template.zones[zoneName];
    for (const fieldName of zone.fields) {
      fields[fieldName] = {
        rawText: zones[zoneName].text,
        confidence: zones[zoneName].confidence,
        zone: zoneName
      };
    }
  }

  const allText = zoneNames.map((z) => zones[z].text).join('\n');
  const confidences = zoneNames.map((z) => zones[z].confidence);
  const overallConfidence =
    confidences.reduce((a, b) => a + b, 0) / (confidences.length || 1);

  if (!allText.trim()) {
    const err = new Error('No text detected');
    err.code = 'NO_TEXT';
    err.partialResult = { zones, fields, allText, overallConfidence };
    throw err;
  }

  return {
    zones,
    fields,
    allText,
    overallConfidence,
    durationMs: Math.round(performance.now() - started)
  };
}
