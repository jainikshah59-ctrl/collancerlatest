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
  const followers = Number(creator.followers || creator.ytSubscribers || 0);
  const engagement = Number(creator.engagement || 0);
  const avgViews = Number(creator.avgViews || Math.round(followers * (engagement > 0 ? engagement : 3) / 100));
  const avgLikes = Number(creator.avgLikes || Math.round(avgViews * 0.06));
  const reach = Number(creator.reach || Math.round(avgViews * 1.4));
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
        <div className="cl-kv"><dt>Estimated likes</dt><dd>{compact(avgLikes)}</dd></div>
        <div className="cl-kv"><dt>Estimated reach</dt><dd>{compact(reach)}</dd></div>
        <div className="cl-kv"><dt>Conversion range</dt><dd>{compact(convLo)} – {compact(convHi)} actions</dd></div>
        <p className="cl-small cl-muted" style={{ marginTop: 8, lineHeight: 1.55 }}>
          Estimates are derived from the creator's reported audience stats.
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
  if (demos.length === 0) {
    return <EmptyState icon={Play} title="No portfolio pieces yet" body="This creator hasn't added portfolio pieces." />;
  }
  return (
    <div className="cl-fade" style={{ display: 'grid', gap: 12 }}>
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
  if (!pro) return <ProLock goPage={goPage} />;
  const followers = Number(creator.followers || creator.ytSubscribers || 0);
  const engagement = Number(creator.engagement || 0);
  const avgViews = Number(creator.avgViews || Math.round(followers * (engagement > 0 ? engagement : 3) / 100));
  const avgLikes = Number(creator.avgLikes || Math.round(avgViews * 0.06));
  const likeRate = avgViews > 0 ? (avgLikes / avgViews) * 100 : 0;
  const viewRate = followers > 0 ? (avgViews / followers) * 100 : 0;
  const bars = PROMO_TYPES.map((p) => {
    const mult = { story: 0.7, reel: 1, video: 0.85, personalvideo: 0.6, personalad: 0.9, ytshorts: 1.1 }[p.key] || 1;
    return { label: p.label, v: Math.round(avgViews * mult) };
  });
  const max = Math.max(...bars.map((b) => b.v), 1);

  return (
    <div className="cl-fade">
      <Card style={{ marginBottom: 12 }}>
        <h4 style={{ fontSize: 14, marginBottom: 12 }}>Engagement</h4>
        <div className="cl-kv"><dt>Engagement rate</dt><dd>{engagement ? `${engagement.toFixed(1)}%` : '—'}</dd></div>
        <div className="cl-kv"><dt>Like-to-view rate</dt><dd>{likeRate.toFixed(1)}%</dd></div>
        <div className="cl-kv"><dt>View-to-follower rate</dt><dd>{viewRate.toFixed(1)}%</dd></div>
        <div style={{ marginTop: 10 }}>
          <div className="cl-small cl-muted" style={{ marginBottom: 6 }}>Audience quality score</div>
          <ProgressBar value={Math.min(100, (engagement || 2) * 14)} />
        </div>
      </Card>
      <Card style={{ marginBottom: 12 }}>
        <h4 style={{ fontSize: 14, marginBottom: 12 }}>Estimated views by format</h4>
        {bars.map((b) => (
          <div key={b.label} style={{ marginBottom: 10 }}>
            <div className="cl-row" style={{ justifyContent: 'space-between', marginBottom: 5 }}>
              <span className="cl-small" style={{ fontWeight: 600 }}>{b.label}</span>
              <span className="cl-small cl-muted cl-money">{compact(b.v)}</span>
            </div>
            <div className="cl-progress"><i style={{ width: `${Math.round((b.v / max) * 100)}%` }} /></div>
          </div>
        ))}
        <p className="cl-small cl-muted" style={{ marginTop: 8, lineHeight: 1.55 }}>
          Derived from reported averages. Actual campaign performance varies.
        </p>
      </Card>
      <Card>
        <h4 style={{ fontSize: 14, marginBottom: 10 }}>Campaign estimation</h4>
        <div className="cl-kv"><dt>Projected reach / post</dt><dd>{compact(Math.round(avgViews * 1.4))}</dd></div>
        <div className="cl-kv"><dt>Projected clicks (1.5%)</dt><dd>{compact(Math.round(avgViews * 1.4 * 0.015))}</dd></div>
        <div className="cl-kv"><dt>Best format for reach</dt><dd>{bars.reduce((a, b) => (b.v > a.v ? b : a), bars[0]).label}</dd></div>
      </Card>
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
