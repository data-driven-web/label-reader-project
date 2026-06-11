/**
 * templateLearning — Layer 3: template library updates from agent decisions.
 *
 * localStorage-backed for the prototype. Production would replace this with
 * a shared database updated in real time across all agent sessions, seeded
 * from the TTB COLA registry (see README, Registry Integration Strategy).
 * Pure data logic; guards against non-browser environments for testability.
 */

const KEYS = {
  overrides: 'ttb_agent_overrides',
  learned: 'ttb_learned_templates',
  adjusted: 'ttb_template_adjustments',
  stats: 'ttb_cumulative_stats'
};

const hasStorage = typeof localStorage !== 'undefined';

function read(key, fallback) {
  if (!hasStorage) return fallback;
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch { return fallback; }
}
function write(key, value) {
  if (!hasStorage) return;
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* quota */ }
}

// ---- Session counters (reset per page load) ----
const session = { labelsProcessed: 0, templatesUpdated: 0, overridesLogged: 0 };
export function getSessionStats() { return { ...session }; }
export function countLabelProcessed() { session.labelsProcessed += 1; }

// ---- Confidence feedback loop ----

/** Log an agent approval of a yellow-flagged field (spec JSON shape). */
export function recordApproval({ brandIdentified, fieldName, extractedValue, applicationValue, similarityScore, beverageType, zoneCoordinates }) {
  const entry = {
    timestamp: new Date().toISOString(),
    brandIdentified: brandIdentified || 'unknown',
    fieldName, extractedValue, applicationValue,
    similarityScore, beverageType,
    agentDecision: 'approved',
    zoneCoordinates: zoneCoordinates || null
  };
  const all = read(KEYS.overrides, []);
  all.push(entry);
  write(KEYS.overrides, all);
  session.overridesLogged += 1;
  return entry;
}

export function getOverrides() { return read(KEYS.overrides, []); }

// ---- Template library updates ----

/** High-confidence brand match: bump stored confidence by 1 (max 100). */
export function bumpBrandConfidence(brandId) {
  const adj = read(KEYS.adjusted, {});
  const cur = adj[brandId] || { confidenceBonus: 0, zoneOverrides: {} };
  cur.confidenceBonus = Math.min(100, (cur.confidenceBonus || 0) + 1);
  adj[brandId] = cur;
  write(KEYS.adjusted, adj);
  session.templatesUpdated += 1;
}

/**
 * Agent approved a yellow flag: move the stored zone boundary toward the
 * confirmed position with a conservative 80/20 weighted average so one
 * outlier cannot distort a proven template.
 */
export function adjustZone(brandId, fieldName, confirmedRect) {
  if (!confirmedRect) return;
  const adj = read(KEYS.adjusted, {});
  const cur = adj[brandId] || { confidenceBonus: 0, zoneOverrides: {} };
  const prev = cur.zoneOverrides[fieldName] || confirmedRect;
  const blend = (a, b) => Math.round((a * 0.8 + b * 0.2) * 1000) / 1000;
  cur.zoneOverrides[fieldName] = {
    x: blend(prev.x, confirmedRect.x),
    y: blend(prev.y, confirmedRect.y),
    width: blend(prev.width, confirmedRect.width),
    height: blend(prev.height, confirmedRect.height)
  };
  adj[brandId] = cur;
  write(KEYS.adjusted, adj);
  session.templatesUpdated += 1;
}

/** Unknown brand processed successfully: create a new learned template. */
export function learnNewTemplate({ brandName, beverageType, signals, zones, confidence }) {
  if (!brandName) return null;
  const learned = read(KEYS.learned, []);
  const brandId = `learned-${brandName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  if (learned.some((t) => t.brandId === brandId)) return null;
  const template = {
    brandId,
    brandName: brandName.toUpperCase(),
    manufacturer: 'learned from agent session',
    beverageType,
    subcategory: 'learned',
    colorProfile: signals.topColors,
    aspectRatio: signals.aspectRatio,
    layoutDensity: signals.layoutDensity,
    confidenceScore: Math.round(confidence ?? 70),
    approvedCOLA: 'pending verification',
    zones,
    typographySignature: null,
    learned: true
  };
  learned.push(template);
  write(KEYS.learned, learned);
  session.templatesUpdated += 1;
  return template;
}

export function getLearnedTemplates() {
  // Strip runtime-only zone format differences: learned templates store
  // plain rects keyed by field, same as library templates.
  return read(KEYS.learned, []);
}

export function getCumulativeStats(libraryCount) {
  const overrides = read(KEYS.overrides, []);
  const learned = read(KEYS.learned, []);
  const stats = read(KEYS.stats, { totalLabels: 0 });
  return {
    totalLabelsProcessed: stats.totalLabels,
    brandsInLibrary: libraryCount + learned.length,
    learnedTemplates: learned.length,
    overridesLogged: overrides.length,
    // Honest heuristic: each confirmed override sharpens one field zone;
    // diminishing returns curve capped at 15% for the prototype.
    estimatedAccuracyImprovement: `${Math.min(15, Math.round(Math.sqrt(overrides.length) * 2))}%`
  };
}

export function incrementTotalLabels() {
  const stats = read(KEYS.stats, { totalLabels: 0 });
  stats.totalLabels += 1;
  write(KEYS.stats, stats);
}
