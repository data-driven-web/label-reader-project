/**
 * TTB Alcohol Label Verification Tool — application shell.
 *
 * Three-layer pipeline:
 *   Layer 1: Template classification (Canvas API, milliseconds)
 *   Layer 2: Zone-based parallel OCR extraction (Tesseract.js, 2-3s)
 *   Layer 3: Tiered validation with streaming results (fastest checks first)
 *
 * Fully static client-side app: no backend, no env vars, no API keys.
 */
export default function App() {
  return (
    <div className="min-h-screen bg-white">
      <header className="bg-navy-700 text-white px-6 py-4">
        <h1 className="text-xl font-semibold">TTB Label Verification Tool</h1>
        <p className="text-sm text-navy-100">
          Alcohol and Tobacco Tax and Trade Bureau — Label Review Prototype
        </p>
      </header>
      <main className="mx-auto max-w-5xl p-6">
        {/* Step 5: UploadZone + FieldForm mount here */}
        {/* Step 4: ResultsPanel mounts here */}
        {/* Step 6: BatchTable mounts here */}
        <p className="text-gray-600">Scaffold in place. Pipeline wiring begins in Step 2.</p>
      </main>
    </div>
  );
}
