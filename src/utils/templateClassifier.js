/**
 * templateClassifier — Layer 0: template library classification (ms).
 *
 * Before any OCR, extract three cheap Canvas signals (dominant colors from
 * a 10x10 grid, aspect ratio, layout density) and match them against the
 * template library index. A brand match at >=85 confidence loads that
 * brand's stored zone map and skips generic zone calculation; otherwise we
 * fall back to beverage-type heuristics and the category default zone map.
 *
 * Signal extraction needs the DOM; matching (`matchTemplates`) and zone
 * construction are pure functions, unit-testable in Node.
 */
import { REQUIRED_FIELDS } from '../constants/regulations.js';
import library from '../data/templateLibrary.json';
import { loadImage } from './ocrEngine.js';
import { getLearnedTemplates } from './templateLearning.js';

export const BRAND_MATCH_THRESHOLD = 85;

// ---- Category default zone maps (used when no brand match) ----
// Per spec: brand = top 35% center 60%; class/ABV = 35-55% full width;
// producer = 55-80% full width; warning = bottom 20%; net contents and
// country of origin = right 25% middle band.
const DEFAULT_ZONES = {
  brandName: {
    x: 0.20, y: 0.0, width: 0.60, height: 0.35,
    fields: ['brandName'], statusLabel: 'brand name'
  },
  classAbv: {
    x: 0.0, y: 0.35, width: 1.0, height: 0.20,
    fields: ['classType', 'abv'], statusLabel: 'class type and alcohol content'
  },
  producer: {
    x: 0.0, y: 0.55, width: 0.75, height: 0.25,
    fields: ['producer'], statusLabel: 'producer information'
  },
  rightBand: {
    x: 0.75, y: 0.35, width: 0.25, height: 0.45,
    fields: ['netContents', 'countryOfOrigin'], statusLabel: 'net contents'
  },
  governmentWarning: {
    x: 0.0, y: 0.80, width: 1.0, height: 0.20,
    fields: ['governmentWarning'], statusLabel: 'Government Warning'
  }
};

const FIELD_STATUS_LABELS = {
  brandName: 'brand name',
  classType: 'class type',
  abv: 'alcohol content',
  netContents: 'net contents',
  producer: 'producer information',
  governmentWarning: 'Government Warning'
};

/** Convert a brand template's per-field zones into the runtime format. */
export function zonesFromBrandTemplate(brand) {
  const zones = {};
  for (const [field, rect] of Object.entries(brand.zones)) {
    zones[field] = {
      ...rect,
      // The producer statement zone also carries country of origin; brand
      // templates do not store a separate origin zone.
      fields: field === 'producer' ? ['producer', 'countryOfOrigin'] : [field],
      statusLabel: FIELD_STATUS_LABELS[field] || field
    };
  }
  return zones;
}

export function categoryTemplate(beverageType) {
  return {
    id: `default_${beverageType}`,
    displayName: `Category default (${beverageType.replace('_', ' ')})`,
    beverageType,
    requiredFields: REQUIRED_FIELDS[beverageType],
    zones: DEFAULT_ZONES,
    brand: null
  };
}

// ---- Signal extraction (DOM canvas) ----

function toHex(r, g, b) {
  const h = (v) => v.toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

/**
 * Sample a 10x10 grid: top-5 dominant colors (quantized), aspect ratio,
 * and dark-pixel layout density overall and per quadrant.
 */
export async function extractSignals(imageSource) {
  const img = await loadImage(imageSource);
  const width = img.naturalWidth ?? img.width;
  const height = img.naturalHeight ?? img.height;
  const G = 10;
  const canvas = document.createElement('canvas');
  canvas.width = G; canvas.height = G;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, G, G);
  const { data } = ctx.getImageData(0, 0, G, G);

  const buckets = new Map();
  let dark = 0;
  const quadDark = [0, 0, 0, 0];
  for (let i = 0; i < G * G; i++) {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
    // Quantize to 32-step buckets so near-identical shades pool together.
    const q = toHex(Math.min(255, Math.round(r / 32) * 32),
      Math.min(255, Math.round(g / 32) * 32),
      Math.min(255, Math.round(b / 32) * 32));
    buckets.set(q, (buckets.get(q) || 0) + 1);
    const lum = (r + g + b) / 765;
    if (lum < 0.35) {
      dark++;
      const gx = i % G, gy = Math.floor(i / G);
      quadDark[(gy < G / 2 ? 0 : 2) + (gx < G / 2 ? 0 : 1)]++;
    }
  }
  const topColors = [...buckets.entries()]
    .sort((a, b) => b[1] - a[1]).slice(0, 5).map(([hex]) => hex);

  return {
    width, height,
    aspectRatio: width / height,
    topColors,
    layoutDensity: dark / (G * G),
    quadrantDensity: quadDark.map((d) => d / (G * G / 4))
  };
}

// ---- Pure matching logic ----

function hexToRgb(hex) {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

function colorDistance(a, b) {
  const [r1, g1, b1] = hexToRgb(a), [r2, g2, b2] = hexToRgb(b);
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
}

/** 0-100: how well the sampled palette covers the template's fingerprint. */
function colorScore(sampled, fingerprint) {
  if (!sampled.length || !fingerprint.length) return 0;
  const per = fingerprint.slice(0, 3).map((fc) => {
    const best = Math.min(...sampled.map((sc) => colorDistance(sc, fc)));
    return Math.max(0, 100 - (best / 130) * 100); // 130 ≈ "clearly different"
  });
  return per.reduce((a, b) => a + b, 0) / per.length;
}

/**
 * Score every template against the extracted signals.
 * Returns ranked candidates: [{ template, score, components }].
 */
export function matchTemplates(signals, templates) {
  return templates.map((t) => {
    const aspectDelta = Math.abs(signals.aspectRatio - t.aspectRatio) / t.aspectRatio;
    const aspect = Math.max(0, 100 - aspectDelta * 250);
    const color = colorScore(signals.topColors, t.colorProfile);
    const density = Math.max(0, 100 - Math.abs(signals.layoutDensity - t.layoutDensity) * 300);
    // Color and aspect dominate: they are the most stable signals across
    // photography conditions. Density varies with crop/margins, so it gets
    // the smallest weight.
    const score = Math.round(0.45 * color + 0.35 * aspect + 0.20 * density);
    return { template: t, score, components: { color: Math.round(color), aspect: Math.round(aspect), density: Math.round(density) } };
  }).sort((a, b) => b.score - a.score);
}

/** Beverage-type heuristic used when no brand clears the threshold. */
export function heuristicBeverageType(signals) {
  const { aspectRatio, topColors, layoutDensity } = signals;
  const rgb = topColors.map(hexToRgb);
  const warm = rgb.filter(([r, g, b]) => r > g && r > b).length / (rgb.length || 1);
  const light = rgb.filter(([r, g, b]) => (r + g + b) / 765 > 0.6).length / (rgb.length || 1);
  // Beer labels skew landscape/square; wine labels skew light + warm
  // portrait; spirits labels skew dark portrait.
  if (aspectRatio >= 1.0) return 'beer';
  if (light >= 0.6 && warm >= 0.4) return 'wine';
  if (layoutDensity > 0.45) return 'distilled_spirits';
  return aspectRatio > 0.72 ? 'wine' : 'distilled_spirits';
}

// ---- Session cache ----
const sessionCache = new Map();
export function clearTemplateCache() { sessionCache.clear(); }

function cacheKey(s) {
  return `${s.width}x${s.height}|${s.topColors.slice(0, 2).join(',')}`;
}

/**
 * Layer 0 entry point.
 * @returns {{ template, beverageType, brandMatch, candidates, signals, cached }}
 */
export async function classifyLabel(imageSource, { useCache = true } = {}) {
  const signals = await extractSignals(imageSource);
  const key = cacheKey(signals);
  if (useCache && sessionCache.has(key)) {
    return { ...sessionCache.get(key), cached: true };
  }

  const allTemplates = [...library.templates, ...getLearnedTemplates()];
  const ranked = matchTemplates(signals, allTemplates);
  const candidates = ranked.slice(0, 3).map((c) => ({
    brandId: c.template.brandId, brandName: c.template.brandName,
    score: c.score, components: c.components
  }));

  let out;
  if (ranked[0] && ranked[0].score >= BRAND_MATCH_THRESHOLD) {
    const brand = ranked[0].template;
    out = {
      template: {
        id: brand.brandId,
        displayName: brand.brandName,
        beverageType: brand.beverageType,
        requiredFields: REQUIRED_FIELDS[brand.beverageType],
        zones: zonesFromBrandTemplate(brand),
        brand
      },
      beverageType: brand.beverageType,
      brandMatch: { brandId: brand.brandId, brandName: brand.brandName, score: ranked[0].score },
      candidates, signals, cached: false
    };
  } else {
    const beverageType = heuristicBeverageType(signals);
    out = {
      template: categoryTemplate(beverageType),
      beverageType,
      brandMatch: null, // unknown brand — surfaced as a yellow note in UI
      candidates, signals, cached: false
    };
  }
  sessionCache.set(key, out);
  return out;
}
