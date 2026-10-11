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
import { getAdmin } from '../lib/firebaseAdmin.js';
import { buildInstagramObject } from '../lib/instagramSync.js';
import { createHmac, timingSafeEqual } from 'crypto';
import { FieldValue } from 'firebase-admin/firestore';

const APP_URL = 'https://collancer-app.vercel.app';
const TOKEN_DAYS = 60;

const go = (res, reason) =>
  res.writeHead(302, { Location: `${APP_URL}/?ig=${reason}` }).end();

function providerError(json, status, fallback) {
  const nested = json?.error && typeof json.error === 'object' ? json.error : {};
  const message = json?.error_message || nested.message ||
    (typeof json?.error === 'string' ? json.error : '') ||
    json?.message || fallback || `Instagram request failed (${status})`;
  return {
    message: String(message).replace(/[^a-zA-Z0-9 _.,:()/-]/g, '').slice(0, 180),
    code: nested.code ?? json?.error_code ?? json?.code ?? null,
    type: nested.type ?? null,
  };
}

function classifyTokenError(message) {
  if (/\bcode\b.*\b(used|redeemed|expired|invalid)\b|(?:expired|already used|already redeemed|invalid).*\bcode\b/i.test(message)) return 'CODE_EXPIRED';
  if (/redirect[_ ]?uri|redirect url/i.test(message)) return 'REDIRECT_MISMATCH';
  if (/client[_ ]?(secret|id)|invalid[_ ]?client|app secret/i.test(message)) return 'APP_CREDENTIALS';
  return 'TOKEN_FAILED_DIAG';
}

async function postForm(url, params) {
  // Keep the app secret server-side and preserve the provider's error details
  // in logs. Never log the authorization code or access token.
  const form = new FormData();
  for (const [k, v] of Object.entries(params)) form.append(k, String(v));
  const r = await fetch(url, { method: 'POST', body: form });
  const j = await r.json().catch(() => ({}));
  const hasAccessToken = Boolean(j?.access_token || j?.data?.[0]?.access_token);
  if (!r.ok || j?.error || !hasAccessToken) {
    const info = providerError(j, r.status, 'Instagram did not return an access token.');
    const e = new Error(info.message);
    e.code = classifyTokenError(info.message);
    e.status = r.status;
    e.metaCode = info.code;
    e.metaType = info.type;
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

    const firebaseAdmin = getAdmin();
    const db = firebaseAdmin.firestore();

    // 1. Validate the stateless HMAC-signed state.
    // Format: {uid}.{randomHex}.{hmacHex} — no Firestore lookup needed.
    // This eliminates "bad-state" errors from state persistence failures.
    let uid = null;
    try {
      const parts = String(state || '').split('.');
      if (parts.length === 3) {
        const [stateUid, stateRandom, stateSig] = parts;
        const payload = `${stateUid}.${stateRandom}`;
        const expectedSig = createHmac('sha256', appSecret).update(payload).digest('hex').slice(0, 32);
        // timingSafeEqual requires equal-length buffers
        const a = Buffer.from(stateSig, 'utf8');
        const b = Buffer.from(expectedSig, 'utf8');
        if (a.length === b.length && timingSafeEqual(a, b) && stateUid.length >= 10 && /^[a-zA-Z0-9]+$/.test(stateRandom)) {
          uid = stateUid;
        }
      }
    } catch { /* invalid state format */ }
    if (!uid) {
      const got = String(state || '').slice(0, 12) || 'none';
      return go(res, `error=bad-state-got-${encodeURIComponent(got)}`);
    }

    // 2. Exchange the one-time authorization code for a short-lived token.
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
      console.error('[instagram-callback] short-token exchange failed', {
        status: e?.status ?? null,
        metaCode: e?.metaCode ?? null,
        metaType: e?.metaType ?? null,
        message: String(e?.message || 'token exchange failed').slice(0, 180),
      });
      if (e?.code === 'CODE_EXPIRED') return go(res, 'error=code-expired');
      if (e?.code === 'REDIRECT_MISMATCH') return go(res, 'error=redirect-uri-mismatch');
      if (e?.code === 'APP_CREDENTIALS') return go(res, 'error=app-credentials-invalid');
      return go(res, 'error=token-failed');
    }

    // Meta can return either flat or wrapped response shapes.
    const shortToken = short?.access_token || short?.data?.[0]?.access_token;
    if (!shortToken) return go(res, 'error=token-failed');

    // Do not silently persist a short-lived token while claiming it lasts 60 days.
    let ll;
    let longTokenResponse;
    try {
      longTokenResponse = await fetch(
        `https://graph.instagram.com/access_token?grant_type=ig_exchange_token` +
        `&client_secret=${encodeURIComponent(appSecret)}` +
        `&access_token=${encodeURIComponent(shortToken)}`,
      );
      ll = await longTokenResponse.json().catch(() => ({}));
      if (!longTokenResponse.ok || ll?.error || !ll?.access_token) {
        const info = providerError(ll, longTokenResponse.status, 'Instagram did not return a long-lived access token.');
        const e = new Error(info.message);
        e.status = longTokenResponse.status;
        e.metaCode = info.code;
        e.metaType = info.type;
        throw e;
      }
    } catch (e) {
      console.error('[instagram-callback] long-lived token exchange failed', {
        status: e?.status ?? null,
        metaCode: e?.metaCode ?? null,
        metaType: e?.metaType ?? null,
        message: String(e?.message || 'long-lived token exchange failed').slice(0, 180),
      });
      return go(res, 'error=long-token-failed');
    }

    const token = ll.access_token;
    const expiresIn = Number(ll.expires_in);
    const expiresAt = new Date(Date.now() +
      (Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : TOKEN_DAYS * 86400) * 1000);

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

    const now = FieldValue.serverTimestamp();
    const username = instagram.username;
    const handleLower = username.toLowerCase();
    instagram.connectedAt = now;
    instagram.lastSyncedAt = now;

    // 4. Persist: token (server-only collection) + creator doc + handle reservation.
    const creatorRef = db.collection('creators').doc(uid);
    const creatorSnap = await creatorRef.get();
    const prev = creatorSnap.exists ? creatorSnap.data() : {};
    const prevLower = prev.handleLower || null;
    // A transient media API failure must not erase a previously saved library.
    if (instagram.dataQuality?.mediaFetchError && Array.isArray(prev.instagram?.recentMedia)) {
      instagram.recentMedia = prev.instagram.recentMedia;
      instagram.mediaCount = prev.instagram.mediaCount ?? instagram.mediaCount;
    }

    await db.collection('instagram_tokens').doc(uid).set({
      token, igId: String(instagram.igId), expiresAt, updatedAt: now,
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
      // Store only metrics backed by this Instagram sync; do not carry forward
      // stale values when a metric is unavailable or the fetched media is partial.
      engagement: instagram.engagementRate ?? FieldValue.delete(),
      avgViews: instagram.avgViews ?? FieldValue.delete(),
      avgLikes: instagram.avgLikes ?? FieldValue.delete(),
      reach: instagram.accountInsights?.metricStatus?.reach?.available ? instagram.reach : FieldValue.delete(),
      profileViews: instagram.accountInsights?.metricStatus?.profile_views?.available ? instagram.profileViews : FieldValue.delete(),
      platform: 'Instagram',
      instagram,
      onboardingStep: 'done',
      updatedAt: now,
    }, { merge: true });

    return go(res, 'connected');
  } catch (e) {
    if (e && (e.code === 'NOT_CONFIGURED' || e.code === 'BAD_CONFIG')) return go(res, 'error=server-not-configured');
    console.error('[instagram-callback] unexpected connection failure', {
      code: e?.code || null,
      message: String(e?.message || 'connection failed').slice(0, 180),
    });
    return go(res, 'error=connect-failed');
  }
}
