/* TEMP — one-use: manually link collancerr IG to jainikshah599@gmail.com. DELETE AFTER USE. */
import { getAdmin } from './_firebaseAdmin.js';

const TOKEN = 'IGAAXJpKzZAcvFBZAFlZAMmdibkdVa0F2bkpuc1VtZAlVRTjZAvWW5IaXVqNkZAvby1kOUFWSWZAneHNqb2xONFpHRzlwYVdRMWJuTnVhMWlRTG1GRVotTmxkSWVxRkdGWjhxUU1leEl4WThCczkzaFhuVWdFWTVYXzBfbjNSZA3ZAHOHo4dwZDZD';
const TARGET_EMAIL = 'jainikshah599@gmail.com';

async function ig(path) {
  const r = await fetch(`https://graph.instagram.com${path}${path.includes('?') ? '&' : '?'}access_token=${TOKEN}`);
  return r.json();
}

function calcStats(followers, media) {
  const sorted = [...media].sort((a, b) => (b.likeCount || 0) - (a.likeCount || 0));
  const top = sorted.slice(0, 12);
  const likes = top.map(m => m.likeCount || 0);
  const views = top.map(m => m.viewCount || m.likeCount || 0);
  const n = top.length;
  const avg = (arr) => arr.length ? Math.round(arr.reduce((s, v) => s + v, 0) / arr.length) : 0;
  const avgLikes = n ? avg(likes) : 0;
  const avgViews = n ? avg(views) : 0;
  const engagementRate = followers > 0 && n ? +(((likes.reduce((s, v) => s + v, 0) / n) / followers) * 100).toFixed(2) : 0;
  const reach = avgViews ? Math.round(avgViews * 1.4) : (followers ? Math.round(followers * 0.28) : 0);
  return { avgLikes, avgViews, engagementRate, reach, reels: media.filter(m => m.type === 'reel').length };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  try {
    const app = getAdmin();
    const auth = app.auth();
    const db = app.firestore();
    const me = await ig('/me?fields=id,username,account_type,media_count,followers_count,follows_count,name,biography,profile_picture_url');
    if (me.error) return res.status(400).json({ ok: false, step: 'me', err: me.error });
    const insights = await ig(`/me/insights?metric=reach&period=day&metric_type=total_value`);
    const reach = insights?.data?.[0]?.total_value?.value || insights?.data?.[0]?.values?.[0]?.value || 0;
    const media = await ig('/me/media?fields=id,caption,media_type,like_count,comments_count,view_count,thumbnail_url,permalink,timestamp&limit=25');
    const recentMedia = (media?.data || []).map(m => ({
      id: m.id, caption: (m.caption || '').slice(0, 120), type: m.media_type === 'VIDEO' ? 'reel' : 'post',
      likeCount: m.like_count || 0, commentCount: m.comments_count || 0, viewCount: m.view_count || 0,
      thumbnailUrl: m.thumbnail_url || null, permalink: m.permalink || null, timestamp: m.timestamp || null,
    }));
    const stats = calcStats(me.followers_count || 0, recentMedia);
    const email = await auth.getUserByEmail(TARGET_EMAIL).then(u => u.uid).catch(() => null);
    if (!email) return res.status(404).json({ ok: false, err: 'user-not-found' });
    const igData = {
      connected: true, userId: me.id, username: me.username, accountType: me.account_type,
      followersCount: me.followers_count || 0, followsCount: me.follows_count || 0,
      mediaCount: me.media_count || 0, bio: me.biography || '', profilePic: me.profile_picture_url || '',
      insights: { reach }, recentMedia, stats, token: TOKEN, connectedAt: new Date().toISOString(), lastSync: new Date().toISOString(),
    };
    await db.collection('creators').doc(email).set({
      instagram: igData, pfp: me.profile_picture_url || '', bio: me.biography || '',
      followers: me.followers_count || 0, avgLikes: stats.avgLikes, avgViews: stats.avgViews,
      engagementRate: stats.engagementRate, projectedReach: stats.reach, updatedAt: new Date().toISOString(),
    }, { merge: true });
    return res.json({ ok: true, username: me.username, followers: me.followers_count, media: recentMedia.length, stats });
  } catch (e) {
    return res.status(500).json({ ok: false, err: String(e?.message || e).slice(0, 200) });
  }
}
