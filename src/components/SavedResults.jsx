/**
 * SavedResults — persistent results browser (nav-bar accessible).
 *
 * Saved labels are classified into three sections for fast review:
 * Approved / Passed, Needs Review, Needs Action. Records persist across
 * sessions in this browser. When a previously saved label is re-analyzed
 * (e.g. a corrected artwork version with the same filename), it is
 * re-scored and moved to the right section automatically, with version
 * history retained.
 */
import { useState } from 'react';
import {
  getSavedResults, sectionOf, removeSavedResult, clearSavedResults
} from '../utils/resultsStore.js';

const SECTIONS = [
  { id: 'needsAction', title: 'Needs Action', style: 'border-red-600 bg-red-50 text-red-800' },
  { id: 'review', title: 'Needs Review', style: 'border-amber-600 bg-amber-50 text-amber-800' },
  { id: 'approved', title: 'Approved / Passed', style: 'border-green-600 bg-green-50 text-green-800' }
];

export default function SavedResults({ open, onClose, refreshKey }) {
  const [, force] = useState(0);
  if (!open) return null;
  void refreshKey;
  const all = getSavedResults();
  return (
    <div className="fixed inset-0 bg-black/40 flex items-start justify-center p-4 sm:p-6 z-50 overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full p-6 my-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-xl font-semibold text-navy-800">Saved Results</h2>
          <button onClick={onClose} aria-label="Close"
            className="min-h-[44px] min-w-[44px] text-2xl text-gray-500 hover:text-gray-800">×</button>
        </div>
        <p className="text-sm text-gray-500 mb-4">
          Saved on this computer and kept between sessions. Re-analyzing a saved label —
          for example a corrected version of artwork that failed before — updates its
          record and moves it to the right section automatically.
        </p>
        {all.length === 0 && (
          <p className="text-base text-gray-600 py-6 text-center">
            No saved results yet. Analyze a label and press “Save Result”, or use
            “Save Results” above the batch table.
          </p>
        )}
        {SECTIONS.map((sec) => {
          const items = all.filter((e) => sectionOf(e) === sec.id);
          if (!items.length) return null;
          return (
            <section key={sec.id} className="mb-5">
              <h3 className={`inline-block border-l-4 px-3 py-1 rounded-r text-base font-semibold ${sec.style}`}>
                {sec.title} ({items.length})
              </h3>
              <ul className="mt-2 divide-y divide-gray-100 border border-gray-200 rounded">
                {items.map((e) => (
                  <li key={e.filename} className="flex items-center gap-4 p-3">
                    {e.thumb ? (
                      <img src={e.thumb} alt="" className="w-14 h-14 object-contain border border-gray-200 rounded bg-white" />
                    ) : (
                      <div className="w-14 h-14 border border-gray-200 rounded bg-gray-50" aria-hidden="true" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-base font-medium text-navy-800 truncate">{e.filename}</p>
                      <p className="text-sm text-gray-500">
                        {e.brandIdentified ? `${e.brandIdentified} · ` : ''}
                        {e.counts ? `${e.counts.red} red / ${e.counts.yellow} yellow / ${e.counts.green} green · ` : ''}
                        last checked {new Date(e.lastChecked).toLocaleString()}
                        {e.history && e.history.length > 1 ? ` · ${e.history.length} versions checked` : ''}
                      </p>
                    </div>
                    <button onClick={() => { removeSavedResult(e.filename); force((n) => n + 1); }}
                      className="min-h-[44px] px-3 text-sm border border-gray-300 rounded text-gray-600 hover:bg-gray-100">
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
        {all.length > 0 && (
          <button onClick={() => { clearSavedResults(); force((n) => n + 1); }}
            className="min-h-[44px] px-4 text-sm border border-gray-300 rounded text-gray-600 hover:bg-gray-100">
            Clear all saved results
          </button>
        )}
      </div>
    </div>
  );
}
