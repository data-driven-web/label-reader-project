/**
 * resultsStore — persistent saved label results (localStorage).
 *
 * Each saved label is keyed by filename and carries a SHA-256 content hash.
 * When a label is re-analyzed: same filename + different hash = a new
 * version of the artwork — the record is re-scored, moved to the matching
 * section (Approved / Review / Needs Action), and the previous outcome is
 * kept in version history. Production would back this with the shared
 * COLA-linked database described in the README roadmap.
 */

const KEY = 'ttb_saved_results';
const MAX_ENTRIES = 300; // localStorage quota guard

const hasStorage = typeof localStorage !== 'undefined';

function read() {
  if (!hasStorage) return [];
  try { return JSON.parse(localStorage.getItem(KEY)) ?? []; }
  catch { return []; }
}
function write(list) {
  if (!hasStorage) return;
  try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX_ENTRIES))); }
  catch {
    // Quota exceeded — retry without thumbnails rather than losing data.
    try {
      localStorage.setItem(KEY, JSON.stringify(
        list.slice(0, MAX_ENTRIES).map((e) => ({ ...e, thumb: null }))));
    } catch { /* give up silently */ }
  }
}

/** SHA-256 hex of a File/Blob — identifies a specific artwork version. */
export async function fileHash(file) {
  const buf = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Small JPEG thumbnail data-URL for the saved results list. */
export function makeThumbnail(imageSource) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = imageSource instanceof Blob ? URL.createObjectURL(imageSource) : imageSource;
    img.onload = () => {
      const w = 120;
      const h = Math.max(1, Math.round((img.naturalHeight / img.naturalWidth) * w));
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      if (imageSource instanceof Blob) URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.7));
    };
    img.onerror = () => { if (imageSource instanceof Blob) URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}

/** Section for an entry: the agent's decision wins, otherwise risk level. */
export function sectionOf(entry) {
  if (entry.action === 'approved') return 'approved';
  if (entry.action === 'rejected') return 'needsAction';
  if (entry.overall === 'green') return 'approved';
  if (entry.overall === 'yellow') return 'review';
  return 'needsAction';
}

export function getSavedResults() { return read(); }

export function getSavedByFilename(filename) {
  return read().find((e) => e.filename === filename) || null;
}

/**
 * Save or update a result. Returns { entry, change } where change is
 * 'new' | 'updated' | 'newVersion'.
 */
export function saveOrUpdateResult({ filename, hash, thumb, overall, counts, action, brandIdentified }) {
  const list = read();
  const now = new Date().toISOString();
  const idx = list.findIndex((e) => e.filename === filename);
  let change;
  if (idx === -1) {
    list.unshift({
      filename, hash: hash || null, thumb: thumb || null, overall, counts,
      action: action || null, brandIdentified: brandIdentified || null,
      lastChecked: now,
      history: [{ hash: hash || null, overall, action: action || null, timestamp: now }]
    });
    change = 'new';
  } else {
    const e = list[idx];
    const isNewVersion = Boolean(hash && e.hash && hash !== e.hash);
    e.history = (e.history || [])
      .concat([{ hash: hash || null, overall, action: action || null, timestamp: now }])
      .slice(-10);
    e.hash = hash || e.hash;
    e.overall = overall;
    e.counts = counts;
    // A new artwork version invalidates the previous agent decision.
    e.action = isNewVersion ? (action || null) : (action ?? e.action ?? null);
    e.brandIdentified = brandIdentified || e.brandIdentified;
    e.lastChecked = now;
    if (thumb) e.thumb = thumb;
    list.splice(idx, 1);
    list.unshift(e);
    change = isNewVersion ? 'newVersion' : 'updated';
  }
  write(list);
  return { entry: list[0], change };
}

/** Update only if this filename was previously saved (auto-update path). */
export function autoUpdateIfSaved(payload) {
  if (!getSavedByFilename(payload.filename)) return null;
  return saveOrUpdateResult(payload);
}

export function removeSavedResult(filename) {
  write(read().filter((e) => e.filename !== filename));
}

export function clearSavedResults() {
  if (hasStorage) localStorage.removeItem(KEY);
}
