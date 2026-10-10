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

// Use a currently supported Graph API version; v21.0 reached the end of its two-year window in October 2026.
const GRAPH = 'https://graph.instagram.com/v25.0';

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

/* ---------- account insights (last 30 days) ----------
 * Metrics are requested separately so one retired/unsupported metric cannot
 * cause all the other metrics to disappear. Meta's available metrics vary by
 * API version, account eligibility and the requested metric_type.
 */
const ACCOUNT_METRICS = [
  'reach', 'views', 'profile_views', 'accounts_engaged', 'total_interactions',
  'likes', 'comments', 'shares', 'saves', 'follows_and_unfollows',
  'profile_links_taps',
];

export async function fetchAccountInsights(igId, token) {
  const out = { daily: {}, totals: {}, followerGrowth: [], metricStatus: {} };
  const since = Math.floor((Date.now() - 30 * 86400000) / 1000);
  const until = Math.floor(Date.now() / 1000);
  await Promise.all(ACCOUNT_METRICS.map(async (metric) => {
    try {
      // Most current account metrics support total_value; time_series is
      // only supported by a subset (notably reach). Request aggregate values
      // so unsupported metric types don't make valid metrics look missing.
      const qs = new URLSearchParams({
        metric, metric_type: 'total_value', period: 'day',
        since: String(since), until: String(until),
      });
      const ins = await graphGet(`/${igId}/insights?${qs.toString()}`, token);
      const m = (ins?.data || []).find((x) => x?.name === metric) || ins?.data?.[0];
      if (!m) {
        out.metricStatus[metric] = { available: false, reason: 'empty-response' };
        return;
      }
      const values = (m.values || []).map((v) => ({
        t: v?.end_time || null, v: num(v?.value),
      }));
      const totalValue = m.total_value?.value;
      out.daily[metric] = values.map((item) => item.v);
      // Do not add daily values to fabricate an account-level total. Metrics
      // such as reach are non-additive across days; only Meta's total_value
      // is accepted as the exact period total.
      const hasTotal = totalValue !== undefined && totalValue !== null;
      if (hasTotal) out.totals[metric] = num(totalValue);
      if (!hasTotal) {
        out.metricStatus[metric] = {
          available: false,
          dailyAvailable: values.length > 0,
          reason: values.length ? 'period-total-unavailable' : 'empty-response',
        };
        return;
      }
      out.metricStatus[metric] = { available: true, dailyAvailable: values.length > 0 };
      if (metric === 'follows_and_unfollows') out.followerGrowth = values;
    } catch (e) {
      out.metricStatus[metric] = {
        available: false,
        reason: String(e?.message || 'metric-unavailable').slice(0, 120),
        code: e?.graphCode ?? null,
      };
    }
  }));
  out.errors = Object.entries(out.metricStatus)
    .filter(([, status]) => !status.available)
    .map(([metric, status]) => ({ metric, ...status }));
  return out;
}

/* ---------- audience demographics ----------
 * Demographic insights need total_value + timeframe + a breakdown. Fetch
 * each breakdown independently because Meta accepts different breakdowns
 * for different metrics and may deny them for small/new accounts.
 */
function demographicRows(metricData) {
  const rows = metricData?.data?.[0]?.values?.[0]?.value;
  if (Array.isArray(rows)) return rows.map((row) => ({
    name: String(row?.dimension_values?.join(' / ') || row?.name || 'Unknown'),
    value: num(row?.value),
  })).sort((a, b) => b.value - a.value);
  if (rows && typeof rows === 'object') return Object.entries(rows)
    .map(([name, value]) => ({ name, value: num(value) }))
    .sort((a, b) => b.value - a.value);
  return [];
}

export async function fetchAudience(igId, token) {
  const out = {
    countries: [], cities: [], genderAge: [],
    reached: { countries: [], cities: [], genderAge: [] },
    engaged: { countries: [], cities: [], genderAge: [] },
    metricStatus: {},
  };
  const requests = [
    ['follower_demographics', 'country', 'countries'],
    ['follower_demographics', 'city', 'cities'],
    ['follower_demographics', 'age,gender', 'genderAge'],
    ['reached_audience_demographics', 'country', 'reached.countries'],
    ['reached_audience_demographics', 'city', 'reached.cities'],
    ['reached_audience_demographics', 'age,gender', 'reached.genderAge'],
    ['engaged_audience_demographics', 'country', 'engaged.countries'],
    ['engaged_audience_demographics', 'city', 'engaged.cities'],
    ['engaged_audience_demographics', 'age,gender', 'engaged.genderAge'],
  ];
  await Promise.all(requests.map(async ([metric, breakdown, key]) => {
    try {
      const qs = new URLSearchParams({
        metric, metric_type: 'total_value', period: 'lifetime', timeframe: 'last_30_days', breakdown,
      });
      const result = await graphGet(`/${igId}/insights?${qs.toString()}`, token);
      const rows = demographicRows(result);
      const [group, field] = key.includes('.') ? key.split('.') : [null, key];
      if (group) out[group][field] = rows.slice(0, 10);
      else out[field] = rows.slice(0, 10);
      out.metricStatus[key] = { available: rows.length > 0 };
    } catch (e) {
      out.metricStatus[key] = {
        available: false,
        reason: String(e?.message || 'demographic-unavailable').slice(0, 120),
        code: e?.graphCode ?? null,
      };
    }
  }));
  out.errors = Object.entries(out.metricStatus)
    .filter(([, status]) => !status.available)
    .map(([metric, status]) => ({ metric, ...status }));
  return out;
}

/* ---------- media (all pages) ---------- */
const MEDIA_FIELDS = [
  'id', 'media_type', 'caption', 'like_count', 'comments_count',
  'view_count', 'media_url', 'thumbnail_url', 'permalink', 'timestamp',
].join(',');

export async function fetchAllMedia(token, maxPages = 4) {
  const all = [];
  let url = `/me/media?fields=${MEDIA_FIELDS}&limit=50`;
  for (let p = 0; p < maxPages && url; p++) {
    const m = await graphGet(url, token);
    const items = m?.data || [];
    all.push(...items);
    // Use the full next URL directly (it has the right version + token).
    // Do not infer completion from a short page: rely on paging.next.
    url = m?.paging?.next || null;
  }
  // Local-only metadata lets callers suppress averages when the fetched media
  // window is incomplete; it is not part of the stored Instagram payload.
  all.complete = !url;
  return all;
}

/* ---------- per-media insights (best-effort; metric availability varies by type) ---------- */
// Current common candidates; unsupported metrics are isolated per media item.
const MEDIA_METRICS = 'reach,views,likes,comments,shares,saved';

export async function fetchMediaInsights(mediaId, token) {
  const vals = {};
  try {
    const ins = await graphGet(`/${mediaId}/insights?metric=${MEDIA_METRICS}`, token);
    for (const m of ins?.data || []) {
      const v = m?.values?.[0]?.value;
      if (typeof v === 'number') vals[m.name] = v;
    }
    if (Object.keys(vals).length) return vals;
  } catch { /* retry individual metrics below; types support different metrics */ }

  await Promise.all(['reach', 'views', 'likes', 'comments', 'shares', 'saved'].map(async (metric) => {
    try {
      const ins = await graphGet(`/${mediaId}/insights?metric=${metric}`, token);
      const m = (ins?.data || []).find((item) => item?.name === metric) || ins?.data?.[0];
      const value = m?.values?.[0]?.value;
      if (typeof value === 'number') vals[metric] = value;
    } catch { /* this metric is not available for this media/account */ }
  }));
  return Object.keys(vals).length ? vals : null;
}

/* ---------- assemble the full instagram object ---------- */
export async function buildInstagramObject(token, opts = {}) {
  const { me, acct } = await fetchProfile(token);
  const igId = me.id;
  const username = me.username;

  const [accountInsights, audience, mediaResult] = await Promise.all([
    fetchAccountInsights(igId, token).catch((e) => ({ daily: {}, totals: {}, followerGrowth: [], error: String(e?.message || e).slice(0, 100) })),
    fetchAudience(igId, token).catch((e) => ({ cities: [], countries: [], genderAge: [], error: String(e?.message || e).slice(0, 120) })),
    fetchAllMedia(token)
      .then((items) => ({ items, error: null }))
      .catch((e) => ({ items: [], error: String(e?.message || 'media-fetch-failed').slice(0, 120) })),
  ]);
  const allMedia = mediaResult.items;

  // Per-media insights for the 12 newest items (best-effort). Keep requests
  // in small parallel batches to reduce rate-limit and function-timeout risk.
  const videoMedia = allMedia.slice(0, 8);
  const mediaInsights = {};
  // Parallel batches of 4
  for (let i = 0; i < videoMedia.length; i += 4) {
    const batch = videoMedia.slice(i, i + 4);
    const results = await Promise.all(
      batch.map((m) => fetchMediaInsights(m.id, token).catch(() => null)),
    );
    batch.forEach((m, j) => { if (results[j]) mediaInsights[m.id] = results[j]; });
  }

  // Aggregate stats. Public-facing views are calculated for the last 30 days:
  // total account views during the period divided by posts published in that period.
  const count = allMedia.length;
  const followersNum = acct.followers_count == null ? null : num(acct.followers_count);
  const allAccountMediaFetched = mediaResult.items.complete === true
    || (me.media_count != null && count >= num(me.media_count));
  const allLikesAvailable = allMedia.every((item) => item.like_count !== undefined && item.like_count !== null);
  const allCommentsAvailable = allMedia.every((item) => item.comments_count !== undefined && item.comments_count !== null);
  const avgLikes = allAccountMediaFetched && count > 0 && allLikesAvailable
    ? Math.round(allMedia.reduce((sum, item) => sum + num(item.like_count), 0) / count)
    : null;
  const nowMs = Date.now();
  const thirtyDaysAgoMs = nowMs - 30 * 86400000;
  const recent30DayMedia = allMedia.filter((item) => {
    const timestamp = item?.timestamp ? new Date(item.timestamp).getTime() : NaN;
    return Number.isFinite(timestamp) && timestamp >= thirtyDaysAgoMs && timestamp <= nowMs;
  });
  const oldestFetchedMs = allMedia.length && allMedia[allMedia.length - 1]?.timestamp
    ? new Date(allMedia[allMedia.length - 1].timestamp).getTime()
    : NaN;
  const recentWindowComplete = allMedia.complete === true
    || (Number.isFinite(oldestFetchedMs) && oldestFetchedMs <= thirtyDaysAgoMs);
  const postsLast30Days = recentWindowComplete ? recent30DayMedia.length : null;
  const videosLast30Days = recentWindowComplete
    ? recent30DayMedia.filter((item) => item.media_type === 'VIDEO').length
    : null;
  const reportedViews30d = accountInsights.metricStatus?.views?.available
    ? accountInsights.totals?.views
    : null;
  // Average views per post is only computed from complete, per-post Instagram
  // view_count data for the posts published in the period. Account-wide views
  // are shown separately and are never divided by post count.
  const allRecentViewCountsAvailable = recentWindowComplete
    && recent30DayMedia.every((item) => item.view_count !== undefined && item.view_count !== null);
  const avgViews30d = allRecentViewCountsAvailable && recent30DayMedia.length > 0
    ? Math.round(recent30DayMedia.reduce((sum, item) => sum + num(item.view_count), 0) / recent30DayMedia.length)
    : null;
  const totalLikes = allMedia.reduce((sum, item) => sum + num(item.like_count), 0);
  const totalComments = allMedia.reduce((sum, item) => sum + num(item.comments_count), 0);
  const engagementRate = allAccountMediaFetched && count > 0 && followersNum > 0 && allLikesAvailable && allCommentsAvailable
    ? Number((((totalLikes + totalComments) / count / followersNum) * 100).toFixed(1))
    : null;

  const recentMedia = allMedia.slice(0, 50).map((x) => ({
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
    followsCount: acct.follows_count == null ? null : num(acct.follows_count),
    mediaCount: me.media_count == null ? null : num(me.media_count),
    accountType: me.account_type || '',
    // expanded insights
    accountInsights,   // { daily: {reach:[...], ...}, totals: {...}, followerGrowth: [...] }
    audience,          // { cities, countries, genderAge }
    mediaInsights,     // { mediaId: {reach, impressions, plays, ...} }
    recentMedia,
    // convenience aggregates (kept for back-compat)
    avgLikes,
    avgViews: avgViews30d,
    avgViews30d,
    postsLast30Days,
    videoCount: allAccountMediaFetched ? allMedia.filter((item) => item.media_type === 'VIDEO').length : null,
    videoCount30d: videosLast30Days,
    viewsLast30Days: reportedViews30d,
    engagementRate,
    reach: accountInsights.metricStatus?.reach?.available ? accountInsights.totals?.reach : null,
    profileViews: accountInsights.metricStatus?.profile_views?.available ? accountInsights.totals?.profile_views : null,
    profileLinksTaps: accountInsights.metricStatus?.profile_links_taps?.available ? accountInsights.totals?.profile_links_taps : null,
    dataQuality: {
      accountInsights: accountInsights.metricStatus || {},
      audience: audience.metricStatus || {},
      mediaFetched: allMedia.length,
      mediaPageLimit: 4,
      exactMetricsVersion: 2,
      mediaFetchComplete: allAccountMediaFetched,
      recent30DayWindowComplete: recentWindowComplete,
      mediaInsightsFetched: Object.keys(mediaInsights).length,
      partial: Boolean(!allAccountMediaFetched || !recentWindowComplete || accountInsights.errors?.length || accountInsights.error || audience.errors?.length || audience.error || mediaResult.error),
      mediaFetchError: mediaResult.error,
      syncedAt: new Date().toISOString(),
    },
    syncedAt: new Date().toISOString(),
  };
}

export { graphGet };
