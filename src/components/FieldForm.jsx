/**
 * FieldForm — manual application field entry.
 * Auto-populated values from extraction get a subtle yellow highlight so
 * the agent always knows what the system read versus what they typed.
 */
const FIELDS = [
  { name: 'brandName', label: 'Brand Name', type: 'text' },
  { name: 'beverageType', label: 'Beverage Type', type: 'select',
    options: [
      { value: 'distilled_spirits', label: 'Distilled Spirits' },
      { value: 'wine', label: 'Wine' },
      { value: 'beer', label: 'Beer / Malt Beverage' }
    ] },
  { name: 'abv', label: 'ABV (%)', type: 'number' },
  { name: 'netContents', label: 'Net Contents', type: 'text' },
  { name: 'producer', label: 'Producer Name', type: 'text' },
  { name: 'countryOfOrigin', label: 'Country of Origin', type: 'text' }
];

export default function FieldForm({ values, autoFilled, onChange, onAnalyze, disabled }) {
  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); onAnalyze(); }}>
      <div className="grid sm:grid-cols-2 gap-4">
        {FIELDS.map((f) => {
          const auto = autoFilled.has(f.name);
          const common = `w-full min-h-[44px] border rounded px-3 text-base ${auto ? 'bg-yellow-50 border-yellow-400' : 'border-gray-300'}`;
          return (
            <label key={f.name} className="block">
              <span className="block text-base font-medium text-gray-700 mb-1">
                {f.label}
                {auto && <span className="ml-2 text-sm font-normal text-yellow-700">(read from label — please check)</span>}
              </span>
              {f.type === 'select' ? (
                <select className={common} value={values[f.name] || 'distilled_spirits'}
                  onChange={(e) => onChange(f.name, e.target.value)}>
                  {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              ) : (
                <input className={common} type={f.type} step={f.type === 'number' ? '0.1' : undefined}
                  value={values[f.name] ?? ''} onChange={(e) => onChange(f.name, e.target.value)} />
              )}
            </label>
          );
        })}
      </div>
      <button type="submit" disabled={disabled}
        className="w-full min-h-[52px] bg-navy-700 text-white text-lg font-semibold rounded hover:bg-navy-800 disabled:opacity-50">
        Analyze This Label
      </button>
    </form>
  );
}
