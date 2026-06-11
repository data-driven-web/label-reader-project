/**
 * FieldDetail — Tier 3 detail expansion. Presents data already collected:
 * raw extracted text, application value, character diff, confidence, zone.
 */
export default function FieldDetail({ detail }) {
  if (!detail) return null;
  return (
    <div className="mt-3 bg-gray-50 border border-gray-200 rounded p-4 text-base space-y-3">
      <div className="grid md:grid-cols-2 gap-3">
        <div>
          <p className="font-semibold text-gray-600 text-sm uppercase tracking-wide">What the label says (as read)</p>
          <p className="mt-1 whitespace-pre-wrap break-words">{detail.rawText || '(nothing readable)'}</p>
        </div>
        <div>
          <p className="font-semibold text-gray-600 text-sm uppercase tracking-wide">What it should say</p>
          <p className="mt-1 whitespace-pre-wrap break-words">{detail.expected || '(not provided)'}</p>
        </div>
      </div>
      {detail.diff && (
        <div>
          <p className="font-semibold text-gray-600 text-sm uppercase tracking-wide">Exactly where they differ</p>
          <p className="mt-1 leading-relaxed break-words">
            {detail.diff.map((seg, i) =>
              seg.status === 'same'
                ? <span key={i}>{seg.text}</span>
                : <mark key={i} className={
                    seg.status === 'added' ? 'bg-green-100 underline decoration-green-600' :
                    'bg-red-100 underline decoration-red-600'
                  }>{seg.text}</mark>
            )}
          </p>
          <p className="text-sm text-gray-500 mt-1">
            Red highlight = on the label but wrong or extra. Green highlight = required but missing from the label.
          </p>
        </div>
      )}
      <div className="flex flex-wrap gap-x-8 gap-y-1 text-sm text-gray-600 pt-1 border-t border-gray-200">
        {detail.similarity != null && <span>Similarity: <strong>{detail.similarity}%</strong></span>}
        {detail.confidence != null && <span>Reading confidence: <strong>{Math.round(detail.confidence)}%</strong></span>}
        {detail.zone && <span>Read from: <strong>{detail.zone}</strong> area of the label</span>}
      </div>
    </div>
  );
}
