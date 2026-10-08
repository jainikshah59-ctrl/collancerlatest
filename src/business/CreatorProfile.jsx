/* Business creator profile — Overview / Portfolio / Analytics / Reviews.
   Portfolio + Analytics are locked for non-Pro (upsell); unlocked for Pro.
   Reviews: public list; businesses can submit one after a completed campaign,
   recomputing creators/{id}.rating. */
import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, Star, Users, Eye, Heart, Radio, TrendingUp,
  Lock, Crown, Play, Image as ImageIcon, CalendarCheck, MapPin, Link2,
  MessageSquare, Send, Loader2,
} from 'lucide-react';
import { useBiz, isBizPro } from './ctx.jsx';
import {
  ensureFirebase, collection, query, where, onSnapshot,
  addDoc, getDocs, updateDoc, doc, serverTimestamp,
} from '../lib/firebase.js';
import { PROMO_TYPES } from '../lib/constants.js';
import { compact, inr, timeAgo } from '../lib/format.js';
import {
  Card, Avatar, Badge, Chip, Tabs, Button, EmptyState, SkeletonCard,
  Field, TextArea, Page, useToast, ProgressBar, IconBtn, VerifiedTick,
} from '../components/ui.jsx';
import MediaViewer from '../components/MediaViewer.jsx';

function ProLock({ goPage }) {
  return (
    <Card className="cl-fade" style={{ textAlign: 'center', padding: '36px 22px' }}>
      <div style={{
        width: 56, height: 56, borderRadius: 10, margin: '0 auto 14px',
        background: 'var(--ink)', display: 'grid', placeItems: 'center',
        boxShadow: 'var(--shadow-btn)',
      }}>
        <Lock style={{ width: 22, height: 22, color: 'var(--cyan)' }} />
      </div>
      <h3 style={{ fontSize: 17, marginBottom: 8 }}>Pro feature</h3>
      <p className="cl-small cl-muted" style={{ lineHeight: 1.6, marginBottom: 18 }}>
        Upgrade to Collancer Pro to unlock the portfolio, deeper analytics and a 5% booking discount.
      </p>
      <Button icon={Crown} onClick={() => goPage('pro')}>View Pro plans</Button>
    </Card>
  );
}

function Stars({ value, onPick, size = 22 }) {
  return (
    <div className="cl-row" style={{ gap: 4 }}>
      {[1, 2, 3, 4, 5].map((s) => (
        <button
          key={s}
          onClick={() => onPick?.(s)}
          style={{ background: 'none', border: 0, cursor: onPick ? 'pointer' : 'default', padding: 2 }}
          aria-label={`${s} star${s > 1 ? 's' : ''}`}
        >
          <Star
            style={{
              width: size, height: size,
              color: s <= value ? 'var(--amber)' : 'var(--line)',
              fill: s <= value ? 'var(--amber)' : 'none',
              transition: 'all 150ms var(--ease)',
            }}
          />
        </button>
      ))}
    </div>
  );
}

function OverviewTab({ creator, pro, onBook }) {
  const ig = creator.instagram || creator.instagramClient || null;
  const followers = Number(ig?.followersCount || creator.followers || creator.ytSubscribers || 0);
  const engagement = Number(creator.engagement || ig?.engagementRate || 0);
  const avgViews = Number(creator.avgViews || ig?.avgViews || 0);
  const avgLikes = Number(creator.avgLikes || ig?.avgLikes || 0);
  const reach = Number(creator.reach || ig?.reach || 0);
  const convLo = (reach * 0.005).toFixed(0);
  const convHi = (reach * 0.02).toFixed(0);

  const prices = creator.prices || {};
  const discounted = creator.discountedPrices || {};
  const legacy = Number(creator.price) || 0;
  const rows = PROMO_TYPES.map((p) => {
    const mrp = Number(prices[p.key] || 0);
    const dp = Number(discounted[p.key] || 0);
    return { ...p, mrp, dp, has: mrp > 0 };
  }).filter((r) => r.has);
  const categories = creator.categories?.length ? creator.categories : (creator.promotionTypes || []);

  return (
    <div className="cl-fade">
      {/* stats grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
        {[
          { icon: Users, label: 'Followers', value: compact(followers) },
          { icon: Eye, label: 'Avg. views', value: compact(avgViews) },
          { icon: Star, label: 'Rating', value: (Number(creator.rating) || 0).toFixed(1) },
          { icon: Radio, label: 'Est. reach', value: compact(reach) },
        ].map((s) => (
          <Card key={s.label} style={{ padding: 14 }}>
            <s.icon style={{ width: 18, height: 18, color: 'var(--cyan-deep)', marginBottom: 8 }} />
            <div className="cl-money" style={{ fontSize: 17 }}>{s.value}</div>
            <div className="cl-small cl-muted">{s.label}</div>
          </Card>
        ))}
      </div>

      {/* estimates */}
      <Card style={{ marginBottom: 12 }}>
        <h4 style={{ fontSize: 14, marginBottom: 10 }}>Campaign estimates</h4>
        <div className="cl-kv"><dt>{(creator.instagramClient?.username || creator.instagram?.username) ? 'Avg likes (Instagram)' : 'Estimated likes'}</dt><dd>{compact(avgLikes)}</dd></div>
        <div className="cl-kv"><dt>{(creator.instagramClient?.username || creator.instagram?.username) ? 'Reach (Instagram)' : 'Estimated reach'}</dt><dd>{compact(reach)}</dd></div>
        <div className="cl-kv"><dt>Conversion range</dt><dd>{compact(convLo)} – {compact(convHi)} actions</dd></div>
        <p className="cl-small cl-muted" style={{ marginTop: 8, lineHeight: 1.55 }}>
          {(creator.instagramClient?.username || creator.instagram?.username)
            ? 'Stats synced directly from the creator\'s Instagram account.'
            : 'Estimates are derived from the creator\'s reported audience stats.'}
        </p>
      </Card>

      {/* pricing */}
      <Card style={{ marginBottom: 12 }}>
        <h4 style={{ fontSize: 14, marginBottom: 4 }}>Pricing</h4>
        <p className="cl-small cl-muted" style={{ marginBottom: 12 }}>Set by the creator — prices are locked at booking.</p>
        {rows.length === 0 && legacy > 0 && (
          <div className="cl-kv"><dt>Standard collaboration</dt><dd className="cl-money">{inr(legacy)}</dd></div>
        )}
        {rows.length === 0 && !legacy && (
          <p className="cl-small cl-muted">This creator hasn't published a rate card yet.</p>
        )}
        {rows.map((r) => (
          <div key={r.key} className="cl-kv" style={{ borderBottom: '1px solid var(--line-soft)' }}>
            <dt>
              <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{r.label}</div>
              <div className="cl-small cl-muted">{r.desc}</div>
            </dt>
            <dd>
              {pro && r.dp > 0 && r.dp < r.mrp ? (
                <>
                  <span style={{ textDecoration: 'line-through', color: 'var(--faint)', fontWeight: 400, marginRight: 6 }}>{inr(r.mrp)}</span>
                  <span className="cl-money" style={{ color: 'var(--cyan-deep)' }}>{inr(r.dp)}</span>
                  <div><Badge tone="cyan">{Math.round((1 - r.dp / r.mrp) * 100)}% Pro off</Badge></div>
                </>
              ) : (
                <span className="cl-money">{inr(r.mrp)}</span>
              )}
            </dd>
          </div>
        ))}
      </Card>

      {/* categories */}
      {categories.length > 0 && (
        <Card style={{ marginBottom: 12 }}>
          <h4 style={{ fontSize: 14, marginBottom: 10 }}>Promotion categories</h4>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {categories.map((c) => <Chip tag key={c}>{c}</Chip>)}
          </div>
        </Card>
      )}

      <Button block size="lg" icon={CalendarCheck} onClick={() => onBook(creator)}>Book this creator</Button>
    </div>
  );
}

function DemosTab({ creator, pro, goPage }) {
  const [demos, setDemos] = useState(null);
  const [viewerMedia, setViewerMedia] = useState(null);
  // Instagram reels/posts — creator picks which ones brands see
  // (creator.featuredMediaIds); falls back to recent sync when unset.
  // Prefer instagramClient (direct browser sync) over instagram (server sync).
  const igData = creator?.instagramClient || creator?.instagram || {};
  const allIg = igData.recentMedia || [];
  const featuredIds = creator?.featuredMediaIds || [];
  const savedFeatured = creator?.featuredMedia || [];
  const igMedia = featuredIds.length > 0
    ? featuredIds.map((id) =>
        allIg.find((m) => m.id === id) || savedFeatured.find((m) => m.id === id)
      ).filter(Boolean)
    : allIg;
  const igUsername = igData.username || '';
  useEffect(() => {
    if (!pro) return;
    let unsub = () => {};
    ensureFirebase().then(({ db }) => {
      const qy = query(collection(db, 'promoDemos'), where('creatorId', '==', creator.id));
      unsub = onSnapshot(qy, (s) => setDemos(s.docs.map((d) => ({ id: d.id, ...d.data() }))), (e) => {
        console.error('[profile] demos', e); setDemos([]);
      });
    });
    return () => unsub();
  }, [pro, creator.id]);

  if (!pro) return <ProLock goPage={goPage} />;
  if (demos === null) return <><SkeletonCard /><SkeletonCard /></>;
  const hasIg = igMedia.length > 0;
  if (demos.length === 0 && !hasIg) {
    return <EmptyState icon={Play} title="No portfolio pieces yet" body="This creator hasn't added portfolio pieces." />;
  }
  return (
    <div className="cl-fade" style={{ display: 'grid', gap: 12 }}>
      {/* Instagram reels/posts — auto-synced from the connected account */}
      {hasIg && (
        <Card style={{ padding: 14 }}>
          <div className="cl-row" style={{ alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <strong style={{ fontSize: 14 }}>Instagram posts</strong>
            {igUsername && <span className="cl-small cl-muted">@{igUsername}</span>}
            <Chip cyan>{igMedia.length}</Chip>
            {featuredIds.length > 0 && (
              <span className="cl-small cl-muted" style={{ fontSize: 11 }}>· handpicked by creator</span>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {igMedia.map((m) => (
              <button key={m.id} onClick={() => setViewerMedia(m)}
                 style={{ position: 'relative', aspectRatio: '1', borderRadius: 8, overflow: 'hidden',
                   background: 'var(--surface-2)', display: 'block', border: 0, padding: 0, cursor: 'pointer' }}
                 aria-label="Play media">
                {(m.url || m.thumbnail) ? (
                  m.type === 'VIDEO' || m.type === 'REELS'
                    ? <video src={m.url || m.thumbnail} preload="metadata" muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <img src={m.url || m.thumbnail} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center' }}>
                    <ImageIcon style={{ width: 20, height: 20, color: 'var(--faint)' }} />
                  </div>
                )}
                {(m.type === 'VIDEO' || m.type === 'REELS') && (
                  <span style={{ position: 'absolute', top: 6, right: 6, color: '#fff', background: 'rgba(0,0,0,.55)', borderRadius: 6, padding: '2px 6px', fontSize: 10 }}>
                    Reel
                  </span>
                )}
                {(m.likes > 0 || m.comments > 0) && (
                  <span style={{ position: 'absolute', bottom: 6, left: 6, right: 6, color: '#fff', fontSize: 10, display: 'flex', gap: 8, textShadow: '0 1px 3px rgba(0,0,0,.7)', alignItems: 'center' }}>
                    {m.likes > 0 && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><Heart style={{ width: 11, height: 11 }} />{compact(m.likes)}</span>}
                    {m.comments > 0 && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><MessageSquare style={{ width: 11, height: 11 }} />{compact(m.comments)}</span>}
                  </span>
                )}
              </button>
            ))}
          </div>
          <p className="cl-small cl-muted" style={{ marginTop: 10, lineHeight: 1.55 }}>
            Tap any post to play it.
          </p>
        </Card>
      )}
      {viewerMedia && <MediaViewer media={viewerMedia} onClose={() => setViewerMedia(null)} />}
      {demos.map((d) => (
        <Card key={d.id} style={{ padding: 0, overflow: 'hidden' }}>
          {d.mediaUrl && (d.format === 'Video' || /\.(mp4|webm|mov)/i.test(d.mediaUrl)) ? (
            <video src={d.mediaUrl} controls playsInline preload="metadata" style={{ width: '100%', maxHeight: 320, background: '#000' }} />
          ) : d.mediaUrl ? (
            <img src={d.mediaUrl} alt={d.title || 'demo'} style={{ width: '100%', maxHeight: 320, objectFit: 'cover' }} />
          ) : (
            <div style={{ height: 140, display: 'grid', placeItems: 'center', background: 'var(--surface-2)' }}>
              <ImageIcon style={{ width: 28, height: 28, color: 'var(--faint)' }} />
            </div>
          )}
          <div style={{ padding: 14 }}>
            <div className="cl-row" style={{ gap: 8, marginBottom: 4 }}>
              {d.demoType && <Chip cyan>{d.demoType}</Chip>}
              {d.format && <Chip>{d.format}</Chip>}
            </div>
            <strong style={{ fontSize: 14 }}>{d.title || 'Promotion demo'}</strong>
            {d.description && <p className="cl-small cl-muted" style={{ marginTop: 4, lineHeight: 1.55 }}>{d.description}</p>}
          </div>
        </Card>
      ))}
    </div>
  );
}

function AnalyticsTab({ creator, pro, goPage }) {
  const [viewerMedia, setViewerMedia] = useState(null);
  if (!pro) return <ProLock goPage={goPage} />;
  // Server-synced Instagram data is the canonical source of truth.
  const ig = creator?.instagram || creator?.instagramClient || {};
  const hasIg = !!ig.username;
  const totals = ig.accountInsights?.totals || {};
  const audience = ig.audience || {};
  const growth = ig.accountInsights?.followerGrowth || [];

  const followers = Number(creator.instagramClient?.followersCount || creator.followers || creator.ytSubscribers || 0);
  const engagement = Number(creator.engagement || 0);
  const avgViews = Number(creator.avgViews || Math.round(followers * (engagement > 0 ? engagement : 3) / 100));
  const avgLikes = Number(creator.avgLikes || Math.round(avgViews * 0.06));
  const likeRate = avgViews > 0 ? (avgLikes / avgViews) * 100 : 0;
  const viewRate = followers > 0 ? (avgViews / followers) * 100 : 0;

  // follower growth over the synced window
  const growthVals = growth.map((g) => g.v).filter((v) => v > 0);
  const growthDelta = growthVals.length >= 2
    ? growthVals[growthVals.length - 1] - growthVals[0]
    : 0;

  // top posts by real reach (fall back to likes)
  const ranked = [...(ig.recentMedia || [])]
    .sort((a, b) => ((b.insights?.reach || b.likes || 0) - (a.insights?.reach || a.likes || 0)))
    .slice(0, 6);

  const syncedLabel = ig.syncedAt
    ? `Synced ${timeAgo(ig.syncedAt)} · live from @${ig.username}`
    : hasIg ? `Live from @${ig.username}` : null;

  return (
    <div className="cl-fade">
      {/* ---- LIVE INSTAGRAM INSIGHTS ---- */}
      <Card style={{ marginBottom: 12 }}>
        <div className="cl-row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h4 style={{ fontSize: 14 }}>
            {hasIg ? 'Instagram insights' : 'Engagement'}
          </h4>
          {hasIg && (
            <span className="cl-small" style={{
              color: 'var(--cyan-deep)', background: 'var(--cyan-soft)',
              padding: '3px 10px', borderRadius: 20, fontWeight: 700, fontSize: 11,
            }}>
              ● Live data
            </span>
          )}
        </div>
        {hasIg && Object.keys(totals).length > 0 ? (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
              {[
                { label: 'Views (30d)', value: compact(totals.views || 0) },
                { label: 'Reach (30d)', value: compact(totals.reach || 0) },
                { label: 'Profile views', value: compact(totals.profile_views || 0) },
                { label: 'Accounts engaged', value: compact(totals.accounts_engaged || 0) },
                { label: 'Total interactions', value: compact(totals.total_interactions || 0) },
                { label: 'Likes (30d)', value: compact(totals.likes || 0) },
                { label: 'Comments (30d)', value: compact(totals.comments || 0) },
                { label: 'Shares (30d)', value: compact(totals.shares || 0) },
                { label: 'Saves (30d)', value: compact(totals.saves || 0) },
                { label: 'Follows / unfollows', value: compact(totals.follows_and_unfollows || 0) },
                { label: 'Profile link taps', value: compact(totals.profile_links_taps || 0) },
                { label: 'Follower growth (30d)', value: (growthDelta >= 0 ? '+' : '') + compact(growthDelta) },
              ].map((s) => (
                <div key={s.label} style={{
                  background: 'var(--surface-2)', borderRadius: 10, padding: '10px 12px',
                }}>
                  <div className="cl-money" style={{ fontSize: 16 }}>{s.value}</div>
                  <div className="cl-small cl-muted" style={{ fontSize: 11 }}>{s.label}</div>
                </div>
              ))}
            </div>
            <div className="cl-kv"><dt>Engagement rate</dt><dd>{engagement ? `${engagement.toFixed(1)}%` : '—'}</dd></div>
            <div className="cl-kv"><dt>Like-to-view rate</dt><dd>{likeRate.toFixed(1)}%</dd></div>
            <div className="cl-kv"><dt>View-to-follower rate</dt><dd>{viewRate.toFixed(1)}%</dd></div>
            {syncedLabel && (
              <p className="cl-small cl-muted" style={{ marginTop: 10, lineHeight: 1.55 }}>
                {syncedLabel} — pulled directly from the creator's connected Instagram account.
              </p>
            )}
          </>
        ) : (
          <>
            <div className="cl-kv"><dt>Engagement rate</dt><dd>{engagement ? `${engagement.toFixed(1)}%` : '—'}</dd></div>
            <div className="cl-kv"><dt>Like-to-view rate</dt><dd>{likeRate.toFixed(1)}%</dd></div>
            <div className="cl-kv"><dt>View-to-follower rate</dt><dd>{viewRate.toFixed(1)}%</dd></div>
            <div style={{ marginTop: 10 }}>
              <div className="cl-small cl-muted" style={{ marginBottom: 6 }}>Audience quality score</div>
              <ProgressBar value={Math.min(100, (engagement || 2) * 14)} />
            </div>
            {!hasIg && (
              <p className="cl-small cl-muted" style={{ marginTop: 10, lineHeight: 1.55 }}>
                This creator hasn't connected Instagram — showing profile-based figures.
                Ask them to connect for live insights.
              </p>
            )}
          </>
        )}
      </Card>

      {/* ---- AUDIENCE DEMOGRAPHICS (real) ---- */}
      {hasIg && (audience.countries?.length > 0 || audience.cities?.length > 0) && (
        <Card style={{ marginBottom: 12 }}>
          <h4 style={{ fontSize: 14, marginBottom: 12 }}>Audience</h4>
          {audience.countries?.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div className="cl-small cl-muted" style={{ marginBottom: 8, fontWeight: 600 }}>Top countries</div>
              {audience.countries.slice(0, 5).map((c) => {
                const max = audience.countries[0]?.value || 1;
                return (
                  <div key={c.name} style={{ marginBottom: 8 }}>
                    <div className="cl-row" style={{ justifyContent: 'space-between', marginBottom: 4 }}>
                      <span className="cl-small" style={{ fontWeight: 600 }}>{c.name}</span>
                      <span className="cl-small cl-muted cl-money">{compact(c.value)}</span>
                    </div>
                    <div className="cl-progress"><i style={{ width: `${Math.round((c.value / max) * 100)}%` }} /></div>
                  </div>
                );
              })}
            </div>
          )}
          {audience.cities?.length > 0 && (
            <div>
              <div className="cl-small cl-muted" style={{ marginBottom: 8, fontWeight: 600 }}>Top cities</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {audience.cities.slice(0, 5).map((c) => (
                  <Chip key={c.name}>{c.name} · {compact(c.value)}</Chip>
                ))}
              </div>
            </div>
          )}
          <p className="cl-small cl-muted" style={{ marginTop: 10, lineHeight: 1.55 }}>
            Live follower demographics from Instagram.
          </p>
        </Card>
      )}

      {/* ---- TOP CONTENT (real per-post insights) ---- */}
      {ranked.length > 0 && (
        <Card style={{ marginBottom: 12 }}>
          <h4 style={{ fontSize: 14, marginBottom: 12 }}>Top performing content</h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {ranked.map((m) => (
              <button
                key={m.id} onClick={() => setViewerMedia(m)}
                style={{
                  position: 'relative', aspectRatio: '1', borderRadius: 8, overflow: 'hidden',
                  background: 'var(--surface-2)', border: 0, padding: 0, cursor: 'pointer',
                  textAlign: 'left',
                }}
                aria-label="View post"
              >
                {(m.thumbnail || m.url) ? (
                  <img src={m.thumbnail || m.url} alt="" loading="lazy"
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center' }}>
                    <ImageIcon style={{ width: 20, height: 20, color: 'var(--faint)' }} />
                  </div>
                )}
                {(m.type === 'VIDEO' || m.type === 'REELS') && (
                  <span style={{ position: 'absolute', top: 6, right: 6, color: '#fff',
                    background: 'rgba(0,0,0,.55)', borderRadius: 6, padding: '2px 6px', fontSize: 10,
                    display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                    <Play style={{ width: 10, height: 10 }} /> Reel
                  </span>
                )}
                <span style={{
                  position: 'absolute', bottom: 0, left: 0, right: 0, padding: '14px 6px 6px',
                  background: 'linear-gradient(transparent, rgba(0,0,0,.75)',
                  color: '#fff', fontSize: 10, fontWeight: 700,
                  display: 'flex', gap: 8, alignItems: 'center',
                }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                    <Eye style={{ width: 11, height: 11 }} />{compact(m.insights?.reach || m.views || m.likes || 0)}
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                    <Heart style={{ width: 11, height: 11 }} />{compact(m.likes || 0)}
                  </span>
                </span>
              </button>
            ))}
          </div>
          <p className="cl-small cl-muted" style={{ marginTop: 10, lineHeight: 1.55 }}>
            Ranked by real reach from Instagram. Tap any post to play it.
          </p>
        </Card>
      )}

      {/* ---- CAMPAIGN ESTIMATION (clearly labeled) ---- */}
      <Card>
        <h4 style={{ fontSize: 14, marginBottom: 10 }}>Campaign estimation</h4>
        <div className="cl-kv"><dt>Projected reach / post</dt><dd>{compact(Math.round(avgViews * 1.4))}</dd></div>
        <div className="cl-kv"><dt>Projected clicks (1.5%)</dt><dd>{compact(Math.round(avgViews * 1.4 * 0.015))}</dd></div>
        <p className="cl-small cl-muted" style={{ marginTop: 8, lineHeight: 1.55 }}>
          Estimates based on {hasIg ? 'live Instagram averages' : 'reported averages'}.
          Actual campaign performance varies.
        </p>
      </Card>

      {viewerMedia && <MediaViewer media={viewerMedia} onClose={() => setViewerMedia(null)} />}
    </div>
  );
}

function ReviewsTab({ creator, canReview, onSubmitted }) {
  const toast = useToast();
  const { user, biz } = useBiz();
  const [reviews, setReviews] = useState(null);
  const [stars, setStars] = useState(5);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let unsub = () => {};
    ensureFirebase().then(({ db }) => {
      const qy = query(collection(db, 'reviews'), where('creatorId', '==', creator.id));
      unsub = onSnapshot(qy, (s) => {
        const list = s.docs.map((d) => ({ id: d.id, ...d.data() }));
        list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        setReviews(list);
      }, () => setReviews([]));
    });
    return () => unsub();
  }, [creator.id]);

  async function submitReview(e) {
    e.preventDefault();
    if (!text.trim()) { toast.err('Please write a few words about the collaboration.'); return; }
    setSending(true);
    try {
      const { db } = await ensureFirebase();
      await addDoc(collection(db, 'reviews'), {
        creatorId: creator.id,
        stars,
        text: text.trim(),
        bizId: user.uid,
        bizName: biz?.bizName || 'Business',
        bizPfp: biz?.pfp || null,
        createdAt: serverTimestamp(),
      });
      // recompute average and cache back to the creator doc
      const snap = await getDocs(query(collection(db, 'reviews'), where('creatorId', '==', creator.id)));
      const all = snap.docs.map((d) => d.data());
      const avg = all.reduce((s, r) => s + (Number(r.stars) || 0), 0) / Math.max(1, all.length);
      await updateDoc(doc(db, 'creators', creator.id), { rating: Math.round(avg * 10) / 10 });
      setText(''); setStars(5);
      toast.ok('Review published. Thank you.');
      onSubmitted?.();
    } catch (err) {
      console.error('[profile] review', err);
      toast.err('Could not publish the review. Please try again.');
    } finally { setSending(false); }
  }

  return (
    <div className="cl-fade">
      {canReview && (
        <Card style={{ marginBottom: 12 }}>
          <h4 style={{ fontSize: 14, marginBottom: 10 }}>Rate this collaboration</h4>
          <form onSubmit={submitReview}>
            <Stars value={stars} onPick={setStars} />
            <div style={{ height: 10 }} />
            <Field>
              <TextArea value={text} onChange={(e) => setText(e.target.value)} placeholder="How was the collaboration? Delivery quality, communication, results…" />
            </Field>
            <Button type="submit" loading={sending} icon={Send} block>Publish review</Button>
          </form>
        </Card>
      )}
      {reviews === null ? <><SkeletonCard /><SkeletonCard /></> : reviews.length === 0 ? (
        <EmptyState icon={MessageSquare} title="No reviews yet" body="Be the first business to review this creator after a completed campaign." />
      ) : (
        reviews.map((r) => (
          <Card key={r.id} style={{ marginBottom: 10 }}>
            <div className="cl-row" style={{ marginBottom: 8 }}>
              <Avatar src={r.bizPfp} name={r.bizName} size={36} />
              <div className="cl-grow">
                <div style={{ fontWeight: 700, fontSize: 13.5 }}>{r.bizName || 'Business'}</div>
                <div className="cl-small cl-muted">{timeAgo(r.createdAt)}</div>
              </div>
              <Stars value={Number(r.stars) || 0} size={15} />
            </div>
            <p className="cl-small" style={{ lineHeight: 1.6 }}>{r.text}</p>
          </Card>
        ))
      )}
    </div>
  );
}

export default function CreatorProfile({ creatorId, onBack }) {
  const { creators, bookings, user, openBooking, goPage } = useBiz();
  const [tab, setTab] = useState('overview');
  const creator = useMemo(
    () => (creators || []).find((c) => c.id === creatorId),
    [creators, creatorId]
  );
  const { biz } = useBiz();
  const pro = isBizPro(biz);

  const canReview = useMemo(() => {
    if (!user) return false;
    return (bookings || []).some(
      (b) => b.creatorId === creatorId && b.bizId === user.uid && b.status === 'Completed'
    );
  }, [bookings, creatorId, user]);

  if (!creator) {
    return (
      <Page pageKey="creator-missing">
        <div className="cl-container" style={{ paddingTop: 16 }}>
          <IconBtn icon={ArrowLeft} label="Back" onClick={onBack} />
          <EmptyState icon={TrendingUp} title="Creator unavailable" body="This profile is no longer listed on Collancer." />
        </div>
      </Page>
    );
  }

  const tabs = [
    { key: 'overview', label: 'Overview' },
    { key: 'demos', label: 'Portfolio', icon: pro ? null : Lock },
    { key: 'analytics', label: 'Analytics', icon: pro ? null : Lock },
    { key: 'reviews', label: 'Reviews' },
  ];

  return (
    <Page pageKey={`creator-${creatorId}`}>
      <div className="cl-container" style={{ paddingTop: 14 }}>
        <div className="cl-row" style={{ marginBottom: 14 }}>
          <IconBtn icon={ArrowLeft} label="Back to discover" onClick={onBack} />
          <div className="cl-grow" />
          {pro && <Badge tone="cyan" icon={Crown}>Pro</Badge>}
        </div>

        {/* header */}
        <Card className="cl-fade" style={{ marginBottom: 14 }}>
          <div className="cl-row" style={{ gap: 14 }}>
            <Avatar src={creator.pfp} name={creator.name} size={76} className="lg" pro={!!creator.creatorIsPro} />
            <div className="cl-grow" style={{ minWidth: 0 }}>
              <div className="cl-row" style={{ gap: 6 }}>
                <h2 style={{ fontSize: 19 }}>{creator.name || 'Creator'}</h2>
                {creator.verified && <VerifiedTick size={18} />}
              </div>
              <div className="cl-small cl-muted" style={{ marginTop: 3 }}>@{creator.handle || 'creator'}</div>
              <div className="cl-row" style={{ gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                <Chip>{creator.platform || 'Instagram'}</Chip>
                {creator.niche && <Chip tag>{creator.niche}</Chip>}
                {creator.city && (
                  <span className="cl-small cl-muted" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <MapPin style={{ width: 13, height: 13 }} />{creator.city}
                  </span>
                )}
              </div>
            </div>
          </div>
          {creator.bio && <p className="cl-small" style={{ marginTop: 12, lineHeight: 1.65, color: 'var(--ink-2)' }}>{creator.bio}</p>}
          {creator.profileLink && (
            <a href={creator.profileLink} target="_blank" rel="noreferrer" className="cl-link cl-row" style={{ marginTop: 8, gap: 6 }}>
              <Link2 style={{ width: 14, height: 14 }} /> View social profile
            </a>
          )}
        </Card>

        <Tabs tabs={tabs} value={tab} onChange={setTab} style={{ marginBottom: 14 }} />

        {tab === 'overview' && <OverviewTab creator={creator} pro={pro} onBook={openBooking} />}
        {tab === 'demos' && <DemosTab creator={creator} pro={pro} goPage={goPage} />}
        {tab === 'analytics' && <AnalyticsTab creator={creator} pro={pro} goPage={goPage} />}
        {tab === 'reviews' && <ReviewsTab creator={creator} canReview={canReview} />}
      </div>
    </Page>
  );
}
