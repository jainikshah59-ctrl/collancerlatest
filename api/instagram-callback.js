/* GET /api/instagram-callback — Instagram OAuth redirect target.
 *
 * Meta redirects here after the creator authorizes: ?code=...&state=...
 * The server (never the browser) exchanges the code for tokens using the
 * app secret, pulls the Instagram profile + insights, stores everything via
 * the Firebase Admin SDK, and redirects back into the app.
 *
 * Success -> 302 to https://collancer-app.vercel.app/?ig=connected
 * Failure -> 302 to https://collancer-app.vercel.app/?ig=error=<reason>
 */
import { getAdmin } from './_firebaseAdmin.js';
import { buildInstagramObject } from './_instagramSync.js';

const APP_URL = 'https://collancer-app.vercel.app';
const TOKEN_DAYS = 60;

const go = (res, reason) =>
  res.writeHead(302, { Location: `${APP_URL}/?ig=${reason}` }).end();

async function postForm(url, params) {
  // Meta documents the code->token exchange with multipart/form-data
  // (curl -F). A urlencoded body is REJECTED with the misleading
  // "Error validating verification code. Please make sure your redirect_uri
  // is identical to the one you used in the OAuth dialog request" - which
  // sends you hunting redirect URIs while the real problem is the encoding.
  // (Root-caused 2026-10-07; see research notes.)
  const form = new FormData();
  for (const [k, v] of Object.entries(params)) form.append(k, String(v));
  const r = await fetch(url, { method: 'POST', body: form });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    // Surface Instagram's error so we can tell a bad client_secret apart
    // from a bad/used code without server logs. Map expired/invalid codes
    // to a user-friendly retry message.
    const raw = String(j?.error_message || j?.error?.message || `token exchange failed (${r.status})`);
    const msg = raw.replace(/[^a-zA-Z0-9 _.,:()/-]/g, '').slice(0, 90);
    const e = new Error(`token-failed: ${msg}`);
    e.code = 'TOKEN_FAILED_DIAG';
    // Instagram's "Error validating verification code" is misleading: besides
    // a genuinely expired/used code (codes are single-use, valid 1h per Meta
    // docs - NOT minutes), Instagram returns this exact message when the
    // exchange body isn't multipart/form-data (fixed above) or when the app
    // secret doesn't match the Instagram use-case secret (Jainik-side check).
    if (/validating verification code/i.test(raw)) e.code = 'CODE_EXPIRED';
    throw e;
  }
  return j;
}

export default async function handler(req, res) {
  try {
    const appId = process.env.INSTAGRAM_APP_ID;
    const appSecret = process.env.INSTAGRAM_APP_SECRET;
    const redirectUri = process.env.INSTAGRAM_REDIRECT_URI || `${APP_URL}/api/instagram-callback`;
    if (!appId || !appSecret) return go(res, 'error=not-configured');

    const q = req.query || {};
    if (q.error) return go(res, `error=${encodeURIComponent(String(q.error_description || q.error).slice(0, 120))}`);
    const { code, state } = q;
    if (!code || !state) return go(res, 'error=missing-code');

    const admin = getAdmin();
    const db = admin.firestore();

    // 1. Validate + consume the one-time state record.
    // TEMP-DIAG (2026-10-06): echo a fingerprint of the received state on
    // mismatch so we can compare it against Firestore without server logs.
    const stateRef = db.collection('instagram_oauth_states').doc(String(state));
    const stateSnap = await stateRef.get();
    if (!stateSnap.exists) {
      const got = String(state || '').slice(0, 12) || 'none';
      return go(res, `error=bad-state-got-${encodeURIComponent(got)}`);
    }
    const uid = stateSnap.data()?.uid;
    if (!uid) return go(res, 'error=bad-state');
    await stateRef.delete().catch(() => {});

    // 2. Code -> short-lived token -> long-lived token (server-side only).
    let short;
    try {
      short = await postForm('https://api.instagram.com/oauth/access_token', {
        client_id: appId,
        client_secret: appSecret,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
        code: String(code),
      });
    } catch (e) {
      // Expired/used authorization code (user took too long on Instagram's
      // page) -> tell the app to ask for a fresh connect attempt.
      if (e?.code === 'CODE_EXPIRED') return go(res, 'error=code-expired');
      return go(res, 'error=token-failed');
    }
    // Meta docs: token exchange returns { data: [{ access_token, user_id, permissions }] }.
    // Handle both nested and flat formats for robustness.
    const shortToken = short?.access_token || short?.data?.[0]?.access_token;
    if (!shortToken) return go(res, 'error=token-failed');
    const ll = await fetch(
      `https://graph.instagram.com/access_token?grant_type=ig_exchange_token` +
      `&client_secret=${encodeURIComponent(appSecret)}` +
      `&access_token=${encodeURIComponent(shortToken)}`,
    ).then((r) => r.json().catch(() => ({})));
    const token = ll.access_token || shortToken;
    const expiresAt = new Date(Date.now() + TOKEN_DAYS * 86400000);

    // 3. Full Instagram sync — profile + account insights + audience +
    //    ALL media + per-media insights (shared module, same as refresh).
    let instagram;
    try {
      instagram = await buildInstagramObject(token);
    } catch (e) {
      const msg = String(e?.message || 'sync failed').replace(/[^a-zA-Z0-9 _.,:()/-]/g, '').slice(0, 90);
      return go(res, `error=${encodeURIComponent(`sync-failed: ${msg}`)}`);
    }
    const followersNum = instagram.followersCount;
    const avgLikes = instagram.avgLikes;
    const avgViews = instagram.avgViews;
    const avgEngagement = instagram.engagementRate;
    const reachVal = instagram.reach;

    const now = admin.firestore.FieldValue.serverTimestamp();
    const username = instagram.username;
    const handleLower = username.toLowerCase();
    instagram.connectedAt = now;
    instagram.lastSyncedAt = now;

    // 4. Persist: token (server-only collection) + creator doc + handle reservation.
    const creatorRef = db.collection('creators').doc(uid);
    const creatorSnap = await creatorRef.get();
    const prev = creatorSnap.exists ? creatorSnap.data() : {};
    const prevLower = prev.handleLower || null;

    await db.collection('instagram_tokens').doc(uid).set({
      token, igId: String(igId), expiresAt, updatedAt: now,
    });

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
      pfp: instagram.profilePic || prev.pfp || '',
      bio: instagram.bio || prev.bio || '',
      followers: instagram.followersCount,
      // Auto-fill profile stats from Instagram data
      engagement: avgEngagement || prev.engagement || 0,
      avgViews: avgViews || prev.avgViews || 0,
      avgLikes: avgLikes || prev.avgLikes || 0,
      reach: reachVal || prev.reach || 0,
      platform: 'Instagram',
      instagram,
      onboardingStep: 'done',
      updatedAt: now,
    }, { merge: true });

    return go(res, 'connected');
  } catch (e) {
    if (e && (e.code === 'NOT_CONFIGURED' || e.code === 'BAD_CONFIG')) return go(res, 'error=server-not-configured');
    if (e && e.code === 'TOKEN_FAILED_DIAG') return go(res, `error=${encodeURIComponent(e.message)}`); // TEMP-DIAG
    return go(res, 'error=connect-failed');
  }
}
