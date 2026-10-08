/* Public creator profile — no login required.
   URL: /c/{handle} e.g. collancer.in/c/jainikshah
   Shows: header (photo, name, headline, badges), stats, packages,
   portfolio, reviews. Share button. Collabstr-style. */
import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, Star, MapPin, Share2, BadgeCheck, Check,
  ShoppingBag, MessageCircle, Eye, Heart, Play,
} from 'lucide-react';
import {
  ensureFirebase, db, doc, getDoc, collection, query, where, getDocs,
} from './lib/firebase.js';
import { PROMO_TYPES } from './lib/constants.js';
import NegotiationModal from './components/NegotiationModal.jsx';
import { compact, inr, timeAgo } from './lib/format.js';
import {
  Page, TopBar, Card, Button, Avatar, Badge, Chip, EmptyState,
  SkeletonCard, useToast, ToastProvider, VerifiedTick,
} from './components/ui.jsx';
import MediaViewer from './components/MediaViewer.jsx';

const normHandle = (h) => (h || '').trim().toLowerCase().replace(/^@/, '');

function Stat({ v, l }) {
  return (
    <div style={{ textAlign: 'center', flex: 1 }}>
      <div style={{ fontWeight: 800, fontSize: 17 }}>{v}</div>
      <div className="cl-small cl-muted">{l}</div>
    </div>
  );
}

export default function PublicCreatorProfile({ handle }) {
  const toast = useToast();
  const [creator, setCreator] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [viewerMedia, setViewerMedia] = useState(null);
  const [copied, setCopied] = useState(false);
  const [selPkg, setSelPkg] = useState(null);
  const [negotiationOpen, setNegotiationOpen] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        await ensureFirebase();
        const h = normHandle(handle);
        // Resolve handle -> creatorId via creatorHandles
        const hSnap = await getDoc(doc(db(), 'creatorHandles', h));
        if (!hSnap.exists()) { setNotFound(true); setLoading(false); return; }
        const creatorId = hSnap.data().creatorId;
        const cSnap = await getDoc(doc(db(), 'creators', creatorId));
        if (!cSnap.exists()) { setNotFound(true); setLoading(false); return; }
        const data = { id: cSnap.id, ...cSnap.data() };
        setCreator(data);
        // Reviews
        try {
          const rq = query(collection(db(), 'reviews'), where('creatorId', '==', creatorId));
          const rs = await getDocs(rq);
          setReviews(rs.docs.map((d) => ({ id: d.id, ...d.data() })));
        } catch { /* reviews optional */ }
        // Default select first enabled package
        const pkgs = data.packages || {};
        const first = Object.keys(pkgs).find((k) => pkgs[k]?.enabled !== false && data.prices?.[k]);
        if (first) setSelPkg(first);
      } catch (e) {
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    })();
  }, [handle]);

  const packages = useMemo(() => {
    if (!creator) return [];
    const pkgs = creator.packages || {};
    return PROMO_TYPES.filter((p) => {
      const m = pkgs[p.key];
      return m?.enabled !== false && creator.prices?.[p.key];
    }).map((p) => ({
      ...p,
      price: creator.prices[p.key],
      salePrice: creator.discountedPrices?.[p.key] || null,
      description: pkgs[p.key]?.description || p.desc,
      deliveryDays: pkgs[p.key]?.deliveryDays || null,
    }));
  }, [creator]);

  const media = useMemo(() => {
    if (!creator) return [];
    const ids = creator.featuredMediaIds || [];
    const all = creator.instagramClient?.recentMedia || creator.instagram?.recentMedia || [];
    if (!ids.length) return all.slice(0, 12);
    return all.filter((m) => ids.includes(m.id)).slice(0, 12);
  }, [creator]);

  const avgRating = useMemo(() => {
    if (!reviews.length) return Number(creator?.rating || 0);
    return reviews.reduce((a, r) => a + Number(r.stars || 0), 0) / reviews.length;
  }, [reviews, creator]);

  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) { await navigator.share({ title: creator.name, url }); return; }
      await navigator.clipboard.writeText(url);
      setCopied(true); toast.ok('Profile link copied!');
      setTimeout(() => setCopied(false), 2000);
    } catch { toast.err('Could not share.'); }
  };

  if (loading) return <Page><TopBar title="Creator" /><SkeletonCard /><SkeletonCard /></Page>;
  if (notFound || !creator) {
    return (
      <Page>
        <TopBar title="Creator" />
        <EmptyState title="Creator not found" desc="This profile link is invalid or the creator removed their profile." />
        <div style={{ padding: '0 16px' }}>
          <Button block onClick={() => { window.location.href = '/'; }}>Go to Collancer</Button>
        </div>
      </Page>
    );
  }

  const ig = creator.instagramClient || creator.instagram || {};
  const sel = packages.find((p) => p.key === selPkg);
  const isTop = (creator.completedOrders || 0) >= 5 && avgRating >= 4.5;
  const beginBusinessFlow = (action) => {
    try {
      sessionStorage.setItem('collancer_public_intent', JSON.stringify({
        action, creatorId: creator.id, packageKey: selPkg,
      }));
    } catch {}
    window.location.href = '/?role=business';
  };

  return (
    <Page>
      <TopBar
        title={`@${creator.handle || handle}`}
        left={<ArrowLeft style={{ width: 20, height: 20 }} />}
        onLeft={() => { window.location.href = '/'; }}
        right={
          <Button size="sm" variant="ghost" onClick={share} icon={copied ? Check : Share2}>
            {copied ? 'Copied' : 'Share'}
          </Button>
        }
      />

      {/* Header */}
      <div style={{ padding: '18px 16px 0' }}>
        <div className="cl-row" style={{ gap: 14, alignItems: 'center' }}>
          <Avatar src={creator.pfp || ig.profilePictureUrl} size={76} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="cl-row" style={{ gap: 6, alignItems: 'center' }}>
              <span style={{ fontWeight: 800, fontSize: 18 }}>{creator.name}</span>
              {(creator.verified || creator.igGoLive) && <VerifiedTick size={18} />}
            </div>
            {creator.headline && (
              <div style={{ fontWeight: 700, fontSize: 13, letterSpacing: 0.4, marginTop: 2, color: 'var(--ink)' }}>
                {creator.headline.toUpperCase()}
              </div>
            )}
            <div className="cl-row cl-small cl-muted" style={{ gap: 8, marginTop: 4 }}>
              {avgRating > 0 && (
                <span className="cl-row" style={{ gap: 3, alignItems: 'center' }}>
                  <Star style={{ width: 13, height: 13, fill: '#f5a623', color: '#f5a623' }} />
                  <b>{avgRating.toFixed(1)}</b> · {reviews.length} reviews
                </span>
              )}
              {creator.city && (
                <span className="cl-row" style={{ gap: 3, alignItems: 'center' }}>
                  <MapPin style={{ width: 13, height: 13 }} /> {creator.city}
                </span>
              )}
            </div>
          </div>
        </div>

        {isTop && (
          <div style={{ marginTop: 10 }}>
            <Badge tone="gold">★ Top Creator</Badge>
            <span className="cl-small cl-muted" style={{ marginLeft: 8 }}>
              Completed {creator.completedOrders}+ orders with high ratings
            </span>
          </div>
        )}

        {creator.bio && !ig.bio && (
          <p className="cl-small" style={{ marginTop: 10, lineHeight: 1.6 }}>{creator.bio}</p>
        )}
        {ig.bio && (
          <p className="cl-small" style={{ marginTop: 10, lineHeight: 1.6 }}>{ig.bio}</p>
        )}

        {/* Stats */}
        <div className="cl-row" style={{ marginTop: 14, padding: '12px 0', borderTop: '1px solid var(--line)', borderBottom: '1px solid var(--line)' }}>
          <Stat v={compact(ig.followersCount || creator.followers || 0)} l="Followers" />
          <Stat v={`${Number(creator.engagement || ig.engagementRate || 0).toFixed(1)}%`} l="Engagement" />
          <Stat v={compact(ig.avgViews || creator.avgViews || 0)} l="Avg views" />
        </div>
      </div>

      {/* Packages */}
      {packages.length > 0 && (
        <div style={{ padding: '16px 16px 0' }}>
          <h3 style={{ fontSize: 16, marginBottom: 10 }}>Packages</h3>
          <div style={{ display: 'grid', gap: 10 }}>
            {packages.map((p) => (
              <button
                key={p.key}
                onClick={() => setSelPkg(p.key)}
                style={{
                  textAlign: 'left', background: selPkg === p.key ? 'var(--cyan-soft)' : 'var(--card)',
                  border: `1.5px solid ${selPkg === p.key ? 'var(--cyan)' : 'var(--line)'}`,
                  borderRadius: 12, padding: 12, cursor: 'pointer', width: '100%',
                }}
              >
                <div className="cl-row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>1 × {p.label}</div>
                  <div style={{ fontWeight: 800, fontSize: 16 }}>
                    {p.salePrice ? (
                      <>
                        <span style={{ textDecoration: 'line-through', color: 'var(--faint)', fontSize: 13, marginRight: 6 }}>
                          {inr(p.price)}
                        </span>
                        {inr(p.salePrice)}
                      </>
                    ) : inr(p.price)}
                  </div>
                </div>
                <div className="cl-small cl-muted" style={{ marginTop: 4, lineHeight: 1.5 }}>
                  {p.description}
                  {p.deliveryDays && ` · Delivered in ${p.deliveryDays} days`}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Portfolio */}
      {media.length > 0 && (
        <div style={{ padding: '16px 16px 0' }}>
          <h3 style={{ fontSize: 16, marginBottom: 10 }}>Portfolio</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
            {media.map((m) => (
              <button
                key={m.id}
                onClick={() => setViewerMedia(m)}
                style={{ border: 0, padding: 0, borderRadius: 8, overflow: 'hidden', cursor: 'pointer', aspectRatio: '1', background: 'var(--wash)' }}
              >
                {m.media_type === 'VIDEO' || m.thumbnail_url ? (
                  <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                    <img src={m.thumbnail_url || m.media_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
                    <Play style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 22, height: 22, color: '#fff', opacity: 0.9 }} />
                  </div>
                ) : (
                  <img src={m.media_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Reviews */}
      <div style={{ padding: '16px 16px 0' }}>
        <h3 style={{ fontSize: 16, marginBottom: 10 }}>
          Reviews {reviews.length > 0 && <span className="cl-muted" style={{ fontWeight: 400 }}>({reviews.length})</span>}
        </h3>
        {reviews.length === 0 ? (
          <p className="cl-small cl-muted">No reviews yet.</p>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {reviews.slice(0, 5).map((r) => (
              <Card key={r.id} style={{ padding: 12 }}>
                <div className="cl-row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <div className="cl-row" style={{ gap: 3 }}>
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Star key={s} style={{ width: 13, height: 13, fill: s <= (r.stars || 0) ? '#f5a623' : 'var(--wash)', color: s <= (r.stars || 0) ? '#f5a623' : 'var(--faint)' }} />
                    ))}
                  </div>
                  <span className="cl-small cl-muted">{r.createdAt ? timeAgo(r.createdAt.toMillis ? r.createdAt.toMillis() : r.createdAt) : ''}</span>
                </div>
                {r.text && <p className="cl-small" style={{ lineHeight: 1.6 }}>{r.text}</p>}
                <div className="cl-small cl-muted" style={{ marginTop: 4 }}>— Verified brand</div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Sticky order widget */}
      {sel && (
        <div style={{
          position: 'sticky', bottom: 0, background: 'var(--card)',
          borderTop: '1px solid var(--line)', padding: '12px 16px',
          paddingBottom: 'calc(12px + env(safe-area-inset-bottom))',
          marginTop: 18,
        }}>
          <div className="cl-row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div>
              <div className="cl-small cl-muted">1 × {sel.label}</div>
              <div style={{ fontWeight: 800, fontSize: 20 }}>{inr(sel.salePrice || sel.price)}</div>
            </div>
            <div className="cl-row" style={{ gap: 8 }}>
              <Button variant="secondary" onClick={() => beginBusinessFlow('negotiate')}>
                Negotiate
              </Button>
              <Button icon={ShoppingBag} onClick={() => beginBusinessFlow('book')}>
                Book Now
              </Button>
            </div>
          </div>
          <p className="cl-small cl-muted" style={{ textAlign: 'center', margin: 0 }}>
            Payments are protected — released only after delivery approval.
          </p>
        </div>
      )}

      {negotiationOpen && sel && (
        <NegotiationModal
          mode="business"
          creator={creator}
          user={null}
          packageKey={sel.key}
          onClose={() => setNegotiationOpen(false)}
        />
      )}

      {viewerMedia && (
        <MediaViewer media={viewerMedia} onClose={() => setViewerMedia(null)} />
      )}
    </Page>
  );
}

export function PublicCreatorProfileWrap({ handle }) {
  return (
    <ToastProvider>
      <PublicCreatorProfile handle={handle} />
    </ToastProvider>
  );
}
