/* GET /api/instagram-callback — Instagram OAuth redirect target. */
import { getAdmin } from './_firebaseAdmin.js';

const APP_URL = 'https://collancer-app.vercel.app';
const FALLBACK_REDIRECT_URI = `${APP_URL}/api/instagram-callback`;
const GRAPH = 'https://graph.instagram.com/v21.0';
const TOKEN_DAYS = 60;

const go = (res, reason) =>
  res.writeHead(302, { Location: `${APP_URL}/?ig=${reason}` }).end();

async function postForm(url, params) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = String(j?.error_message || j?.error?.message || `token exchange failed (${r.status})`)
      .replace(/[^a-zA-Z0-9 _.,:()/-]/g, '').slice(0, 90);
    const e = new Error(`token-failed: ${msg}`);
    e.code = 'TOKEN_FAILED_DIAG';
    throw e;
  }
  return j;
}

async function graphGet(path, token) {
  const r = await fetch(`${GRAPH}${path}${path.includes('?') ? '&' : '?'}access_token=${encodeURIComponent(token)}`);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error?.message || `graph call failed (${r.status})`);
  return j;
}

export default async function handler(req, res) {
  try {
    const appId = process.env.INSTAGRAM_APP_ID;
    const appSecret = process.env.INSTAGRAM_APP_SECRET;
    if (!appId || !appSecret) return go(res, 'error=not-configured');

    const q = req.query || {};
    if (q.error) return go(res, `error=${encodeURIComponent(String(q.error_description || q.error).slice(0, 120))}`);
    const { code, state } = q;
    if (!code || !state) return go(res, 'error=missing-code');

    const admin = getAdmin();
    const db = admin.firestore();
    const stateRef = db.collection('instagram_oauth_states').doc(String(state));
    const stateSnap = await stateRef.get();
    if (!stateSnap.exists) return go(res, 'error=bad-state');
    const stateData = stateSnap.data() || {};
    const uid = stateData.uid;
    if (!uid) return go(res, 'error=bad-state');

    // Consume state only after reading the exact redirect URI that was issued.
    await stateRef.delete().catch(() => {});
    const redirectUri = String(stateData.redirectUri || process.env.INSTAGRAM_REDIRECT_URI || FALLBACK_REDIRECT_URI);

    const short = await postForm('https://api.instagram.com/oauth/access_token', {
      client_id: appId,
      client_secret: appSecret,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
      code: String(code),
    });
    if (!short.access_token) return go(res, 'error=token-failed');
    const ll = await fetch(
      `https://graph.instagram.com/access_token?grant_type=ig_exchange_token` +
      `&client_secret=${encodeURIComponent(appSecret)}` +
      `&access_token=${encodeURIComponent(short.access_token)}`,
    ).then((r) => r.json().catch(() => ({})));
    const token = ll.access_token || short.access_token;
    const expiresAt = new Date(Date.now() + TOKEN_DAYS * 86400000);

    let me;
    try {
      me = await graphGet('/me?fields=id,username,account_type,media_count', token);
    } catch (e) {
      const msg = String(e?.message || 'profile failed').replace(/[^a-zA-Z0-9 _.,:()/-]/g, '').slice(0, 90);
      return go(res, `error=${encodeURIComponent(`profile-failed: ${msg}`)}`);
    }
    const igId = me.id;
    if (!igId || !me.username) return go(res, 'error=profile-failed');
    let acct = {};
    try { acct = await graphGet(`/${igId}?fields=name,biography,profile_picture_url,followers_count,follows_count`, token); } catch {}
    let insights = {};
    try {
      const ins = await graphGet(`/${igId}/insights?metric=reach,profile_views&period=day`, token);
      const vals = {};
      for (const m of ins?.data || []) { const v = m?.values?.[0]?.value; if (typeof v === 'number') vals[m.name] = v; }
      insights = vals;
    } catch {}

    const now = admin.firestore.FieldValue.serverTimestamp();
    const username = me.username;
    const handleLower = username.toLowerCase();
    const instagram = {
      igId: String(igId), username, name: acct.name || '', profilePic: acct.profile_picture_url || '',
      bio: acct.biography || '', followersCount: Number(acct.followers_count) || 0,
      followsCount: Number(acct.follows_count) || 0, mediaCount: Number(me.media_count) || 0,
      accountType: me.account_type || '', insights, connectedAt: now, lastSyncedAt: now,
    };

    const creatorRef = db.collection('creators').doc(uid);
    const creatorSnap = await creatorRef.get();
    const prev = creatorSnap.exists ? creatorSnap.data() : {};
    const prevLower = prev.handleLower || null;
    await db.collection('instagram_tokens').doc(uid).set({ token, igId: String(igId), expiresAt, updatedAt: now });

    const handleRef = db.collection('creatorHandles').doc(handleLower);
    const handleSnap = await handleRef.get();
    const handleFree = !handleSnap.exists || handleSnap.data()?.creatorId === uid;
    if (handleFree) {
      await handleRef.set({ creatorId: uid, handle: username, createdAt: now });
      if (prevLower && prevLower !== handleLower) {
        const oldRef = db.collection('creatorHandles').doc(prevLower);
        const oldSnap = await oldRef.get();
        if (oldSnap.exists && oldSnap.data()?.creatorId === uid) await oldRef.delete().catch(() => {});
      }
    }
    await creatorRef.set({
      handle: handleFree ? username : prev.handle || null,
      handleLower: handleFree ? handleLower : prev.handleLower || null,
      pfp: instagram.profilePic || prev.pfp || '', bio: instagram.bio || prev.bio || '',
      followers: instagram.followersCount, platform: 'Instagram', instagram,
      onboardingStep: 'done', updatedAt: now,
    }, { merge: true });
    return go(res, 'connected');
  } catch (e) {
    if (e && (e.code === 'NOT_CONFIGURED' || e.code === 'BAD_CONFIG')) return go(res, 'error=server-not-configured');
    if (e && e.code === 'TOKEN_FAILED_DIAG') return go(res, `error=${encodeURIComponent(e.message)}`);
    return go(res, 'error=connect-failed');
  }
}
