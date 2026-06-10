/**
 * templateClassifier — Layer 1: beverage type detection from Canvas (ms).
 *
 * Runs BEFORE any OCR. Uses only cheap signals available from the Canvas
 * API — dimensions, aspect ratio, and a downsampled color profile — to pick
 * one of three zone templates. Heuristics are deliberately coarse: a wrong
 * guess degrades gracefully because all templates share similar zone
 * geometry and Layer 3 validation is driven by the agent-selected beverage
 * type, not this guess. Low-confidence results default to the distilled
 * spirits template (the strictest field list) and are flagged unclassified.
 */
import { REQUIRED_FIELDS } from '../constants/regulations.js';
import { loadImage } from './ocrEngine.js';

// Shared zone geometry (fractions of image width/height) per the spec:
// brand = top 40% center column; ABV/class = 30-60% band; warning = bottom
// 20% full width; remaining info band carries producer/contents/origin.
const BASE_ZONES = {
  brandName: {
    x: 0.15, y: 0.0, w: 0.7, h: 0.4,
    fields: ['brandName'],
    statusLabel: 'brand name'
  },
  abvClassType: {
    x: 0.0, y: 0.3, w: 1.0, h: 0.3,
    fields: ['abv', 'classType'],
    statusLabel: 'alcohol content and class'
  },
  infoBand: {
    x: 0.0, y: 0.55, w: 1.0, h: 0.25,
    fields: ['producer', 'netContents', 'countryOfOrigin'],
    statusLabel: 'producer and net contents'
  },
  governmentWarning: {
    x: 0.0, y: 0.78, w: 1.0, h: 0.22,
    fields: ['governmentWarning'],
    statusLabel: 'Government Warning'
  }
};

export const TEMPLATES = {
  distilled_spirits: {
    id: 'distilled_spirits',
    displayName: 'Distilled Spirits',
    requiredFields: REQUIRED_FIELDS.distilled_spirits,
    zones: BASE_ZONES
  },
  wine: {
    id: 'wine',
    displayName: 'Wine',
    requiredFields: REQUIRED_FIELDS.wine,
    zones: BASE_ZONES
  },
  beer: {
    id: 'beer',
    displayName: 'Beer / Malt Beverage',
    requiredFields: REQUIRED_FIELDS.beer,
    zones: BASE_ZONES
  }
};

// Template cache for the current batch session: labels in one batch usually
// come from the same producer at the same dimensions, so a repeat hit skips
// re-classification entirely.
const sessionCache = new Map();

function cacheKey(width, height) {
  // Bucket by exact dimensions plus coarse aspect ratio.
  return `${width}x${height}|${(width / height).toFixed(1)}`;
}

export function clearTemplateCache() {
  sessionCache.clear();
}

/** Downsample to a tiny canvas and compute the color profile. */
function colorProfile(img) {
  const SIZE = 32;
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, SIZE, SIZE);
  const { data } = ctx.getImageData(0, 0, SIZE, SIZE);

  let lum = 0, sat = 0, warm = 0, dark = 0, n = SIZE * SIZE;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const l = (max + min) / 510; // 0..1
    lum += l;
    sat += max === 0 ? 0 : (max - min) / max;
    if (r > g && r > b) warm += 1;       // red/burgundy/amber pixels
    if (l < 0.25) dark += 1;             // near-black pixels
  }
  return { lum: lum / n, sat: sat / n, warmRatio: warm / n, darkRatio: dark / n };
}

/**
 * Classify an uploaded label image.
 * @returns {{ template, beverageType, confidence, unclassified, metrics }}
 */
export async function classifyLabel(imageSource, { useCache = true } = {}) {
  const img = await loadImage(imageSource);
  const width = img.naturalWidth ?? img.width;
  const height = img.naturalHeight ?? img.height;
  const key = cacheKey(width, height);

  if (useCache && sessionCache.has(key)) {
    return { ...sessionCache.get(key), cached: true };
  }

  const aspect = width / height;
  const profile = colorProfile(img);

  // Heuristic votes. Wine labels skew portrait with warm/cream palettes;
  // beer labels skew square-to-landscape with saturated color; spirits
  // labels skew dark, low-saturation portrait.
  const scores = { wine: 0, beer: 0, distilled_spirits: 0 };

  if (aspect < 0.85) { scores.wine += 1; scores.distilled_spirits += 1; }
  if (aspect >= 0.85) scores.beer += 1.5;
  if (profile.sat > 0.35) scores.beer += 1;
  if (profile.warmRatio > 0.45 && profile.lum > 0.45) scores.wine += 1.5;
  if (profile.darkRatio > 0.3) scores.distilled_spirits += 1.5;
  if (profile.lum > 0.7 && profile.sat < 0.2) scores.wine += 0.5;

  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [topType, topScore] = ranked[0];
  const margin = topScore - ranked[1][1];
  const confidence = topScore === 0 ? 0 : Math.min(1, margin / 1.5);

  // Low confidence: default to distilled spirits (strictest required-field
  // list, so nothing gets under-checked) and flag for the agent.
  const unclassified = confidence < 0.34;
  const beverageType = unclassified ? 'distilled_spirits' : topType;

  const result = {
    template: TEMPLATES[beverageType],
    beverageType,
    confidence,
    unclassified,
    metrics: { width, height, aspect, ...profile }
  };
  sessionCache.set(key, result);
  return result;
}
