/**
 * patternAnchors — Tier 1 regex patterns and string anchors.
 * These run in milliseconds on extracted text, before any comparison logic.
 * Pure functions, no DOM.
 */

export const WARNING_ANCHOR = 'GOVERNMENT WARNING:';

// Per spec. The first group captures the numeric ABV value.
export const ABV_PATTERN = /(\d+\.?\d*)\s*%\s*[Aa]lc/;

export const NET_CONTENTS_PATTERN = /(\d+\.?\d*)\s*(mL|L|ml|oz|fl\.?\s*oz)/i;

export const PRODUCER_ANCHORS = [
  'Bottled by', 'Distilled by', 'Brewed by', 'Produced by'
];

/** Exact ALL-CAPS anchor search (case matters — that IS the check). */
export function findWarningAnchor(text) {
  return (text || '').includes(WARNING_ANCHOR);
}

/**
 * Case-insensitive presence of the warning phrase, used to distinguish
 * "warning present but mis-formatted" (red, specific) from
 * "warning absent entirely" (red, missing).
 */
export function findWarningLoose(text) {
  return /government\s+warning/i.test(text || '');
}

export function findAbv(text) {
  const m = (text || '').match(ABV_PATTERN);
  return m ? { value: parseFloat(m[1]), match: m[0] } : null;
}

export function findNetContents(text) {
  const m = (text || '').match(NET_CONTENTS_PATTERN);
  return m ? { value: parseFloat(m[1]), unit: m[2], match: m[0] } : null;
}

/**
 * Producer anchor. Matched case-insensitively: OCR routinely mangles the
 * case of small print, and the anchor's purpose is locating the producer
 * statement, not enforcing its typography.
 */
export function findProducer(text) {
  const t = (text || '').toLowerCase();
  for (const anchor of PRODUCER_ANCHORS) {
    const idx = t.indexOf(anchor.toLowerCase());
    if (idx !== -1) return { anchor, index: idx };
  }
  return null;
}
