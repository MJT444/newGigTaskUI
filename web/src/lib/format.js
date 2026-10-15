// Formatting helpers. Money arrives from the API as strings (PostgreSQL DECIMAL)
// so it is never rounded by floats before display.

const moneyFmt = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatMoney(value) {
  if (value === null || value === undefined || value === '') return '—';
  const n = Number(value);
  return Number.isFinite(n) ? moneyFmt.format(n) : '—';
}

const compactFmt = new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 });
export const formatCompact = (n) => (Number.isFinite(Number(n)) ? compactFmt.format(Number(n)) : '—');

const intFmt = new Intl.NumberFormat('en-IN');
export const formatInt = (n) => (Number.isFinite(Number(n)) ? intFmt.format(Number(n)) : '—');

export function formatDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/** 'YYYY-MM-DD' -> '12 Oct' without timezone shifting. */
export function formatShortDate(ymd) {
  if (!ymd) return '';
  const [y, m, d] = String(ymd).slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

/** Seconds -> "just now", "45 s ago", "3 min ago", "1 h 5 min ago". */
export function formatAge(seconds) {
  if (seconds === null || seconds === undefined) return '—';
  const s = Math.max(0, Math.round(seconds));
  if (s < 5) return 'just now';
  if (s < 60) return `${s} s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  return `${h} h ${m % 60} min ago`;
}

export const shortId = (id) => (id ? String(id).slice(0, 8) : '—');

/** Local 'YYYY-MM-DD' for <input type="date"> defaults. */
export function toInputDate(date) {
  const d = new Date(date);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
