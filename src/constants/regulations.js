/**
 * TTB regulatory constants.
 * Government Warning: 27 CFR Part 16. Distilled spirits: 27 CFR Part 5.
 * Wine: 27 CFR Part 4. Malt beverages: 27 CFR Part 7.
 */

// Stored verbatim per 27 CFR 16.21. Validation requires ALL CAPS
// "GOVERNMENT WARNING:" with colon, and word-for-word match after
// whitespace normalization.
export const GOVERNMENT_WARNING_TEXT =
  'GOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects. (2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health problems.';

// ABV tolerances by beverage type (percentage points).
// Beer ABV is optional: absence is a yellow flag, not red.
export const ABV_TOLERANCES = {
  distilled_spirits: 0.3,
  wine: 0.5,
  beer: 0.5
};

// Required field lists and TTB approved class types are
// populated in Step 3 alongside the validation pipeline.
export const REQUIRED_FIELDS = {};
export const APPROVED_CLASS_TYPES = {};
