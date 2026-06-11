/**
 * fuzzyMatch — Levenshtein distance, similarity scoring, and character
 * diffing for Tier 2 comparison and Tier 3 detail expansion.
 * Pure functions, no DOM — unit-testable in Node.
 */

/** Collapse whitespace and trim. Case is preserved (caps are regulatory). */
export function normalizeWhitespace(s) {
  return (s || '').replace(/\s+/g, ' ').trim();
}

/** Uppercased, whitespace-normalized form for case-insensitive comparison. */
export function normalizeLoose(s) {
  return normalizeWhitespace(s).toUpperCase();
}

/** Classic two-row Levenshtein distance. */
export function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++) {
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    prev = curr;
  }
  return prev[b.length];
}

/**
 * Similarity score 0-100. Case-insensitive and whitespace-normalized:
 * brand names differ legitimately in spacing/case on artwork, and OCR is
 * the noise source we are scoring against, not letter case.
 */
export function similarity(a, b) {
  const x = normalizeLoose(a);
  const y = normalizeLoose(b);
  if (!x && !y) return 100;
  if (!x || !y) return 0;
  const dist = levenshtein(x, y);
  const score = Math.round((1 - dist / Math.max(x.length, y.length)) * 100);
  // Punctuation-only differences (e.g. STONE'S vs STONES) score very high
  // on raw Levenshtein but are exactly the discrepancies an agent must
  // review — a missing apostrophe is a real label/application mismatch.
  // Cap them just below the green threshold so they surface as yellow.
  if (score < 100 && stripPunct(x) === stripPunct(y)) {
    return Math.min(score, 91);
  }
  return score;
}

function stripPunct(s) {
  return s.replace(/[^\p{L}\p{N} ]/gu, '');
}

/**
 * Character-by-character diff of two strings (whitespace-normalized).
 * Returns aligned segments [{ text, status: 'same'|'changed'|'added'|'removed' }]
 * built from the Levenshtein alignment so the UI can highlight exactly
 * where the strings diverge.
 */
export function charDiff(extracted, expected) {
  const a = normalizeWhitespace(extracted);
  const b = normalizeWhitespace(expected);
  const m = a.length, n = b.length;
  // Full DP matrix for traceback (fields are short; warning text ~270 chars
  // gives a 270x270 matrix — trivial memory).
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  const ops = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1] && dp[i][j] === dp[i - 1][j - 1]) {
      ops.push({ ch: a[i - 1], status: 'same' }); i--; j--;
    } else if (i > 0 && j > 0 && dp[i][j] === dp[i - 1][j - 1] + 1) {
      ops.push({ ch: a[i - 1], status: 'changed' }); i--; j--;
    } else if (i > 0 && dp[i][j] === dp[i - 1][j] + 1) {
      ops.push({ ch: a[i - 1], status: 'removed' }); i--;
    } else {
      ops.push({ ch: b[j - 1], status: 'added' }); j--;
    }
  }
  ops.reverse();
  // Merge runs into segments.
  const segments = [];
  for (const op of ops) {
    const last = segments[segments.length - 1];
    if (last && last.status === op.status) last.text += op.ch;
    else segments.push({ text: op.ch, status: op.status });
  }
  return segments;
}
