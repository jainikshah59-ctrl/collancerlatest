/* POST /api/instagram-start — begin Instagram OAuth for a creator.
 *
 * The Instagram Graph API (business/creator accounts) needs a Meta App with
 * the Instagram product + Facebook Login. Browsers must never see the app
 * secret, so this endpoint builds the authorize URL server-side.
 *
 * Request:  { idToken }  (Firebase ID token of the logged-in creator)
 * Response: { ok: true, url } -> client redirects the browser to `url`.
 *           { ok: false, reason: 'not-configured' } when the Meta app env vars
 *           are missing — the client shows an honest "being set up" state.
 *           { ok: false, reason } on other failures.
 */
import { randomBytes } from 'crypto';
import { getAdmin, verifyUid, readBody } from '../lib/firebaseAdmin.js';

const SCOPES = ['instagram_business_basic', 'instagram_business_manage_insights'].join(',');

export default async function handler(req, res) {
  const fail = (reason, extra = {}) => res.status(200).json({ ok: false, reason, ...extra });
  try {
    if (req.method !== 'POST') return fail('Use POST.');
    const appId = process.env.INSTAGRAM_APP_ID;
    const redirectUri = process.env.INSTAGRAM_REDIRECT_URI || 'https://collancer-app.vercel.app/api/instagram-callback';
    if (!appId || !process.env.INSTAGRAM_APP_SECRET) return fail('not-configured');

    const body = readBody(req);
    let uid;
    try {
      uid = await verifyUid(body.idToken);
    } catch (e) {
      return fail(e.code === 'NOT_CONFIGURED' ? 'server-not-configured' : 'bad-token');
    }

    // One-time state record (CSRF protection) — admin-only collection.
    // Use 16 bytes (32 hex chars) — Instagram may truncate longer state
    // params, causing "bad-state" on callback (2026-10-08).
    const state = randomBytes(16).toString('hex');
    const db = getAdmin().firestore();
    // Clean up only EXPIRED states (older than 10 min) for this uid.
    // Be conservative: if we cannot determine a state's age, KEEP it.
    // Deleting a fresh state causes "bad-state" errors (2026-10-08).
    const tenMinAgo = Date.now() - 10 * 60 * 1000;
    const old = await db.collection('instagram_oauth_states').where('uid', '==', uid).get();
    const batch = db.batch();
    old.forEach((d) => {
      let createdMs = 0;
      try {
        const c = d.data()?.createdAt;
        if (c?.toDate) createdMs = c.toDate().getTime();
        else if (c instanceof Date) createdMs = c.getTime();
        else if (typeof c === 'number') createdMs = c;
        else if (c) createdMs = new Date(c).getTime();
      } catch { createdMs = 0; }
      // Only delete if we are SURE it is old (valid timestamp + older than 10 min).
      // If createdMs is 0/NaN (unknown age), keep the state.
      if (createdMs > 0 && createdMs < tenMinAgo) batch.delete(d.ref);
    });
    const stateRef = db.collection('instagram_oauth_states').doc(state);
    batch.set(stateRef, { uid, createdAt: new Date() });
    // TEMP-DIAG: record the exact dialog params for this state so a later
    // callback failure can be compared against what was actually issued.
    batch.set(db.collection('instagram_debug').doc(state), {
      uid, clientId: appId, redirectUri, createdAt: new Date(),
    });
    await batch.commit();

    const url =
      'https://www.instagram.com/oauth/authorize' +
      `?client_id=${encodeURIComponent(appId)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&scope=${encodeURIComponent(SCOPES)}` +
      '&response_type=code' +
      `&state=${encodeURIComponent(state)}`;
    return res.status(200).json({ ok: true, url });
  } catch (e) {
    if (e && e.code === 'NOT_CONFIGURED') return fail('server-not-configured');
    return fail('start-failed');
  }
}
