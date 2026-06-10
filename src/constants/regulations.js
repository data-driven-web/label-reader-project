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
export const ABV_TOLERANCES = {
  distilled_spirits: 0.3,
  wine: 0.5,
  beer: 0.5
};

// Required fields by beverage type. ABV is optional on malt beverages
// (27 CFR Part 7): its absence on a beer label is a yellow flag, not red.
export const REQUIRED_FIELDS = {
  distilled_spirits: ['brandName', 'classType', 'abv', 'netContents', 'producer', 'governmentWarning'],
  wine: ['brandName', 'classType', 'abv', 'netContents', 'producer', 'governmentWarning'],
  beer: ['brandName', 'classType', 'netContents', 'producer', 'governmentWarning']
};

// Plain-English field names shown to agents — no technical jargon.
export const FIELD_LABELS = {
  brandName: 'Brand name',
  classType: 'Class / type',
  abv: 'Alcohol content (ABV)',
  netContents: 'Net contents',
  producer: 'Producer statement',
  countryOfOrigin: 'Country of origin',
  governmentWarning: 'Government Warning'
};

// TTB approved class/type designations (representative subset per
// 27 CFR 5.22, 4.21, and 7.24 — full COLA list integration is a
// Phase 2 roadmap item).
export const APPROVED_CLASS_TYPES = {
  distilled_spirits: [
    'BOURBON WHISKEY', 'STRAIGHT BOURBON WHISKEY', 'RYE WHISKEY', 'WHISKEY',
    'VODKA', 'GIN', 'RUM', 'TEQUILA', 'BRANDY', 'LIQUEUR', 'CORDIAL'
  ],
  wine: [
    'RED WINE', 'WHITE WINE', 'ROSE WINE', 'TABLE WINE', 'SPARKLING WINE',
    'CABERNET SAUVIGNON', 'CHARDONNAY', 'PINOT NOIR', 'MERLOT', 'RIESLING'
  ],
  beer: [
    'BEER', 'ALE', 'LAGER', 'STOUT', 'PORTER', 'INDIA PALE ALE', 'IPA',
    'PILSNER', 'WHEAT BEER', 'MALT LIQUOR'
  ]
};
