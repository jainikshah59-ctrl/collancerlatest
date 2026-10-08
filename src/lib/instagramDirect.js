/* Direct client-side Instagram sync — bypasses Vercel server.
 * Created 2026-10-08 for urgent Meta screencast need.
 * Fetches Instagram data directly from the browser using the stored token,
 * saves to creators/{uid}.instagramClient (client-writable, unlike `instagram`
 * which is server-locked by Firestore rules).
 * 
 * SECURITY: Token is visible in browser network tab. Only use for the
 * account owner's own data. Revoke token after screencast if needed.
 */
import { ensureFirebase } from './firebase.js';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';

const GRAPH = 'https://graph.instagram.com/v21.0';

async function igGet(path, token) {
  const sep = path.includes('?') ? '&' : '?';
  // Handle full pagination URLs
  const url = path.startsWith('https://') 
    ? path 
    : `${GRAPH}${path}${sep}access_token=${encodeURIComponent(token)}`;
  const r = await fetch(url);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error?.message?.slice(0, 100) || `IG failed ${r.status}`);
  return j;
}

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

/**
 * Fetch ALL Instagram data directly from browser.
 * Returns the instagram object (same shape as server sync).
 */
export async function fetchInstagramDirect(token) {
  // 1. Profile
  const me = await igGet('/me?fields=id,username,account_type,media_count', token);
  if (!me?.id) throw new Error('profile-failed');
  
  const acct = await igGet(
    `/${me.id}?fields=name,biography,profile_picture_url,followers_count,follows_count`, 
    token
  ).catch(() => ({}));

  const igId = me.id;
  const since = Math.floor((Date.now() - 30 * 86400000) / 1000);

  // 2. Account insights (parallel)
  const [insights, followerHist] = await Promise.all([
    igGet(
      `/${igId}/insights?metric=reach,profile_views,website_clicks,accounts_engaged,total_interactions&period=day&since=${since}`,
      token
    ).catch(() => ({ data: [] })),
    igGet(
      `/${igId}/insights?metric=follower_count&period=day&since=${since}`,
      token
    ).catch(() => ({ data: [] })),
  ]);

  // Build totals
  const totals = {};
  const daily = {};
  for (const m of insights?.data || []) {
    const vals = (m.values || []).map(v => ({ t: v.end_time, v: num(v.value) }));
    daily[m.name] = vals;
    totals[m.name] = vals.reduce((a, x) => a + x.v, 0);
  }
  const followerGrowth = (followerHist?.data?.[0]?.values || []).map(v => ({
    t: v.end_time, v: num(v.value),
  }));

  // 3. Media (2 pages max for speed)
  const allMedia = [];
  let url = `/me/media?fields=id,media_type,caption,like_count,comments_count,view_count,media_url,thumbnail_url,permalink,timestamp&limit=50`;
  for (let p = 0; p < 2 && url; p++) {
    const m = await igGet(url, token).catch(() => null);
    if (!m) break;
    allMedia.push(...(m.data || []));
    url = m.paging?.next || null;
    if ((m.data || []).length < 50) break;
  }

  // 4. Per-video insights (4 videos, parallel)
  const videos = allMedia.filter(x => x.media_type === 'VIDEO').slice(0, 4);
  const mediaInsights = {};
  const results = await Promise.all(
    videos.map(m => 
      igGet(`/${m.id}/insights?metric=reach,views,likes,comments,shares,saved`, token)
        .then(ins => {
          const vals = {};
          for (const x of ins?.data || []) vals[x.name] = num(x.values?.[0]?.value);
          return { id: m.id, vals };
        })
        .catch(() => null)
    )
  );
  for (const r of results) {
    if (r) mediaInsights[r.id] = r.vals;
  }

  // 5. Aggregates
  let totalLikes = 0, totalComments = 0, totalViews = 0, videoCount = 0;
  for (const x of allMedia) {
    totalLikes += num(x.like_count);
    totalComments += num(x.comments_count);
    if (x.media_type === 'VIDEO' && x.view_count) {
      videoCount++;
      totalViews += num(x.view_count);
    }
  }
  const followersNum = num(acct.followers_count);
  const count = allMedia.length;

  const recentMedia = allMedia.slice(0, 24).map(x => ({
    id: x.id,
    type: x.media_type,
    caption: (x.caption || '').slice(0, 220),
    likes: num(x.like_count),
    comments: num(x.comments_count),
    views: num(x.view_count),
    url: x.media_url || null,
    thumbnail: x.thumbnail_url || null,
    permalink: x.permalink || null,
    timestamp: x.timestamp || null,
    insights: mediaInsights[x.id] || null,
  }));

  return {
    igId: String(igId),
    username: me.username,
    name: acct.name || '',
    profilePic: acct.profile_picture_url || '',
    bio: acct.biography || '',
    followersCount: followersNum,
    followsCount: num(acct.follows_count),
    mediaCount: num(me.media_count),
    accountType: me.account_type || '',
    accountInsights: { daily, totals, followerGrowth },
    audience: { cities: [], countries: [], genderAge: [] }, // empty, needs server
    mediaInsights,
    recentMedia,
    avgLikes: count ? Math.round(totalLikes / count) : 0,
    avgViews: videoCount ? Math.round(totalViews / videoCount) : 0,
    engagementRate: count && followersNum
      ? Number((((totalLikes + totalComments) / count / followersNum) * 100).toFixed(1))
      : 0,
    reach: num(totals.reach),
    profileViews: num(totals.profile_views),
    syncedAt: new Date().toISOString(),
    directSync: true, // flag: this came from browser, not server
  };
}

/**
 * Run direct sync and save to Firestore.
 * Saves to `instagramClient` field (client-writable).
 */
export async function runDirectSync(creatorId, token, onProgress) {
  const { db } = await ensureFirebase();
  
  onProgress?.('Fetching profile...');
  const instagram = await fetchInstagramDirect(token);
  
  onProgress?.('Saving...');
  await updateDoc(doc(db, 'creators', creatorId), {
    instagramClient: instagram,
    // Also update top-level convenience fields
    followers: instagram.followersCount,
    engagement: instagram.engagementRate,
    avgViews: instagram.avgViews,
    avgLikes: instagram.avgLikes,
    reach: instagram.reach,
    profileViews: instagram.profileViews,
    updatedAt: serverTimestamp(),
  });
  
  return instagram;
}
