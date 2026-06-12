/**
 * BatchTable — real-time batch results.
 * Streams rows as labels complete, auto-sorts red > yellow > green,
 * row click expands the full detail view, CSV export works mid-batch.
 */
import { useState } from 'react';
import ResultsPanel from './ResultsPanel.jsx';
import { toCsv, downloadCsv, BATCH_CSV_COLUMNS } from '../utils/csvExport.js';

const ORDER = { red: 0, yellow: 1, green: 2, processing: 3, error: 4 };
const STATUS_BADGE = {
  red: 'bg-red-50 text-red-800 border-red-600',
  yellow: 'bg-amber-50 text-amber-800 border-amber-600',
  green: 'bg-green-50 text-green-800 border-green-600',
  processing: 'bg-gray-50 text-gray-600 border-gray-300',
  error: 'bg-red-50 text-red-800 border-red-600'
};
const STATUS_LABEL = {
  red: 'Needs action', yellow: 'Review', green: 'Pass',
  processing: 'Processing…', error: 'Could not read'
};

export default function BatchTable({ rows, onApproveAllGreen, onRowAction, onSaveResults, saveNotice }) {
  const [expanded, setExpanded] = useState(null);
  if (!rows.length) return null;
  const sorted = [...rows].sort((a, b) =>
    (ORDER[a.overall] ?? 9) - (ORDER[b.overall] ?? 9) || a.filename.localeCompare(b.filename));
  const finished = rows.filter((r) => r.overall !== 'processing');

  function exportCsv() {
    downloadCsv(`ttb-batch-results-${new Date().toISOString().slice(0, 10)}.csv`,
      toCsv(finished, BATCH_CSV_COLUMNS));
  }

  return (
    <section aria-label="Batch results" className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <h2 className="text-lg font-semibold text-navy-700">
          Batch results — {finished.length} of {rows.length} complete
        </h2>
        <div className="flex gap-3 items-center flex-wrap">
          {saveNotice && <span className="text-sm text-navy-700">{saveNotice}</span>}
          <button onClick={onApproveAllGreen}
            className="min-h-[44px] px-5 bg-green-600 text-white text-base font-semibold rounded hover:bg-green-700">
            Approve All Green
          </button>
          <button onClick={() => onSaveResults(rows.filter((r) => r.overall !== 'processing'))}
            className="min-h-[44px] px-5 bg-navy-700 text-white text-base font-semibold rounded hover:bg-navy-800">
            Save Results
          </button>
          <button onClick={exportCsv}
            className="min-h-[44px] px-5 border-2 border-navy-700 text-navy-700 text-base font-semibold rounded hover:bg-navy-50">
            Export CSV
          </button>
        </div>
      </div>
      <div className="overflow-x-auto border border-gray-200 rounded">
        <table className="w-full text-base">
          <thead className="bg-navy-50 text-navy-800">
            <tr>
              {['Label', 'Filename', 'Brand identified', 'Status', 'Red', 'Yellow', 'Green', 'Action', 'Time'].map((h) => (
                <th key={h} className="text-left px-3 py-3 font-semibold whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => (
              <RowGroup key={row.filename + row.startedAt} row={row}
                expanded={expanded === row.filename}
                onToggle={() => setExpanded(expanded === row.filename ? null : row.filename)}
                onRowAction={onRowAction} />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function RowGroup({ row, expanded, onToggle, onRowAction }) {
  return (
    <>
      <tr onClick={onToggle}
        className="border-t border-gray-200 cursor-pointer hover:bg-gray-50">
        <td className="px-3 py-2">
          {row.previewUrl ? (
            <img src={row.previewUrl} alt={`Label ${row.filename}`}
              className="w-12 h-12 object-contain border border-gray-200 rounded bg-white" />
          ) : (
            <div className="w-12 h-12 border border-gray-200 rounded bg-gray-50" aria-hidden="true" />
          )}
        </td>
        <td className="px-3 py-3 font-medium text-navy-800">{row.filename}</td>
        <td className="px-3 py-3">{row.brandIdentified || 'Unknown'}</td>
        <td className="px-3 py-3">
          <span className={`inline-block border-l-4 px-2 py-1 rounded-r text-sm font-semibold ${STATUS_BADGE[row.overall]}`}>
            {STATUS_LABEL[row.overall]}
          </span>
        </td>
        <td className="px-3 py-3 text-red-700 font-semibold">{row.counts?.red ?? '—'}</td>
        <td className="px-3 py-3 text-amber-700 font-semibold">{row.counts?.yellow ?? '—'}</td>
        <td className="px-3 py-3 text-green-700 font-semibold">{row.counts?.green ?? '—'}</td>
        <td className="px-3 py-3">{row.action || '—'}</td>
        <td className="px-3 py-3 text-gray-500 whitespace-nowrap">{row.timestamp?.slice(11, 19) || ''}</td>
      </tr>
      {expanded && row.results && (
        <tr className="border-t border-gray-100 bg-gray-50">
          <td colSpan={9} className="px-4 py-4">
            {row.error ? (
              <p className="text-base text-red-800">{row.error}</p>
            ) : (
              <div className="grid lg:grid-cols-[280px_1fr] gap-5">
                {/* Label preview beside the findings so the agent can
                    confirm an issue or approval by eye, as in single mode. */}
                <div>
                  <p className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-2">Label preview</p>
                  {row.previewUrl ? (
                    <img src={row.previewUrl} alt={`Label ${row.filename}`}
                      className="max-w-full max-h-96 object-contain border border-gray-200 rounded bg-white shadow-sm" />
                  ) : (
                    <p className="text-sm text-gray-500">Preview not available</p>
                  )}
                </div>
                <ResultsPanel
                  results={row.results} complete brandMatch={row.brandMatch}
                  unknownBrand={!row.brandMatch} action={row.action}
                  onAction={(a) => onRowAction(row, a)} />
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
