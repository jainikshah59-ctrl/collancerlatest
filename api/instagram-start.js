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
import { randomBytes, createHmac } from 'crypto';
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

    // STATELESS OAuth (2026-10-08): encode UID directly in the state param,
    // signed with HMAC. No Firestore lookup needed on callback — eliminates
    // the entire "bad-state" class of bugs from state persistence failures.
    // Format: {uid}.{randomHex}.{hmacHex}
    const appSecret = process.env.INSTAGRAM_APP_SECRET;
    const random = randomBytes(16).toString('hex');
    const payload = `${uid}.${random}`;
    const sig = createHmac('sha256', appSecret).update(payload).digest('hex').slice(0, 32);
    const state = `${payload}.${sig}`;

    const url =
      'https://www.instagram.com/oauth/authorize' +
      `?client_id=${encodeURIComponent(appId)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&scope=${encodeURIComponent(SCOPES)}` +
      '&response_type=code' +
      '&enable_fb_login=0' +
      `&state=${encodeURIComponent(state)}`;
    return res.status(200).json({ ok: true, url });
  } catch (e) {
    if (e && e.code === 'NOT_CONFIGURED') return fail('server-not-configured');
    return fail('start-failed');
  }
}
