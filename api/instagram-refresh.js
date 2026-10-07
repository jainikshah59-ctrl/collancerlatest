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
import { getAdmin, verifyUid, readBody } from './_firebaseAdmin.js';

const GRAPH = 'https://graph.instagram.com/v21.0';
const STALE_MS = 6 * 3600 * 1000; // re-sync at most every 6h unless forced
const REFRESH_TOKEN_AFTER_MS = 30 * 86400000;

async function graphGet(path, token) {
  const r = await fetch(`${GRAPH}${path}${path.includes('?') ? '&' : '?'}access_token=${encodeURIComponent(token)}`);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = new Error(j?.error?.message || `graph call failed (${r.status})`);
    e.graphCode = j?.error?.code;
    throw e;
  }
  return j;
}

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
    const tokSnap = await db.collection('instagram_tokens').doc(uid).get();
    if (!tokSnap.exists) return fail('not-connected');
    let token = tokSnap.data()?.token;
    const igId = tokSnap.data()?.igId;
    if (!token || !igId) return fail('not-connected');

    const creatorRef = db.collection('creators').doc(uid);
    const creatorSnap = await creatorRef.get();
    const prev = creatorSnap.exists ? creatorSnap.data()?.instagram : null;
    if (!prev) return fail('not-connected');

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

    // Re-pull profile + insights.
    let me, acct = {}, insights = {};
    try {
      me = await graphGet('/me?fields=id,username,account_type,media_count', token);
    } catch (e) {
      if (e.graphCode === 190) {
        await db.collection('instagram_tokens').doc(uid).delete().catch(() => {});
        await creatorRef.set({
          instagram: { ...prev, tokenInvalid: true, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
        }, { merge: true });
        return fail('token-expired');
      }
      return fail('sync-failed');
    }
    try {
      acct = await graphGet(`/${igId}?fields=name,biography,profile_picture_url,followers_count,follows_count`, token);
    } catch { /* keep previous */ }
    try {
      const ins = await graphGet(`/${igId}/insights?metric=reach,profile_views&period=day`, token);
      const vals = {};
      for (const m of ins?.data || []) {
        const v = m?.values?.[0]?.value;
        if (typeof v === 'number') vals[m.name] = v;
      }
      insights = vals;
    } catch { /* keep previous */ }

    // Media stats for avg likes/views + engagement rate.
    let mediaStats = { count: 0, totalLikes: 0, totalComments: 0, totalViews: 0 };
    let recentMedia = prev.recentMedia || [];
    try {
      const m = await graphGet(`/me/media?fields=id,media_type,like_count,comments_count,view_count&limit=25`, token);
      const items = m?.data || [];
      recentMedia = items.slice(0, 12).map(x => ({
        id: x.id, type: x.media_type, likes: x.like_count || 0,
        comments: x.comments_count || 0, views: x.view_count || 0,
      }));
      for (const x of items) {
        mediaStats.count++;
        mediaStats.totalLikes += Number(x.like_count) || 0;
        mediaStats.totalComments += Number(x.comments_count) || 0;
        mediaStats.totalViews += Number(x.view_count) || 0;
      }
    } catch { /* keep previous */ }

    const followersNum = Number(acct.followers_count) || prev.followersCount || 0;
    const avgLikes = mediaStats.count ? Math.round(mediaStats.totalLikes / mediaStats.count) : (prev.avgLikes || 0);
    const avgViews = mediaStats.count ? Math.round(mediaStats.totalViews / mediaStats.count) : (prev.avgViews || 0);
    const avgEngagement = mediaStats.count && followersNum
      ? Number((((mediaStats.totalLikes + mediaStats.totalComments) / mediaStats.count / followersNum) * 100).toFixed(1))
      : (prev.engagementRate || 0);
    const reachVal = Number(insights.reach) || prev.reach || 0;

    const now = admin.firestore.FieldValue.serverTimestamp();
    const instagram = {
      ...prev,
      username: me.username || prev.username,
      name: acct.name ?? prev.name,
      profilePic: acct.profile_picture_url || prev.profilePic,
      bio: acct.biography ?? prev.bio,
      followersCount: followersNum,
      followsCount: Number(acct.follows_count) || prev.followsCount || 0,
      mediaCount: Number(me.media_count) || prev.mediaCount || 0,
      accountType: me.account_type || prev.accountType,
      insights: Object.keys(insights).length ? insights : prev.insights || {},
      recentMedia,
      avgLikes, avgViews, engagementRate: avgEngagement, reach: reachVal,
      tokenInvalid: false,
      lastSyncedAt: now,
    };
    await creatorRef.set({
      pfp: instagram.profilePic || creatorSnap.data()?.pfp || '',
      bio: typeof instagram.bio === 'string' ? instagram.bio : creatorSnap.data()?.bio || '',
      followers: instagram.followersCount,
      engagement: avgEngagement || creatorSnap.data()?.engagement || 0,
      avgViews: avgViews || creatorSnap.data()?.avgViews || 0,
      avgLikes: avgLikes || creatorSnap.data()?.avgLikes || 0,
      reach: reachVal || creatorSnap.data()?.reach || 0,
      instagram,
      updatedAt: now,
    }, { merge: true });

    return res.status(200).json({ ok: true, instagram });
  } catch (e) {
    if (e && (e.code === 'NOT_CONFIGURED' || e.code === 'BAD_CONFIG')) return fail('server-not-configured');
    return fail('sync-failed');
  }
}
