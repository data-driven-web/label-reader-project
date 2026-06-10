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
import { useState } from 'react';
import { classifyLabel } from './utils/templateClassifier.js';
import { extractLabelFields, warmUpOcr } from './utils/ocrEngine.js';

export default function App() {
  // ---- TEMP Step 2 harness: replaced by UploadZone/ResultsPanel in
  // Steps 4-5. Verifies classification + zone extraction on one image. ----
  const [status, setStatus] = useState('');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setResult(null);
    try {
      setStatus('Classifying label type...');
      const t0 = performance.now();
      const classification = await classifyLabel(file);
      const extraction = await extractLabelFields(file, classification.template, {
        onStatus: setStatus
      });
      setStatus(`Done in ${Math.round(performance.now() - t0)}ms`);
      setResult({ classification: { ...classification, template: classification.template.id }, extraction });
    } catch (err) {
      setStatus(`Error: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-white">
      <header className="bg-navy-700 text-white px-6 py-4">
        <h1 className="text-xl font-semibold">TTB Label Verification Tool</h1>
        <p className="text-sm text-navy-100">
          Alcohol and Tobacco Tax and Trade Bureau — Label Review Prototype
        </p>
      </header>
      <main className="mx-auto max-w-5xl p-6 space-y-4">
        <input
          type="file"
          accept="image/png,image/jpeg"
          onChange={handleFile}
          onClick={() => warmUpOcr()}
          disabled={busy}
          className="block min-h-[44px] text-base"
        />
        {status && <p className="text-navy-600 text-base">{status}</p>}
        {result && (
          <pre className="bg-gray-50 border border-gray-200 p-4 text-sm overflow-auto whitespace-pre-wrap">
            {JSON.stringify(result, null, 2)}
          </pre>
        )}
      </main>
    </div>
  );
}
