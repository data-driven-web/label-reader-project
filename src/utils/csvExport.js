/**
 * csvExport — session/batch results CSV generation and download.
 * Exports whatever has finished so far; callable before a batch completes.
 */

function escapeCell(v) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows, columns) {
  const header = columns.map((c) => escapeCell(c.label)).join(',');
  const body = rows.map((r) =>
    columns.map((c) => escapeCell(typeof c.value === 'function' ? c.value(r) : r[c.value])).join(',')
  );
  return [header, ...body].join('\r\n');
}

export function downloadCsv(filename, csvText) {
  const blob = new Blob(['﻿' + csvText], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export const BATCH_CSV_COLUMNS = [
  { label: 'Filename', value: 'filename' },
  { label: 'Brand Identified', value: (r) => r.brandIdentified || 'Unknown' },
  { label: 'Overall Status', value: 'overall' },
  { label: 'Red Flags', value: (r) => r.counts?.red ?? '' },
  { label: 'Yellow Flags', value: (r) => r.counts?.yellow ?? '' },
  { label: 'Green Fields', value: (r) => r.counts?.green ?? '' },
  { label: 'Action Taken', value: (r) => r.action || 'pending' },
  { label: 'Timestamp', value: 'timestamp' }
];
