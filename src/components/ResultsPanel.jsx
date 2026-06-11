/**
 * ResultsPanel — streaming results display.
 * Red flags pinned to the top the moment they arrive, yellow in the middle,
 * green passes collapsed to a single expandable line. Action buttons with
 * keyboard shortcuts (A approve / R reject / F flag).
 */
import { useEffect, useState } from 'react';
import FieldDetail from './FieldDetail.jsx';
import BrandBadge from './BrandBadge.jsx';

const RISK_STYLES = {
  red: { border: 'border-red-600', bg: 'bg-red-50', label: 'Needs action', text: 'text-red-800' },
  yellow: { border: 'border-amber-600', bg: 'bg-amber-50', label: 'Please review', text: 'text-amber-800' },
  green: { border: 'border-green-600', bg: 'bg-green-50', label: 'Passed', text: 'text-green-800' }
};

function Flag({ r }) {
  const [open, setOpen] = useState(false);
  const s = RISK_STYLES[r.risk];
  return (
    <div className={`border-l-4 ${s.border} ${s.bg} p-4 rounded-r`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className={`font-semibold text-base ${s.text}`}>{r.fieldLabel}</p>
          <p className="text-base text-gray-800 mt-1">{r.explanation}</p>
          {(r.labelValue || r.applicationValue) && (
            <div className="mt-2 text-base text-gray-700 grid sm:grid-cols-2 gap-x-6 gap-y-1">
              {r.labelValue && <p><span className="text-gray-500">Label says:</span> {String(r.labelValue).slice(0, 120)}</p>}
              {r.applicationValue && <p><span className="text-gray-500">Application says:</span> {String(r.applicationValue).slice(0, 120)}</p>}
            </div>
          )}
        </div>
        {r.detail && (
          <button onClick={() => setOpen(!open)}
            className="min-h-[44px] shrink-0 px-4 border border-gray-400 rounded text-base text-gray-700 bg-white hover:bg-gray-100">
            {open ? 'Hide Detail' : 'Show Detail'}
          </button>
        )}
      </div>
      {open && <FieldDetail detail={r.detail} />}
    </div>
  );
}

export default function ResultsPanel({ results, complete, brandMatch, unknownBrand, onAction, action, sessionStats }) {
  const [greensOpen, setGreensOpen] = useState(false);
  const reds = results.filter((r) => r.risk === 'red');
  const yellows = results.filter((r) => r.risk === 'yellow');
  const greens = results.filter((r) => r.risk === 'green');
  const total = results.length;

  // Keyboard shortcuts, active once the scan is complete and undecided.
  useEffect(() => {
    if (!complete || action) return undefined;
    const handler = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;
      const k = e.key.toLowerCase();
      if (k === 'a') onAction('approved');
      if (k === 'r') onAction('rejected');
      if (k === 'f') onAction('flagged');
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [complete, action, onAction]);

  if (!results.length && !complete) return null;

  return (
    <section aria-label="Verification results" className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <BrandBadge brandMatch={brandMatch} />
        {unknownBrand && (
          <span className="inline-flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-800 px-3 py-2 rounded text-base">
            Brand not in template library — standard zone layout used
          </span>
        )}
      </div>

      {reds.map((r) => <Flag key={r.id} r={r} />)}
      {yellows.map((r) => <Flag key={r.id} r={r} />)}

      {greens.length > 0 && (
        <div className="border-l-4 border-green-600 bg-green-50 rounded-r">
          <button onClick={() => setGreensOpen(!greensOpen)}
            className="w-full min-h-[44px] flex items-center justify-between px-4 py-3 text-left">
            <span className="text-base font-semibold text-green-800">
              {greens.length} of {total} checks passed
            </span>
            <span className="text-green-800 text-xl" aria-hidden="true">{greensOpen ? '▲' : '▼'}</span>
          </button>
          {greensOpen && (
            <div className="px-4 pb-4 space-y-2">
              {greens.map((r) => <Flag key={r.id} r={r} />)}
            </div>
          )}
        </div>
      )}

      {complete && (
        <div className="pt-2">
          {action ? (
            <p className="text-base font-semibold text-navy-700">
              Decision recorded: {action === 'approved' ? 'Approved' : action === 'rejected' ? 'Rejected' : 'Flagged for review'}.
            </p>
          ) : (
            <div className="flex flex-wrap gap-3">
              <button onClick={() => onAction('approved')}
                className="min-h-[44px] px-6 bg-green-600 text-white text-base font-semibold rounded hover:bg-green-700">
                Approve <span className="font-normal text-green-100 text-sm ml-1">(press A)</span>
              </button>
              <button onClick={() => onAction('flagged')}
                className="min-h-[44px] px-6 bg-amber-600 text-white text-base font-semibold rounded hover:bg-amber-700">
                Flag for Review <span className="font-normal text-amber-100 text-sm ml-1">(press F)</span>
              </button>
              <button onClick={() => onAction('rejected')}
                className="min-h-[44px] px-6 bg-red-600 text-white text-base font-semibold rounded hover:bg-red-700">
                Reject <span className="font-normal text-red-100 text-sm ml-1">(press R)</span>
              </button>
            </div>
          )}
        </div>
      )}

      {sessionStats && (
        <p className="text-sm text-gray-500 pt-2 border-t border-gray-200">
          Session: {sessionStats.labelsProcessed} label{sessionStats.labelsProcessed === 1 ? '' : 's'} processed,{' '}
          {sessionStats.templatesUpdated} brand template{sessionStats.templatesUpdated === 1 ? '' : 's'} updated
        </p>
      )}
    </section>
  );
}
