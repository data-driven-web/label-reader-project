/**
 * validator — Layer 2: tiered validation and risk scoring.
 *
 * Tier 1 (pattern anchors) runs synchronously in milliseconds; each finding
 * is pushed to the UI via onResult the moment it is produced. Tier 2
 * (rule-based comparison) follows. Tier 3 is not a separate computation —
 * every result carries a `detail` payload (raw text, application value,
 * char diff, confidence, zone) that the UI expands on demand.
 *
 * Pure functions, no DOM — the full pipeline is testable in Node.
 */
import {
  GOVERNMENT_WARNING_TEXT, ABV_TOLERANCES, REQUIRED_FIELDS,
  TTB_CLASS_TYPES, FUZZY_THRESHOLDS, CONFIDENCE_THRESHOLDS, FIELD_LABELS
} from '../constants/regulations.js';
import {
  findWarningAnchor, findWarningLoose, findAbv, findNetContents, findProducer
} from './patternAnchors.js';
import { similarity, charDiff, normalizeWhitespace, normalizeLoose } from './fuzzyMatch.js';

export const RISK = { RED: 'red', YELLOW: 'yellow', GREEN: 'green' };

function result(field, risk, explanation, extra = {}) {
  return {
    id: `${field}-${extra.checkId || 'check'}`,
    field,
    fieldLabel: FIELD_LABELS[field] || field,
    risk,
    explanation,
    labelValue: extra.labelValue ?? '',
    applicationValue: extra.applicationValue ?? '',
    tier: extra.tier ?? 2,
    detail: extra.detail ?? null
  };
}

/** Pull the warning sentence out of zone text (tolerates leading noise). */
function extractWarningText(zoneText) {
  const m = (zoneText || '').match(/government\s+warning/i);
  if (!m) return null;
  return normalizeWhitespace(zoneText.slice(m.index));
}

/** Describe HOW the extracted warning deviates — named violations first. */
function describeWarningViolation(extracted, expected) {
  const norm = normalizeWhitespace(extracted);
  if (/^Government Warning/i.test(norm) && !norm.startsWith('GOVERNMENT WARNING')) {
    return 'The words "GOVERNMENT WARNING" are not in all capital letters (they appear in title case). Federal rules require all capitals.';
  }
  if (/^GOVERNMENT WARNING(?!:)/.test(norm)) {
    return 'The colon (:) immediately after "GOVERNMENT WARNING" is missing.';
  }
  const normLoose = normalizeLoose(norm);
  const expLoose = normalizeLoose(expected);
  if (expLoose.startsWith(normLoose) && normLoose.length < expLoose.length * 0.95) {
    return 'The warning text is cut short — it does not include the complete required statement.';
  }
  // Word-level substitution check.
  const got = normLoose.split(' ');
  const want = expLoose.split(' ');
  if (got.length === want.length) {
    const idx = want.findIndex((w, i) => w !== got[i]);
    if (idx !== -1) {
      return `The warning text differs from the required wording: expected "${want[idx]}" but the label reads "${got[idx]}".`;
    }
  }
  return 'The warning text does not match the required federal wording exactly.';
}

/**
 * Run the full tiered validation.
 *
 * @param {object} args
 * @param {object} args.extraction  result of extractLabelFields (zones, fields, allText)
 * @param {object} args.application agent-entered application values
 * @param {string} args.beverageType distilled_spirits | wine | beer
 * @param {object} [args.brandMatch] Layer 0 brand match info (or null)
 * @param {(r: object) => void} [onResult] streaming callback per finding
 * @returns {{ results, overall, counts }}
 */
export function validateLabel({ extraction, application, beverageType }, onResult = () => {}) {
  const results = [];
  const push = (r) => { results.push(r); onResult(r); };
  const { fields, allText } = extraction;
  const required = REQUIRED_FIELDS[beverageType] || REQUIRED_FIELDS.distilled_spirits;
  const missing = new Set();

  // ---------- TIER 1: pattern anchors (milliseconds) ----------
  const warningPresent = findWarningAnchor(allText);
  const warningLoose = findWarningLoose(allText);
  if (!warningPresent && !warningLoose) {
    missing.add('governmentWarning');
    push(result('governmentWarning', RISK.RED,
      'The required Government Warning statement was not found anywhere on this label.',
      { tier: 1, checkId: 'anchor', applicationValue: 'Required on every label',
        detail: { rawText: fields.governmentWarning?.rawText || '', zone: 'governmentWarning',
          confidence: fields.governmentWarning?.confidence ?? 0 } }));
  }

  const abvFound = findAbv(allText);
  if (!abvFound) {
    missing.add('abv');
    const optional = beverageType === 'beer' ||
      (beverageType === 'wine' && Number(application.abv) < 7);
    push(result('abv', optional ? RISK.YELLOW : RISK.RED,
      optional
        ? 'No alcohol content was found on the label. ABV is optional for this product, but worth confirming by eye.'
        : 'No alcohol content (ABV) was found anywhere on this label. This is a required field.',
      { tier: 1, checkId: 'anchor', applicationValue: application.abv ? `${application.abv}%` : '',
        detail: { rawText: fields.abv?.rawText || '', zone: fields.abv?.zone,
          confidence: fields.abv?.confidence ?? 0 } }));
  }

  const netFound = findNetContents(allText);
  if (!netFound) {
    missing.add('netContents');
    push(result('netContents', RISK.RED,
      'No net contents (such as "750 mL" or "12 fl oz") was found on this label. This is a required field.',
      { tier: 1, checkId: 'anchor', applicationValue: application.netContents || '',
        detail: { rawText: fields.netContents?.rawText || '', zone: fields.netContents?.zone,
          confidence: fields.netContents?.confidence ?? 0 } }));
  }

  const producerFound = findProducer(allText);
  const producerZoneText = normalizeWhitespace(fields.producer?.rawText || '');
  if (!producerFound) {
    if (!producerZoneText) {
      missing.add('producer');
      push(result('producer', RISK.RED,
        'No producer statement was found on this label. This is a required field.',
        { tier: 1, checkId: 'anchor', applicationValue: application.producer || '' }));
    } else {
      // Text exists in the producer zone but no standard anchor phrase —
      // spec: yellow for agent review (not a hard missing-field red).
      push(result('producer', RISK.YELLOW,
        'The label has producer text, but no standard phrase like "Bottled by" or "Distilled by" was found. Please review.',
        { tier: 1, checkId: 'anchor', labelValue: producerZoneText,
          applicationValue: application.producer || '',
          detail: { rawText: producerZoneText, zone: 'producer',
            confidence: fields.producer?.confidence ?? 0 } }));
    }
  }

  // Brand name presence (required field checklist).
  const brandZoneText = normalizeWhitespace(fields.brandName?.rawText || '');
  if (required.includes('brandName') && !brandZoneText) {
    missing.add('brandName');
    push(result('brandName', RISK.RED,
      'No brand name could be read from the top of this label. This is a required field.',
      { tier: 1, checkId: 'anchor', applicationValue: application.brandName || '' }));
  }

  // Class/type presence.
  const classZoneText = normalizeWhitespace(fields.classType?.rawText || '');
  if (required.includes('classType') && !classZoneText) {
    missing.add('classType');
    push(result('classType', RISK.RED,
      'No class or type designation (such as "Bourbon Whiskey") was found. This is a required field.',
      { tier: 1, checkId: 'anchor', applicationValue: application.classType || '' }));
  }

  // ---------- TIER 2: rule-based comparison (<1s) ----------

  // Government Warning full-text comparison.
  if (warningPresent || warningLoose) {
    const warningText = extractWarningText(fields.governmentWarning?.rawText || allText);
    const expected = normalizeWhitespace(GOVERNMENT_WARNING_TEXT);
    if (warningText === expected) {
      push(result('governmentWarning', RISK.GREEN,
        'Government Warning matches the required federal wording exactly.',
        { checkId: 'fulltext', labelValue: 'Exact match',
          applicationValue: 'Required wording (27 CFR 16.21)',
          detail: { rawText: warningText, expected, zone: 'governmentWarning',
            confidence: fields.governmentWarning?.confidence ?? 0,
            similarity: 100 } }));
    } else {
      const sim = similarity(warningText || '', expected);
      push(result('governmentWarning', RISK.RED,
        describeWarningViolation(warningText || '', expected),
        { checkId: 'fulltext', labelValue: warningText || '',
          applicationValue: expected,
          detail: { rawText: warningText || '', expected, similarity: sim,
            diff: charDiff(warningText || '', expected), zone: 'governmentWarning',
            confidence: fields.governmentWarning?.confidence ?? 0 } }));
    }
  }

  // ABV tolerance comparison.
  if (abvFound && application.abv !== '' && application.abv != null) {
    const appAbv = Number(application.abv);
    const labelAbv = abvFound.value;
    const tolerance = ABV_TOLERANCES[beverageType] ?? 0.3;
    const variance = Math.abs(labelAbv - appAbv);
    const varianceStr = variance.toFixed(1);
    if (variance < 0.05) {
      push(result('abv', RISK.GREEN,
        'Alcohol content on the label matches the application exactly.',
        { checkId: 'tolerance', labelValue: `${labelAbv}%`, applicationValue: `${appAbv}%`,
          detail: { rawText: abvFound.match, zone: fields.abv?.zone,
            confidence: fields.abv?.confidence ?? 0 } }));
    } else if (variance <= tolerance) {
      push(result('abv', RISK.YELLOW,
        `Alcohol content is within the allowed range but not exact: the label shows ${labelAbv}% and the application says ${appAbv}% (difference of ${varianceStr} points; allowed up to ${tolerance}).`,
        { checkId: 'tolerance', labelValue: `${labelAbv}%`, applicationValue: `${appAbv}%`,
          detail: { rawText: abvFound.match, variance, tolerance, zone: fields.abv?.zone,
            confidence: fields.abv?.confidence ?? 0 } }));
    } else {
      push(result('abv', RISK.RED,
        `Alcohol content does not match the application: the label shows ${labelAbv}% but the application says ${appAbv}% — a difference of ${varianceStr} points, more than the allowed ${tolerance}.`,
        { checkId: 'tolerance', labelValue: `${labelAbv}%`, applicationValue: `${appAbv}%`,
          detail: { rawText: abvFound.match, variance, tolerance, zone: fields.abv?.zone,
            confidence: fields.abv?.confidence ?? 0 } }));
    }
  }

  // Brand name fuzzy match.
  if (brandZoneText && application.brandName) {
    const sim = similarity(brandZoneText, application.brandName);
    const detail = {
      rawText: brandZoneText, expected: application.brandName, similarity: sim,
      diff: charDiff(brandZoneText, application.brandName),
      zone: 'brandName', confidence: fields.brandName?.confidence ?? 0
    };
    if (sim >= FUZZY_THRESHOLDS.green) {
      push(result('brandName', RISK.GREEN,
        'Brand name on the label matches the application.',
        { checkId: 'fuzzy', labelValue: brandZoneText,
          applicationValue: application.brandName, detail }));
    } else if (sim >= FUZZY_THRESHOLDS.yellow) {
      push(result('brandName', RISK.YELLOW,
        `Brand name is close but not identical (${sim}% similar). Please check punctuation and spelling.`,
        { checkId: 'fuzzy', labelValue: brandZoneText,
          applicationValue: application.brandName, detail }));
    } else {
      push(result('brandName', RISK.RED,
        `Brand name on the label is very different from the application (only ${sim}% similar).`,
        { checkId: 'fuzzy', labelValue: brandZoneText,
          applicationValue: application.brandName, detail }));
    }
  }

  // Class/type validation against the TTB approved list.
  if (classZoneText) {
    const approved = TTB_CLASS_TYPES[beverageType] || [];
    const hit = approved.find((c) => normalizeLoose(classZoneText).includes(normalizeLoose(c)));
    if (hit) {
      push(result('classType', RISK.GREEN,
        `Class/type "${hit}" is on the TTB approved list for this beverage category.`,
        { checkId: 'approved-list', labelValue: classZoneText,
          applicationValue: application.classType || '',
          detail: { rawText: classZoneText, matched: hit, zone: fields.classType?.zone,
            confidence: fields.classType?.confidence ?? 0 } }));
    } else {
      push(result('classType', RISK.YELLOW,
        'The class/type wording on the label was not found on the TTB approved list for this category. Please review.',
        { checkId: 'approved-list', labelValue: classZoneText,
          applicationValue: application.classType || '',
          detail: { rawText: classZoneText, zone: fields.classType?.zone,
            confidence: fields.classType?.confidence ?? 0 } }));
    }
  }

  // Net contents comparison (when application provides a value).
  if (netFound && application.netContents) {
    const appNet = findNetContents(application.netContents);
    const match = appNet && Math.abs(appNet.value - netFound.value) < 0.01 &&
      appNet.unit.toLowerCase().replace(/\W/g, '') === netFound.unit.toLowerCase().replace(/\W/g, '');
    push(result('netContents', match ? RISK.GREEN : RISK.YELLOW,
      match
        ? 'Net contents on the label matches the application.'
        : `Net contents differs: the label shows "${netFound.match}" but the application says "${application.netContents}". Please review.`,
      { checkId: 'compare', labelValue: netFound.match,
        applicationValue: application.netContents,
        detail: { rawText: fields.netContents?.rawText || '', zone: fields.netContents?.zone,
          confidence: fields.netContents?.confidence ?? 0 } }));
  } else if (netFound) {
    push(result('netContents', RISK.GREEN,
      `Net contents "${netFound.match}" found on the label.`,
      { checkId: 'compare', labelValue: netFound.match }));
  }

  // Producer pass-through when anchor was found.
  if (producerFound) {
    push(result('producer', RISK.GREEN,
      `Producer statement found ("${producerFound.anchor}...").`,
      { checkId: 'anchor-found', labelValue: producerZoneText,
        applicationValue: application.producer || '',
        detail: { rawText: producerZoneText, zone: 'producer',
          confidence: fields.producer?.confidence ?? 0 } }));
  }

  // Confidence checks: critical-field <40 red, 40-70 yellow (any field).
  const seenZones = new Set();
  for (const fieldName of Object.keys(fields)) {
    const f = fields[fieldName];
    if (!f || seenZones.has(f.zone) || missing.has(fieldName)) continue;
    seenZones.add(f.zone);
    const conf = Math.round(f.confidence ?? 0);
    const critical = required.includes(fieldName);
    if (conf < 40 && critical && f.rawText) {
      push(result(fieldName, RISK.RED,
        `This part of the label is very hard to read (${conf}% reading confidence). Please verify it by eye or upload a clearer photo.`,
        { checkId: 'confidence', labelValue: normalizeWhitespace(f.rawText),
          detail: { rawText: f.rawText, confidence: conf, zone: f.zone } }));
    } else if (conf >= 40 && conf < 70 && f.rawText) {
      push(result(fieldName, RISK.YELLOW,
        `This part of the label was read with low confidence (${conf}%). Please double-check the value shown.`,
        { checkId: 'confidence', labelValue: normalizeWhitespace(f.rawText),
          detail: { rawText: f.rawText, confidence: conf, zone: f.zone } }));
    }
  }

  // ---------- Overall risk ----------
  const counts = {
    red: results.filter((r) => r.risk === RISK.RED).length,
    yellow: results.filter((r) => r.risk === RISK.YELLOW).length,
    green: results.filter((r) => r.risk === RISK.GREEN).length
  };
  const overall = counts.red > 0 ? RISK.RED : counts.yellow > 0 ? RISK.YELLOW : RISK.GREEN;
  return { results, overall, counts };
}
