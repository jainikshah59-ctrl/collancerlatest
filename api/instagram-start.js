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
import { getAdmin, verifyUid, readBody } from './_firebaseAdmin.js';

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
    const state = randomBytes(24).toString('hex');
    const db = getAdmin().firestore();
    // Invalidate any previous unconsumed states for this uid so a stale
    // Instagram tab can never be authorized against an old state.
    const old = await db.collection('instagram_oauth_states').where('uid', '==', uid).get();
    const batch = db.batch();
    old.forEach((d) => batch.delete(d.ref));
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
      '&enable_fb_login=0' +
      '&force_authentication=1' +
      '&response_type=code' +
      `&state=${encodeURIComponent(state)}`;
    return res.status(200).json({ ok: true, url });
  } catch (e) {
    if (e && e.code === 'NOT_CONFIGURED') return fail('server-not-configured');
    return fail('start-failed');
  }
}
