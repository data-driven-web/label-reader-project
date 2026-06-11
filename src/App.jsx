/**
 * TTB Alcohol Label Verification Tool — application shell and orchestrator.
 *
 * Four-layer pipeline:
 *   Layer 0: Template library classification (Canvas signals, ms)
 *   Layer 1: Zone-based parallel OCR extraction (Tesseract.js)
 *   Layer 2: Tiered validation streaming results as checks complete
 *   Layer 3: Template learning from agent decisions (localStorage)
 *
 * Fully static client-side app: no backend, no env vars, no API keys.
 */
import { useCallback, useRef, useState } from 'react';
import UploadZone from './components/UploadZone.jsx';
import FieldForm from './components/FieldForm.jsx';
import ResultsPanel from './components/ResultsPanel.jsx';
import BatchTable from './components/BatchTable.jsx';
import ErrorMessage from './components/ErrorMessage.jsx';
import ProgressStatus from './components/ProgressStatus.jsx';
import LearningDashboard from './components/LearningDashboard.jsx';
import { classifyLabel } from './utils/templateClassifier.js';
import { extractLabelFields, warmUpOcr } from './utils/ocrEngine.js';
import { validateLabel } from './utils/validator.js';
import { findAbv, findNetContents, findProducer } from './utils/patternAnchors.js';
import { processWithConcurrency } from './utils/batchProcessor.js';
import { pdfToImageBlob } from './utils/imagePreprocessor.js';
import {
  recordApproval, bumpBrandConfidence, adjustZone, learnNewTemplate,
  countLabelProcessed, incrementTotalLabels, getSessionStats
} from './utils/templateLearning.js';
import { TTB_CLASS_TYPES } from './constants/regulations.js';
import { normalizeWhitespace, normalizeLoose } from './utils/fuzzyMatch.js';
import referenceLabels from './data/referenceLabels.json';

/** Run Layers 0-1 on a file. PDFs are rasterized client-side first. */
async function runPipeline(file, onStatus) {
  let source = file;
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
    onStatus('Preparing PDF…');
    source = await pdfToImageBlob(file);
  }
  onStatus('Identifying label type…');
  const classification = await classifyLabel(source);
  const extraction = await extractLabelFields(source, classification.template, { onStatus });
  return { classification, extraction, source };
}

/** Derive form auto-fill values from extraction. */
function autofillFrom(classification, extraction) {
  const { fields, allText } = extraction;
  const values = {};
  const filled = new Set();
  const set = (k, v) => { if (v) { values[k] = v; filled.add(k); } };
  set('brandName', normalizeWhitespace(fields.brandName?.rawText || ''));
  values.beverageType = classification.beverageType;
  const abv = findAbv(allText);
  if (abv) set('abv', String(abv.value));
  const net = findNetContents(allText);
  if (net) set('netContents', net.match);
  const prod = findProducer(fields.producer?.rawText || allText);
  if (prod) {
    const t = normalizeWhitespace((fields.producer?.rawText || allText).slice(prod.index));
    set('producer', t.split('\n')[0].slice(0, 80));
  }
  const origin = allText.match(/product of ([A-Za-z ]{2,30})/i);
  if (origin) set('countryOfOrigin', normalizeWhitespace(origin[1]));
  return { values, filled };
}

/** Application values for batch labels: reference ground truth when the
 * filename is a known test label; otherwise self-extracted values (the
 * structural checks — warning, anchors, required fields — still apply). */
function batchApplication(file, classification, extraction) {
  const ref = referenceLabels.labels.find((l) => l.filename === file.name);
  if (ref) return { application: ref.application, beverageType: ref.beverageType };
  const { values } = autofillFrom(classification, extraction);
  return { application: values, beverageType: classification.beverageType };
}

export default function App() {
  const [mode, setMode] = useState('single');
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [dashboardOpen, setDashboardOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // ---- single-label state ----
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [classification, setClassification] = useState(null);
  const [extraction, setExtraction] = useState(null);
  const [formValues, setFormValues] = useState({ beverageType: 'distilled_spirits' });
  const [autoFilled, setAutoFilled] = useState(new Set());
  const [results, setResults] = useState([]);
  const [validation, setValidation] = useState(null);
  const [action, setAction] = useState(null);

  // ---- batch state ----
  const [rows, setRows] = useState([]);
  const [pendingBatch, setPendingBatch] = useState(null);
  const batchRunning = useRef(false);

  const resetSingle = () => {
    setClassification(null); setExtraction(null); setResults([]);
    setValidation(null); setAction(null); setAutoFilled(new Set());
  };

  // ---------- SINGLE FLOW ----------
  const handleSingleFile = useCallback(async (f) => {
    setError(null); setNotice(null); resetSingle();
    setFile(f);
    setPreviewUrl((old) => { if (old) URL.revokeObjectURL(old); return URL.createObjectURL(f); });
    setBusy(true);
    warmUpOcr();
    try {
      const { classification: cls, extraction: ext } = await runPipeline(f, setStatus);
      setClassification(cls); setExtraction(ext);
      const { values, filled } = autofillFrom(cls, ext);
      setFormValues((prev) => ({ ...prev, ...values }));
      setAutoFilled(filled);
      setStatus('Label read. Check the form below, then press Analyze.');
      if (ext.overallConfidence < 40) {
        setNotice('This label is difficult to read clearly. Results shown are best-attempt with low confidence. Consider re-photographing with better lighting and the label flat against a surface.');
      }
    } catch (e) {
      setStatus('');
      if (e.code === 'TIMEOUT') setError('Analysis is taking longer than expected. Click Retry to try again with the same image.');
      else if (e.code === 'NO_TEXT') setError('No text could be detected in this image. Please ensure the label is clearly visible, well-lit, and fills most of the frame.');
      else if (e.code === 'PDF_UNREADABLE') setError('This PDF does not contain readable image content. Please export the label as JPG or PNG and re-upload.');
      else if (e.code === 'CORRUPTED_FILE') setError('This file appears to be corrupted and cannot be read. Please re-export from the original source and try again.');
      else setError(e.message || 'Something went wrong reading this label.');
    } finally {
      setBusy(false);
    }
  }, []);

  function analyzeSingle() {
    if (!extraction || !classification) return;
    setResults([]); setAction(null);
    setStatus('Checking required statements…');
    const streamed = [];
    const v = validateLabel(
      { extraction, application: formValues, beverageType: formValues.beverageType },
      (r) => { streamed.push(r); setResults([...streamed]); }
    );
    setValidation(v);
    setStatus('');
    countLabelProcessed();
    incrementTotalLabels();
    // Layer 3: high-confidence brand match earns a confidence bump.
    if (classification.brandMatch) bumpBrandConfidence(classification.brandMatch.brandId);
    setRefreshKey((k) => k + 1);
  }

  function handleAction(a) {
    setAction(a);
    if (a === 'approved' && validation && classification) {
      // Confidence feedback loop: log every approved yellow flag.
      for (const r of validation.results.filter((x) => x.risk === 'yellow')) {
        const zone = classification.template.zones[r.field] || null;
        recordApproval({
          brandIdentified: classification.brandMatch?.brandName,
          fieldName: r.field,
          extractedValue: r.labelValue,
          applicationValue: r.applicationValue,
          similarityScore: (r.detail?.similarity ?? null) != null ? r.detail.similarity / 100 : null,
          beverageType: formValues.beverageType,
          zoneCoordinates: zone ? { x: zone.x, y: zone.y, width: zone.width, height: zone.height } : null
        });
        if (classification.brandMatch && zone) adjustZone(classification.brandMatch.brandId, r.field, zone);
      }
      // Unknown brand processed successfully: learn a new template.
      if (!classification.brandMatch && formValues.brandName) {
        learnNewTemplate({
          brandName: formValues.brandName,
          beverageType: formValues.beverageType,
          signals: classification.signals,
          zones: Object.fromEntries(Object.entries(classification.template.zones)
            .map(([k, z]) => [k, { x: z.x, y: z.y, width: z.width, height: z.height }])),
          confidence: extraction?.overallConfidence
        });
      }
    }
    setRefreshKey((k) => k + 1);
  }

  // ---------- BATCH FLOW ----------
  function handleBatchFiles(files) {
    setError(null); setNotice(null);
    if (files.length > 200) {
      setPendingBatch({ files, message: `Your batch contains ${files.length} files. Processing large batches may take several minutes. Continue?` });
      return;
    }
    if (files.length > 50) {
      setPendingBatch({ files, message: `This batch contains ${files.length} files. Start processing?` });
      return;
    }
    startBatch(files);
  }

  async function startBatch(files) {
    setPendingBatch(null);
    batchRunning.current = true;
    warmUpOcr();
    const startedAt = Date.now();
    setRows(files.map((f) => ({
      filename: f.name, overall: 'processing', startedAt, brandIdentified: null,
      counts: null, action: null, timestamp: null, results: null, brandMatch: null
    })));
    const update = (name, patch) => setRows((prev) =>
      prev.map((r) => (r.filename === name ? { ...r, ...patch } : r)));

    await processWithConcurrency(files, async (f) => {
      try {
        const err = (await import('./components/UploadZone.jsx')).checkFile(f);
        if (err) throw new Error(err);
        const { classification: cls, extraction: ext } = await runPipeline(f, () => {});
        const { application, beverageType } = batchApplication(f, cls, ext);
        const v = validateLabel({ extraction: ext, application, beverageType });
        countLabelProcessed();
        incrementTotalLabels();
        if (cls.brandMatch) bumpBrandConfidence(cls.brandMatch.brandId);
        update(f.name, {
          overall: v.overall, counts: v.counts, results: v.results,
          brandMatch: cls.brandMatch, brandIdentified: cls.brandMatch?.brandName,
          timestamp: new Date().toISOString()
        });
      } catch (e) {
        update(f.name, {
          overall: 'error', timestamp: new Date().toISOString(),
          error: e.code === 'NO_TEXT'
            ? 'No text could be detected in this image. Please ensure the label is clearly visible, well-lit, and fills most of the frame.'
            : e.code === 'TIMEOUT'
              ? 'Analysis is taking longer than expected. Click Retry to try again with the same image.'
              : e.message
        });
      } finally {
        setRefreshKey((k) => k + 1);
      }
    });
    batchRunning.current = false;
  }

  function approveAllGreen() {
    setRows((prev) => prev.map((r) => (r.overall === 'green' && !r.action ? { ...r, action: 'approved' } : r)));
  }

  function rowAction(row, a) {
    setRows((prev) => prev.map((r) => (r.filename === row.filename ? { ...r, action: a } : r)));
    if (a === 'approved' && row.results) {
      for (const r of row.results.filter((x) => x.risk === 'yellow')) {
        recordApproval({
          brandIdentified: row.brandIdentified, fieldName: r.field,
          extractedValue: r.labelValue, applicationValue: r.applicationValue,
          similarityScore: r.detail?.similarity != null ? r.detail.similarity / 100 : null,
          beverageType: 'unknown', zoneCoordinates: null
        });
      }
    }
    setRefreshKey((k) => k + 1);
  }

  const session = getSessionStats();

  return (
    <div className="min-h-screen bg-white">
      <header className="bg-navy-700 text-white px-6 py-4">
        <div className="mx-auto max-w-6xl flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-semibold">TTB Label Verification Tool</h1>
            <p className="text-sm text-navy-100">Alcohol and Tobacco Tax and Trade Bureau — Label Review Prototype</p>
            <p className="text-xs text-navy-100/70 mt-0.5">Oscar Hernandez — Treasury Assessment</p>
          </div>
          <button onClick={() => setDashboardOpen(true)}
            className="min-h-[44px] px-4 border border-navy-100/40 rounded text-base hover:bg-navy-600">
            Learning: {session.overridesLogged + session.templatesUpdated} updates this session
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl p-6">
        <UploadZone
          mode={mode}
          onModeChange={(m) => { setMode(m); setError(null); setNotice(null); }}
          onSingleFile={handleSingleFile}
          onBatchFiles={handleBatchFiles}
          onError={setError}
          onNotice={setNotice}
        />

        <ErrorMessage message={error}
          onRetry={file && mode === 'single' ? () => handleSingleFile(file) : undefined}
          onDismiss={() => setError(null)} />
        {notice && (
          <div role="status" className="border-l-4 border-amber-600 bg-amber-50 p-4 my-3 text-base text-amber-900">
            {notice}
            <button onClick={() => setNotice(null)} className="ml-3 underline min-h-[44px]">Dismiss</button>
          </div>
        )}

        {pendingBatch && (
          <div className="border border-navy-200 bg-navy-50 rounded p-4 my-3">
            <p className="text-base text-navy-800">{pendingBatch.message}</p>
            <div className="flex gap-3 mt-3">
              <button onClick={() => startBatch(pendingBatch.files)}
                className="min-h-[44px] px-6 bg-navy-700 text-white text-base font-semibold rounded">Continue</button>
              <button onClick={() => setPendingBatch(null)}
                className="min-h-[44px] px-6 border border-gray-400 text-gray-700 text-base rounded">Cancel</button>
            </div>
          </div>
        )}

        <ProgressStatus message={status} active={Boolean(status)} />

        {/* How it works — fills the first-load empty space and orients new
            users; hidden once a label or batch is on screen. */}
        {((mode === 'single' && !previewUrl) || (mode === 'batch' && rows.length === 0)) && (
          <section aria-label="How it works" className="mt-10">
            <div className="grid sm:grid-cols-3 gap-6">
              {[
                {
                  step: '1', title: 'Upload Label Image',
                  text: 'Drag in a JPG, PNG, or PDF of the label — or a ZIP for a whole batch.',
                  icon: (
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m7 9 5-5 5 5" /><path d="M12 4v12" />
                    </svg>
                  )
                },
                {
                  step: '2', title: 'AI Reads All Zones',
                  text: 'The label is scanned zone by zone in your browser — nothing is sent anywhere.',
                  icon: (
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M3 7V5a2 2 0 0 1 2-2h2" /><path d="M17 3h2a2 2 0 0 1 2 2v2" /><path d="M21 17v2a2 2 0 0 1-2 2h-2" /><path d="M7 21H5a2 2 0 0 1-2-2v-2" /><path d="M7 12h10" />
                    </svg>
                  )
                },
                {
                  step: '3', title: 'Instant Risk Results',
                  text: 'Every field is checked against TTB rules and flagged red, yellow, or green.',
                  icon: (
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  )
                }
              ].map((item) => (
                <div key={item.step} className="border border-gray-200 rounded-lg p-5 text-center">
                  <div className="mx-auto w-12 h-12 rounded-full bg-navy-50 text-navy-700 flex items-center justify-center mb-3">
                    {item.icon}
                  </div>
                  <p className="text-sm font-semibold text-gray-400 uppercase tracking-wide">Step {item.step}</p>
                  <h3 className="text-base font-semibold text-navy-800 mt-1">{item.title}</h3>
                  <p className="text-base text-gray-600 mt-1">{item.text}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {mode === 'single' && previewUrl && (
          <div className="grid lg:grid-cols-2 gap-6 mt-6">
            <div>
              <h2 className="text-lg font-semibold text-navy-700 mb-2">Label preview</h2>
              <p className="text-sm text-gray-500 mb-2">{file?.name}</p>
              <img src={previewUrl} alt="Uploaded label"
                className="max-w-full border border-gray-200 rounded shadow-sm" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-navy-700 mb-2">Application details</h2>
              <p className="text-base text-gray-600 mb-3">
                Yellow fields were read from the label automatically — please check them before analyzing.
              </p>
              <FieldForm values={formValues} autoFilled={autoFilled}
                onChange={(k, v) => {
                  setFormValues((prev) => ({ ...prev, [k]: v }));
                  setAutoFilled((prev) => { const n = new Set(prev); n.delete(k); return n; });
                }}
                onAnalyze={analyzeSingle} disabled={busy || !extraction} />
            </div>
          </div>
        )}

        {mode === 'single' && results.length > 0 && (
          <div className="mt-6">
            <h2 className="text-lg font-semibold text-navy-700 mb-3">Verification results</h2>
            <ResultsPanel
              results={results} complete={Boolean(validation)}
              brandMatch={classification?.brandMatch}
              unknownBrand={classification && !classification.brandMatch}
              onAction={handleAction} action={action}
              sessionStats={getSessionStats()} />
          </div>
        )}

        {mode === 'batch' && (
          <BatchTable rows={rows} onApproveAllGreen={approveAllGreen} onRowAction={rowAction} />
        )}
      </main>

      <footer className="mx-auto max-w-6xl px-6 pb-8 text-sm text-gray-400">
        Prototype — all processing happens in your browser. No label images leave this computer.
      </footer>

      <LearningDashboard open={dashboardOpen} onClose={() => setDashboardOpen(false)} refreshKey={refreshKey} />
    </div>
  );
}
