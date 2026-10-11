/* Formatting helpers. */

export function inr(n) {
  const v = Number(n) || 0;
  return '₹' + v.toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

export function inr2(n) {
  const v = Number(n) || 0;
  return '₹' + v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function compact(n) {
  const v = Number(n) || 0;
  if (v >= 1e7) return (v / 1e7).toFixed(1).replace(/\.0$/, '') + 'Cr';
  if (v >= 1e5) return (v / 1e5).toFixed(1).replace(/\.0$/, '') + 'L';
  if (v >= 1e3) return (v / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(Math.round(v));
}

export function timeAgo(ts) {
  if (!ts) return '';
  const t = ts.seconds ? ts.seconds * 1000 : ts;
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}

export function fmtDate(ts) {
  if (!ts) return '—';
  const t = ts.seconds ? ts.seconds * 1000 : ts;
  return new Date(t).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function fmtDateTime(ts) {
  if (!ts) return '—';
  const t = ts.seconds ? ts.seconds * 1000 : ts;
  return new Date(t).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

export function initials(name) {
  return String(name || '?').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
}

export function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

/** SHA-256 hex digest (for booking fingerprints). */
export async function sha256Hex(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Booking idempotency fingerprint: 32 hex chars of business+creator+package+campaign+deadline. */
export async function bookingFingerprint({ bizId, creatorId, packageKey, campaignName, deadline }) {
  const h = await sha256Hex([bizId, creatorId, packageKey, campaignName, deadline].join('|'));
  return h.slice(0, 32);
}

export function uid(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
