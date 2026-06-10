/**
 * ocrEngine — Tesseract.js wrapper and zone extraction (Layer 2).
 * Divides the image into template-defined zones and OCRs them in parallel
 * with Promise.all. Each zone returns { text, confidence }.
 * Implemented in Step 2.
 */
