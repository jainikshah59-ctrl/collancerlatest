/* POST /api/instagram-refresh — re-sync a creator's Instagram data.
 *
 * "Live updating": the client calls this when the profile opens and the
 * stored data is stale (or when the user taps refresh). The server reads the
 * long-lived token from the server-only collection, re-pulls profile +
 * insights from Instagram, and updates the creator doc. Tokens older than
 * ~30 days are proactively refreshed (long-lived tokens last ~60 days).
 *
 * Request:  { idToken, force?: boolean }
 * Response: { ok: true, instagram } | { ok: false, reason }
 * Reasons: not-configured | bad-token | not-connected | token-expired |
 *          sync-failed | fresh (nothing to do)
 */
import { getAdmin, verifyUid, readBody } from '../lib/firebaseAdmin.js';
import { buildInstagramObject } from '../lib/instagramSync.js';
import { FieldValue } from 'firebase-admin/firestore';

const STALE_MS = 1 * 3600 * 1000; // keep server freshness aligned with the client's 1h sync interval
const REFRESH_TOKEN_AFTER_MS = 30 * 86400000;

export default async function handler(req, res) {
  const fail = (reason) => res.status(200).json({ ok: false, reason });
  try {
    if (req.method !== 'POST') return fail('Use POST.');
    if (!process.env.INSTAGRAM_APP_ID || !process.env.INSTAGRAM_APP_SECRET) return fail('not-configured');

    const body = readBody(req);
    let uid;
    try {
      uid = await verifyUid(body.idToken);
    } catch (e) {
      return fail(e.code === 'NOT_CONFIGURED' ? 'server-not-configured' : 'bad-token');
    }

    const firebaseAdmin = getAdmin();
    const db = firebaseAdmin.firestore();
    const creatorRef = db.collection('creators').doc(uid);
    const creatorSnap = await creatorRef.get();
    const prev = creatorSnap.exists ? creatorSnap.data()?.instagram : null;
    if (!prev) return fail('not-connected');

    // OAuth tokens must remain server-side in instagram_tokens. Never read
    // a token from the public creator profile document as a fallback.
    const tokSnap = await db.collection('instagram_tokens').doc(uid).get();
    let token = tokSnap.exists ? tokSnap.data()?.token : null;
    const igId = tokSnap.exists ? tokSnap.data()?.igId : null;
    if (!token || !igId) return fail('not-connected');

    const lastSync = prev.lastSyncedAt?.toMillis
      ? prev.lastSyncedAt.toMillis()
      : (typeof prev.lastSyncedAt === 'number' ? prev.lastSyncedAt : 0);
    if (!body.force && Date.now() - lastSync < STALE_MS) {
      return res.status(200).json({ ok: true, fresh: true, instagram: prev });
    }

    // Proactively refresh aging long-lived tokens.
    try {
      const issuedAt = tokSnap.data()?.updatedAt?.toMillis?.() || 0;
      if (Date.now() - issuedAt > REFRESH_TOKEN_AFTER_MS) {
        const rj = await fetch(
          `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token` +
          `&access_token=${encodeURIComponent(token)}`,
        ).then((r) => r.json().catch(() => ({})));
        if (rj.access_token) {
          token = rj.access_token;
          await db.collection('instagram_tokens').doc(uid).set({
            token, updatedAt: FieldValue.serverTimestamp(),
          }, { merge: true });
        }
      }
    } catch { /* keep the existing token */ }

    // Full re-sync via the shared module (same shape as initial connect).
    let fresh;
    try {
      fresh = await buildInstagramObject(token);
    } catch (e) {
      console.error('[instagram-refresh] sync failed:', e?.message);
      if (e?.graphCode === 190) {
        await db.collection('instagram_tokens').doc(uid).delete().catch(() => {});
        await creatorRef.set({
          instagram: { ...prev, tokenInvalid: true, updatedAt: FieldValue.serverTimestamp() },
        }, { merge: true });
        return fail('token-expired');
      }
      return res.status(200).json({ ok: false, reason: 'sync-failed', detail: String(e?.message || e).slice(0, 200) });
    }

    // A transient media API failure must not erase the last known media library.
    if (fresh.dataQuality?.mediaFetchError && Array.isArray(prev.recentMedia)) {
      fresh.recentMedia = prev.recentMedia;
      fresh.mediaCount = prev.mediaCount ?? fresh.mediaCount;
    }
    const now = FieldValue.serverTimestamp();
    const syncedAtMs = Date.now();
    const instagram = {
      ...prev,
      ...fresh,
      // Store a JSON-safe millisecond timestamp so the immediate client response
      // and the subsequent Firestore snapshot use the same freshness format.
      connectedAt: prev.connectedAt || syncedAtMs,
      tokenInvalid: false,
      lastSyncedAt: syncedAtMs,
    };
    await creatorRef.set({
      pfp: instagram.profilePic || creatorSnap.data()?.pfp || '',
      bio: typeof instagram.bio === 'string' ? instagram.bio : creatorSnap.data()?.bio || '',
      followers: instagram.followersCount,
      // Never retain stale or manually estimated metrics when the API cannot
      // provide a complete, exact value for the current sync.
      engagement: instagram.engagementRate ?? FieldValue.delete(),
      avgViews: instagram.avgViews ?? FieldValue.delete(),
      avgLikes: instagram.avgLikes ?? FieldValue.delete(),
      reach: instagram.accountInsights?.metricStatus?.reach?.available ? instagram.reach : FieldValue.delete(),
      profileViews: instagram.accountInsights?.metricStatus?.profile_views?.available ? instagram.profileViews : FieldValue.delete(),
      instagram,
      updatedAt: now,
    }, { merge: true });

    return res.status(200).json({ ok: true, instagram });
  } catch (e) {
    if (e && (e.code === 'NOT_CONFIGURED' || e.code === 'BAD_CONFIG')) return fail('server-not-configured');
    return fail('sync-failed');
  }
}
