/* POST /api/instagram-start — begin Instagram OAuth for a creator. */
import { randomBytes, createHash } from 'crypto';
import { getAdmin, verifyUid, readBody } from './_firebaseAdmin.js';

const SCOPES = ['instagram_business_basic', 'instagram_business_manage_insights'].join(',');
const INSTAGRAM_REDIRECT_URI = 'https://collancer-app.vercel.app/api/instagram-callback';
const fingerprint = (value) => createHash('sha256').update(String(value)).digest('hex').slice(0, 12);

export default async function handler(req, res) {
  const fail = (reason, extra = {}) => res.status(200).json({ ok: false, reason, ...extra });
  try {
    if (req.method !== 'POST') return fail('Use POST.');
    const appId = process.env.INSTAGRAM_APP_ID;
    const redirectUri = INSTAGRAM_REDIRECT_URI;
    if (!appId || !process.env.INSTAGRAM_APP_SECRET) return fail('not-configured');

    const body = readBody(req);
    let uid;
    try { uid = await verifyUid(body.idToken); }
    catch (e) { return fail(e.code === 'NOT_CONFIGURED' ? 'server-not-configured' : 'bad-token'); }

    const state = randomBytes(24).toString('hex');
    const db = getAdmin().firestore();
    const old = await db.collection('instagram_oauth_states').where('uid', '==', uid).get();
    const batch = db.batch();
    old.forEach((d) => batch.delete(d.ref));
    const stateRef = db.collection('instagram_oauth_states').doc(state);
    batch.set(stateRef, { uid, redirectUri, redirectUriFp: fingerprint(redirectUri), createdAt: new Date() });
    await batch.commit();

    console.log('[instagram-oauth:start]', JSON.stringify({
      redirectUri, redirectUriFp: fingerprint(redirectUri), appIdSuffix: String(appId).slice(-6), state: state.slice(0, 12),
    }));

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
