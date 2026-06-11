/**
 * ProgressStatus — live status line during processing.
 * Never a bare spinner: each zone/check reports as it runs, which makes
 * the wait feel shorter and shows the system is working.
 */
import { useEffect, useState } from 'react';

export default function ProgressStatus({ message, active }) {
  const [visible, setVisible] = useState(message);
  useEffect(() => {
    setVisible(message);
  }, [message]);
  if (!active || !visible) return null;
  return (
    <div className="flex items-center gap-3 py-3" aria-live="polite">
      <span className="inline-block h-3 w-3 rounded-full bg-navy-600 animate-pulse" aria-hidden="true" />
      <span key={visible} className="text-navy-700 text-base" style={{ animation: 'fadeIn 300ms ease-in' }}>
        {visible}
      </span>
      <style>{'@keyframes fadeIn { from { opacity: 0.2; } to { opacity: 1; } }'}</style>
    </div>
  );
}
