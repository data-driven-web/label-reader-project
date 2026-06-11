/**
 * BrandBadge — shown when Layer 0 recognized the brand from the template
 * library, meaning the optimized zone map was used.
 */
export default function BrandBadge({ brandMatch }) {
  if (!brandMatch) return null;
  return (
    <div className="inline-flex items-center gap-2 bg-navy-50 border border-navy-100 text-navy-700 px-3 py-2 rounded text-base">
      <span aria-hidden="true">⚡</span>
      <span>
        Known Brand: <strong>{brandMatch.brandName}</strong> — using optimized zone map
        <span className="text-gray-500"> ({brandMatch.score}% match)</span>
      </span>
    </div>
  );
}
