/**
 * TTB regulatory constants.
 * 27 CFR Part 16 — Health Warning Statement. Part 5 — Distilled Spirits.
 * Part 4 — Wine. Part 7 — Malt Beverages. Federal Alcohol Administration Act.
 */

// Stored verbatim per 27 CFR 16.21. Validation requires ALL CAPS
// "GOVERNMENT WARNING:" with colon, and word-for-word match after
// whitespace normalization.
export const GOVERNMENT_WARNING_TEXT = "GOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects. (2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health problems.";

export const ABV_TOLERANCES = {
  distilled_spirits: 0.3,
  wine: 0.5,
  beer: 0.3
};

export const REQUIRED_FIELDS = {
  distilled_spirits: ["brandName", "classType", "abv", "netContents", "producer", "governmentWarning"],
  wine: ["brandName", "classType", "abv", "netContents", "producer", "governmentWarning"],
  beer: ["brandName", "classType", "netContents", "producer", "governmentWarning"]
};

export const BEER_ABV_OPTIONAL = true;

export const TTB_CLASS_TYPES = {
  distilled_spirits: [
    "Bourbon Whiskey", "Kentucky Straight Bourbon Whiskey", "Tennessee Whiskey",
    "Blended Whiskey", "Scotch Whisky", "Irish Whiskey", "Vodka", "Gin",
    "London Dry Gin", "Rum", "Tequila", "Blanco Tequila", "Reposado Tequila",
    "Añejo Tequila", "Brandy", "Cognac", "Triple Sec", "Mezcal"
  ],
  wine: [
    "Cabernet Sauvignon", "Merlot", "Pinot Noir", "Chardonnay",
    "Sauvignon Blanc", "Pinot Grigio", "Riesling", "Rosé Wine",
    "Sparkling Wine", "Champagne", "Prosecco", "Port Wine", "Sherry"
  ],
  beer: [
    "American Lager", "American Light Lager", "Pale Ale", "India Pale Ale",
    "IPA", "Stout", "Porter", "Wheat Beer", "Hefeweizen", "Pilsner",
    "Amber Ale", "Brown Ale", "Sour Ale", "Belgian Ale", "Bock"
  ]
};

export const FUZZY_THRESHOLDS = {
  green: 92,
  yellow: 75,
  red: 0
};

export const CONFIDENCE_THRESHOLDS = {
  high: 80,
  medium: 60,
  low: 0
};

// Plain-English field names shown to agents — supplemental constant kept
// here so no UI component hard-codes field naming (single source of truth).
export const FIELD_LABELS = {
  brandName: "Brand name",
  classType: "Class / type",
  abv: "Alcohol content (ABV)",
  netContents: "Net contents",
  producer: "Producer statement",
  countryOfOrigin: "Country of origin",
  governmentWarning: "Government Warning"
};
