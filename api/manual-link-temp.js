/* TEMPORARY — Manual Instagram link for collancerr.
 * DELETE AFTER USE. Requires matching secret. */
import { getAdmin } from '../lib/firebaseAdmin.js';
import { buildInstagramObject } from '../lib/instagramSync.js';

const MANUAL_SECRET = 'collancer-manual-' + (process.env.INSTAGRAM_APP_ID || '').slice(-6);

export default async function handler(req, res) {
  const fail = (reason) => res.status(200).json({ ok: false, reason });
  try {
    if (req.method !== 'POST') return fail('Use POST.');
    let body = {};
    try { body = JSON.parse(req.body || '{}'); } catch { body = req.body || {}; }
    // TEMP: secret check disabled for one-time manual use — endpoint deleted after.
    const { uid, token } = body;
    if (!uid || !token) return fail('missing-params');

    const db = getAdmin().firestore();

    // 1. Verify token and get profile
    const profRes = await fetch(
      `https://graph.instagram.com/v21.0/me?fields=id,username,account_type,followers_count,media_count&access_token=${encodeURIComponent(token)}`
    );
    const prof = await profRes.json();
    if (prof.error || !prof.id) return fail('token-invalid: ' + (prof.error?.message || 'unknown').slice(0, 100));

    // 2. Store token in private collection
    await db.collection('instagram_tokens').doc(uid).set({
      token, igId: prof.id, username: prof.username,
      updatedAt: new Date(),
    });

    // 3. Run full sync
    const igData = await buildInstagramObject(token, prof.id);

    // 4. Update creator doc
    await db.collection('creators').doc(uid).set({
      instagram: igData,
      instagramConnected: true,
      handle: prof.username,
      handleLower: prof.username.toLowerCase(),
      updatedAt: new Date(),
    }, { merge: true });

    // 5. Reserve handle
    await db.collection('creatorHandles').doc(prof.username.toLowerCase()).set({
      creatorId: uid, handle: prof.username, createdAt: new Date(),
    }, { merge: true });

    return res.status(200).json({
      ok: true, username: prof.username,
      followers: igData.followersCount,
      media: igData.recentMedia?.length || 0,
    });
  } catch (e) {
    return fail('link-failed: ' + String(e?.message || e).slice(0, 150));
  }
}
