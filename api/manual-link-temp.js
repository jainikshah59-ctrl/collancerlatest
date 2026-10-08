/* TEMPORARY — Manual Instagram link with long-lived token exchange.
 * DELETE AFTER USE. */
import { getAdmin } from '../lib/firebaseAdmin.js';
import { buildInstagramObject } from '../lib/instagramSync.js';

export default async function handler(req, res) {
  const fail = (reason) => res.status(200).json({ ok: false, reason });
  try {
    if (req.method !== 'POST') return fail('Use POST.');
    let body = {};
    try { body = JSON.parse(req.body || '{}'); } catch { body = req.body || {}; }
    const { uid, token } = body;
    if (!uid || !token) return fail('missing-params');

    const appSecret = process.env.INSTAGRAM_APP_SECRET;
    if (!appSecret) return fail('not-configured');

    const db = getAdmin().firestore();

    // 1. Exchange short-lived -> long-lived (60 days)
    let longToken = token;
    try {
      const exRes = await fetch(
        `https://graph.instagram.com/access_token?grant_type=ig_exchange_token` +
        `&client_secret=${encodeURIComponent(appSecret)}` +
        `&access_token=${encodeURIComponent(token)}`
      );
      const exData = await exRes.json();
      if (exData.access_token) {
        longToken = exData.access_token;
      }
    } catch { /* keep original token */ }

    // 2. Verify token and get profile
    const profRes = await fetch(
      `https://graph.instagram.com/v21.0/me?fields=id,username,account_type,followers_count,media_count&access_token=${encodeURIComponent(longToken)}`
    );
    const prof = await profRes.json();
    if (prof.error || !prof.id) return fail('token-invalid: ' + (prof.error?.message || 'unknown').slice(0, 100));

    // 3. Store LONG-LIVED token in private collection
    await db.collection('instagram_tokens').doc(uid).set({
      token: longToken, igId: prof.id, username: prof.username,
      updatedAt: new Date(),
    });

    // 4. Run full sync
    const igData = await buildInstagramObject(longToken, prof.id);

    // 5. Update creator doc
    await db.collection('creators').doc(uid).set({
      instagram: igData,
      instagramConnected: true,
      handle: prof.username,
      handleLower: prof.username.toLowerCase(),
      updatedAt: new Date(),
    }, { merge: true });

    // 6. Reserve handle
    await db.collection('creatorHandles').doc(prof.username.toLowerCase()).set({
      creatorId: uid, handle: prof.username, createdAt: new Date(),
    }, { merge: true });

    return res.status(200).json({
      ok: true, username: prof.username,
      followers: igData.followersCount,
      media: igData.recentMedia?.length || 0,
      longLived: longToken !== token,
    });
  } catch (e) {
    return fail('link-failed: ' + String(e?.message || e).slice(0, 150));
  }
}
