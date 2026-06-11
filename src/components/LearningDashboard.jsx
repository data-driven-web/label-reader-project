/**
 * LearningDashboard — cumulative learning summary (nav-bar accessible).
 * Shows totals from localStorage plus the current session.
 */
import library from '../data/templateLibrary.json';
import { getCumulativeStats, getSessionStats } from '../utils/templateLearning.js';

export default function LearningDashboard({ open, onClose, refreshKey }) {
  if (!open) return null;
  // refreshKey forces re-read after each processed label
  void refreshKey;
  const stats = getCumulativeStats(library.totalTemplates);
  const session = getSessionStats();
  const items = [
    ['Labels processed (all time)', stats.totalLabelsProcessed],
    ['Brands in template library', stats.brandsInLibrary],
    ['Templates learned from sessions', stats.learnedTemplates],
    ['Agent overrides logged', stats.overridesLogged],
    ['Estimated accuracy improvement', stats.estimatedAccuracyImprovement],
    ['This session: labels processed', session.labelsProcessed],
    ['This session: templates updated', session.templatesUpdated]
  ];
  return (
    <div className="fixed inset-0 bg-black/40 flex items-start justify-center p-6 z-50" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-navy-800">Learning Dashboard</h2>
          <button onClick={onClose} aria-label="Close"
            className="min-h-[44px] min-w-[44px] text-2xl text-gray-500 hover:text-gray-800">×</button>
        </div>
        <dl className="space-y-3">
          {items.map(([label, value]) => (
            <div key={label} className="flex justify-between gap-4 border-b border-gray-100 pb-2">
              <dt className="text-base text-gray-600">{label}</dt>
              <dd className="text-base font-semibold text-navy-800">{value}</dd>
            </div>
          ))}
        </dl>
        <p className="text-sm text-gray-500 mt-4">
          In production these signals feed a shared template database seeded from the TTB COLA
          registry, improving zone detection for every agent simultaneously.
        </p>
      </div>
    </div>
  );
}
