/* Instagram connect — client helpers.
 * The OAuth flow itself runs through the server (/api/instagram-*): the app
 * secret and tokens never touch the browser. This module holds the pure
 * sync-state helpers (unit-tested) plus the thin client calls.
 */
import { ensureFirebase, auth } from './firebase.js';

/** Re-sync at most this often unless the user forces a refresh.
 * 1 hour — keeps data feeling "live" without hammering the API. */
export const INSTAGRAM_SYNC_INTERVAL_MS = 1 * 3600 * 1000;

/** True when the creator connected Instagram but the cached data is stale. */
export function needsInstagramSync(creator, now = Date.now()) {
  const ig = creator?.instagram;
  if (!ig || ig.tokenInvalid) return false;
  // Refresh legacy snapshots once so 30-day views/post metrics are populated.
  if (!Object.prototype.hasOwnProperty.call(ig, 'avgViews30d')
    || !Number.isFinite(ig.postsLast30Days)
    || !Number.isFinite(ig.videoCount30d)) return true;
  const last = ig.lastSyncedAt?.seconds
    ? ig.lastSyncedAt.seconds * 1000
    : (typeof ig.lastSyncedAt === 'number' ? ig.lastSyncedAt : 0);
  return now - last > INSTAGRAM_SYNC_INTERVAL_MS;
}

/** Human "last synced" label. */
export function lastSyncedLabel(creator, now = Date.now()) {
  const ig = creator?.instagram;
  if (!ig) return '';
  const last = ig.lastSyncedAt?.seconds
    ? ig.lastSyncedAt.seconds * 1000
    : (typeof ig.lastSyncedAt === 'number' ? ig.lastSyncedAt : 0);
  if (!last) return 'never';
  const mins = Math.max(0, Math.round((now - last) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

export async function idToken() {
  await ensureFirebase();
  const user = auth()?.currentUser;
  if (!user) throw new Error('not-signed-in');
  return user.getIdToken();
}

async function postJson(url, body) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return r.json().catch(() => ({ ok: false, reason: 'bad-response' }));
}

/**
 * Start the Instagram OAuth flow. Resolves after redirecting the browser to
 * Instagram; rejects with 'not-configured' when the Meta app isn't set up yet.
 */
export async function startInstagramConnect() {
  const token = await idToken();
  const j = await postJson('/api/instagram-start', { idToken: token });
  if (!j?.ok || !j.url) throw new Error(j?.reason || 'start-failed');
  window.location.href = j.url;
}

/** Ask the server to re-sync Instagram data. Returns the raw JSON result. */
export async function refreshInstagram(force = false) {
  const token = await idToken();
  return postJson('/api/instagram-refresh', { idToken: token, force });
}

/** Disconnect Instagram: deletes the stored token + synced data server-side. */
export async function disconnectInstagram() {
  const token = await idToken();
  const j = await postJson('/api/instagram-disconnect', { idToken: token });
  if (!j?.ok) throw new Error(j?.reason || 'disconnect-failed');
  return j;
}
