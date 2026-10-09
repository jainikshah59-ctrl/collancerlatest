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
import admin from 'firebase-admin';

const STALE_MS = 6 * 3600 * 1000; // re-sync at most every 6h unless forced
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

    const admin = getAdmin();
    const db = admin.firestore();
    const creatorRef = db.collection('creators').doc(uid);
    const creatorSnap = await creatorRef.get();
    const prev = creatorSnap.exists ? creatorSnap.data()?.instagram : null;
    if (!prev) return fail('not-connected');

    // Token: check instagram_tokens collection first, fallback to creator doc (manual links)
    const tokSnap = await db.collection('instagram_tokens').doc(uid).get();
    let token = tokSnap.exists ? tokSnap.data()?.token : null;
    let igId = tokSnap.exists ? tokSnap.data()?.igId : null;
    if (!token) {
      token = prev.token;
      igId = prev.igId || prev.userId;
    }
    if (!token || !igId) return fail('not-connected');

    const lastSync = prev.lastSyncedAt?.toMillis ? prev.lastSyncedAt.toMillis() : 0;
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
            token, updatedAt: admin.firestore.FieldValue.serverTimestamp(),
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
          instagram: { ...prev, tokenInvalid: true, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
        }, { merge: true });
        return fail('token-expired');
      }
      return res.status(200).json({ ok: false, reason: 'sync-failed', detail: String(e?.message || e).slice(0, 200) });
    }

    const now = admin.firestore.FieldValue.serverTimestamp();
    const instagram = {
      ...prev,
      ...fresh,
      // keep server-side bookkeeping
      connectedAt: prev.connectedAt || now,
      tokenInvalid: false,
      lastSyncedAt: now,
    };
    await creatorRef.set({
      pfp: instagram.profilePic || creatorSnap.data()?.pfp || '',
      bio: typeof instagram.bio === 'string' ? instagram.bio : creatorSnap.data()?.bio || '',
      followers: instagram.followersCount,
      engagement: instagram.engagementRate || creatorSnap.data()?.engagement || 0,
      avgViews: instagram.avgViews || creatorSnap.data()?.avgViews || 0,
      avgLikes: instagram.avgLikes || creatorSnap.data()?.avgLikes || 0,
      reach: instagram.reach || creatorSnap.data()?.reach || 0,
      profileViews: instagram.profileViews || 0,
      instagram,
      updatedAt: now,
    }, { merge: true });

    return res.status(200).json({ ok: true, instagram });
  } catch (e) {
    if (e && (e.code === 'NOT_CONFIGURED' || e.code === 'BAD_CONFIG')) return fail('server-not-configured');
    return fail('sync-failed');
  }
}
