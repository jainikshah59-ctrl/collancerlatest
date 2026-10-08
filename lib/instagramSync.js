/* Shared Instagram Graph API sync — fetches EVERYTHING possible with
 * instagram_business_basic + instagram_business_manage_insights.
 *
 * Used by instagram-callback.js (initial connect) and instagram-refresh.js
 * (re-sync). Keeps both endpoints in lockstep so connect-time and refresh
 * data have identical shape.
 *
 * What we pull:
 *  - Profile: id, username, account_type, media_count, name, biography,
 *             profile_picture_url, followers_count, follows_count
 *  - Account insights (30d): reach, impressions, profile_views,
 *             website_clicks, accounts_engaged, total_interactions,
 *             follower_count (for growth trend)
 *  - Audience demographics: audience_city, audience_country,
 *             audience_gender_age (top entries)
 *  - Media (ALL pages): id, media_type, caption, like_count,
 *             comments_count, view_count, media_url, thumbnail_url,
 *             permalink, timestamp
 *  - Per-media insights (VIDEO/REEL): reach, impressions, plays,
 *             likes, comments, shares, saves, profile_visits
 *             (best-effort; rate-limited to avoid throttling)
 */

const GRAPH = 'https://graph.instagram.com/v21.0';

async function graphGet(path, token) {
  // If path is already a full URL (pagination), use it directly
  if (path.startsWith('https://')) {
    const r = await fetch(path);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const e = new Error(j?.error?.message || `graph call failed (${r.status})`);
      e.graphCode = j?.error?.code;
      e.graphStatus = r.status;
      throw e;
    }
    return j;
  }
  const sep = path.includes('?') ? '&' : '?';
  const r = await fetch(`${GRAPH}${path}${sep}access_token=${encodeURIComponent(token)}`);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = new Error(j?.error?.message || `graph call failed (${r.status})`);
    e.graphCode = j?.error?.code;
    e.graphStatus = r.status;
    throw e;
  }
  return j;
}

function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }

/* ---------- profile ---------- */
export async function fetchProfile(token) {
  const me = await graphGet('/me?fields=id,username,account_type,media_count', token);
  if (!me?.id || !me?.username) throw new Error('profile-failed');
  let acct = {};
  try {
    acct = await graphGet(`/${me.id}?fields=name,biography,profile_picture_url,followers_count,follows_count`, token);
  } catch { /* basic /me is enough */ }
  return { me, acct };
}

/* ---------- account insights (last 30 days, daily) ---------- */
// Note: 'impressions' is NOT a valid IG Graph API metric (verified 2026-10-08).
// Valid: reach, profile_views, website_clicks, accounts_engaged,
//        total_interactions, follower_count, online_followers
const ACCOUNT_METRICS = [
  'reach', 'profile_views', 'website_clicks',
  'accounts_engaged', 'total_interactions',
].join(',');

export async function fetchAccountInsights(igId, token) {
  const out = { daily: {}, totals: {}, followerGrowth: [] };
  try {
    const since = Math.floor((Date.now() - 30 * 86400000) / 1000);
    const until = Math.floor(Date.now() / 1000);
    const ins = await graphGet(
      `/${igId}/insights?metric=${ACCOUNT_METRICS}&period=day&since=${since}&until=${until}`,
      token,
    );
    for (const m of ins?.data || []) {
      const vals = (m?.values || []).map((v) => num(v?.value));
      out.daily[m.name] = vals;
      out.totals[m.name] = vals.reduce((a, b) => a + b, 0);
    }
  } catch (e) {
    out.error = String(e?.message || 'insights failed').slice(0, 120);
  }
  // follower_count history for growth chart
  try {
    const since = Math.floor((Date.now() - 30 * 86400000) / 1000);
    const fc = await graphGet(
      `/${igId}/insights?metric=follower_count&period=day&since=${since}`,
      token,
    );
    const vals = fc?.data?.[0]?.values || [];
    out.followerGrowth = vals.map((v) => ({
      t: v?.end_time || null,
      v: num(v?.value),
    })).filter((x) => x.t);
  } catch { /* optional */ }
  return out;
}

/* ---------- audience demographics ---------- */
// Valid metrics (verified 2026-10-08): follower_demographics,
// reached_audience_demographics, engaged_audience_demographics.
// NOT valid: audience_city, audience_country, audience_gender_age
export async function fetchAudience(igId, token) {
  const out = { countries: [], cities: [], genderAge: [], error: null };
  try {
    const ins = await graphGet(
      `/${igId}/insights?metric=follower_demographics&period=lifetime`,
      token,
    );
    const vals = ins?.data?.[0]?.values?.[0]?.value || {};
    // follower_demographics returns {country: {...}, city: {...}, age_gender: {...}}
    const pick = (obj, n = 5) => Object.entries(obj || {})
      .map(([k, v]) => ({ name: k, value: num(v) }))
      .sort((a, b) => b.value - a.value)
      .slice(0, n);
    out.countries = pick(vals.country);
    out.cities = pick(vals.city);
    out.genderAge = pick(vals.age_gender, 7);
  } catch (e) {
    out.error = String(e?.message || 'audience failed').slice(0, 120);
  }
  return out;
}

/* ---------- media (all pages) ---------- */
const MEDIA_FIELDS = [
  'id', 'media_type', 'caption', 'like_count', 'comments_count',
  'view_count', 'media_url', 'thumbnail_url', 'permalink', 'timestamp',
].join(',');

export async function fetchAllMedia(token, maxPages = 2) {
  const all = [];
  let url = `/me/media?fields=${MEDIA_FIELDS}&limit=50`;
  for (let p = 0; p < maxPages && url; p++) {
    const m = await graphGet(url, token);
    const items = m?.data || [];
    all.push(...items);
    // Use the full next URL directly (it has the right version + token)
    url = m?.paging?.next || null;
    if (items.length < 50) break;
  }
  return all;
}

/* ---------- per-media insights (videos/reels only, best-effort) ---------- */
// Valid for REEL (verified 2026-10-08): reach, views, likes, comments,
// shares, saved. NOT valid for reels: impressions, profile_visits, follows
const MEDIA_METRICS = 'reach,views,likes,comments,shares,saved';

export async function fetchMediaInsights(mediaId, token) {
  try {
    const ins = await graphGet(`/${mediaId}/insights?metric=${MEDIA_METRICS}`, token);
    const vals = {};
    for (const m of ins?.data || []) {
      const v = m?.values?.[0]?.value;
      if (typeof v === 'number') vals[m.name] = v;
    }
    return vals;
  } catch {
    return null;
  }
}

/* ---------- assemble the full instagram object ---------- */
export async function buildInstagramObject(token, opts = {}) {
  const { me, acct } = await fetchProfile(token);
  const igId = me.id;
  const username = me.username;

  const [accountInsights, audience, allMedia] = await Promise.all([
    fetchAccountInsights(igId, token).catch((e) => ({ daily: {}, totals: {}, followerGrowth: [], error: String(e?.message || e).slice(0, 100) })),
    fetchAudience(igId, token).catch(() => ({ cities: [], countries: [], genderAge: [] })),
    fetchAllMedia(token).catch(() => []),
  ]);

  // Per-media insights for recent videos/reels (best-effort).
  // Run in parallel. Cap at 4 to keep the sync fast (Vercel 10s limit).
  const videoMedia = allMedia
    .filter((x) => x.media_type === 'VIDEO')
    .slice(0, 4);
  const mediaInsights = {};
  // Parallel batches of 4
  for (let i = 0; i < videoMedia.length; i += 4) {
    const batch = videoMedia.slice(i, i + 4);
    const results = await Promise.all(
      batch.map((m) => fetchMediaInsights(m.id, token).catch(() => null)),
    );
    batch.forEach((m, j) => { if (results[j]) mediaInsights[m.id] = results[j]; });
  }

  // Aggregate stats
  let totalLikes = 0, totalComments = 0, totalViews = 0, videoCount = 0;
  for (const x of allMedia) {
    totalLikes += num(x.like_count);
    totalComments += num(x.comments_count);
    if (x.media_type === 'VIDEO' && x.view_count) {
      videoCount++;
      totalViews += num(x.view_count);
    }
  }
  const count = allMedia.length;
  const followersNum = num(acct.followers_count);
  const avgLikes = count ? Math.round(totalLikes / count) : 0;
  const avgViews = videoCount ? Math.round(totalViews / videoCount) : 0;
  const engagementRate = count && followersNum
    ? Number((((totalLikes + totalComments) / count / followersNum) * 100).toFixed(1))
    : 0;

  const recentMedia = allMedia.slice(0, 24).map((x) => ({
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
    // real per-post insights when available
    insights: mediaInsights[x.id] || null,
  }));

  return {
    igId: String(igId),
    username,
    name: acct.name || '',
    profilePic: acct.profile_picture_url || '',
    bio: acct.biography || '',
    followersCount: followersNum,
    followsCount: num(acct.follows_count),
    mediaCount: num(me.media_count),
    accountType: me.account_type || '',
    // expanded insights
    accountInsights,   // { daily: {reach:[...], ...}, totals: {...}, followerGrowth: [...] }
    audience,          // { cities, countries, genderAge }
    mediaInsights,     // { mediaId: {reach, impressions, plays, ...} }
    recentMedia,
    // convenience aggregates (kept for back-compat)
    avgLikes,
    avgViews,
    engagementRate,
    reach: num(accountInsights.totals?.reach),
    profileViews: num(accountInsights.totals?.profile_views),
    syncedAt: new Date().toISOString(),
  };
}

export { graphGet };
