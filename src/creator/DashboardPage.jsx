/* Creator Dashboard — profile completion, verification state, live state,
   active booking state, review summary and rate-card shortcut.
   Per audit §7.2: if not live (verified + addedToCollancer), dashboard stays the
   main page with a checklist. */
import React, { useMemo, useState } from 'react';
import {
  ShieldCheck, BadgeCheck, Rocket, Star, Wallet, CalendarCheck, Store,
  Sparkles, ChevronRight, AlertCircle, Clock3, CheckCircle2, MessageCircle, Megaphone,
} from 'lucide-react';
import { Page, TopBar, IconBtn, Card, Button, Badge, ProgressBar, Stat, EmptyState, useToast } from '../components/ui.jsx';
import { Bell } from 'lucide-react';
import { compact, inr, timeAgo } from '../lib/format.js';
import { promoLabel } from '../lib/constants.js';

export function completionItems(creator) {
  const c = creator || {};
  const prices = c.prices || {};
  const igUsername = c.instagram?.username || c.instagram?.userName || '';
  return [
    { key: 'name', label: 'Display name', done: !!(c.name && c.name.trim()) },
    { key: 'handle', label: 'Creator handle', done: !!((c.handle && c.handleLower) || igUsername) },
    { key: 'bio', label: 'Bio', done: !!(c.bio && c.bio.trim().length >= 10) },
    { key: 'platform', label: 'Platform', done: !!c.platform },
    { key: 'niche', label: 'Niche', done: !!c.niche },
    { key: 'city', label: 'City', done: !!c.city },
    { key: 'price', label: 'At least one rate-card price', done: Object.values(prices).some((v) => Number(v) > 0) },
  ];
}

export function completionPct(creator) {
  const items = completionItems(creator);
  return Math.round((items.filter((i) => i.done).length / items.length) * 100);
}

export function isLive(creator) {
  if (!creator) return false;
  // All creators follow the same manual admin-review gate. Instagram is optional.
  return !!(creator.verified && creator.addedToCollancer);
}

function verificationTone(v) {
  if (!v) return { tone: 'grey', label: 'Not submitted' };
  if (v.status === 'verified') return { tone: 'green', label: 'Verified' };
  if (v.status === 'rejected') return { tone: 'red', label: 'Rejected — resubmit' };
  return { tone: 'amber', label: 'Under review' };
}

export default function DashboardPage({
  creator, bookings, reviews, verification,
  unread, onNav, onOverlay, onOpenBooking,
}) {
  const toast = useToast();
  const [goingLive, setGoingLive] = useState(false);
  const pct = completionPct(creator);
  const items = completionItems(creator);
  const live = isLive(creator);
  const igConnected = !!(creator?.instagram?.connected || creator?.instagram?.username);

  async function goLive() {
    if (goingLive) return;
    setGoingLive(true);
    try {
      const { idToken } = await import('../lib/instagram.js');
      const token = await idToken();
      const r = await fetch('/api/creator-go-live', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: token }),
      });
      const j = await r.json();
      if (!j?.ok) throw new Error(j?.reason || 'go-live-failed');
      toast.ok('You are live on Collancer! Brands can now discover you.');
      window.location.reload();
    } catch (e) {
      toast.err('Could not go live. Please try again.');
      setGoingLive(false);
    }
  }
  const vt = verificationTone(verification);

  const activeBookings = useMemo(
    () => (bookings || []).filter((b) => b.status === 'Active' || b.status === 'PendingCompletion'),
    [bookings],
  );
  const pendingCount = useMemo(() => (bookings || []).filter((b) => b.status === 'Pending').length, [bookings]);
  const avgRating = useMemo(() => {
    if (!reviews || !reviews.length) return Number(creator?.rating || 0);
    const s = reviews.reduce((a, r) => a + Number(r.stars || 0), 0);
    return s / reviews.length;
  }, [reviews, creator]);

  const missing = items.filter((i) => !i.done);

  return (
    <Page pageKey="creator-dashboard">
      <TopBar
        title={`Hi, ${creator?.name?.split(' ')[0] || 'Creator'}`}
        subtitle={live ? 'You are live on Collancer' : 'Finish setup to go live'}
        right={
          <IconBtn icon={Bell} label="Notifications" onClick={() => onNav('notifications')}
            style={unread ? { borderColor: 'var(--cyan)', color: 'var(--cyan-deep)' } : undefined} />
        }
      />
      <div className="cl-container" style={{ paddingTop: 14, paddingBottom: 24, display: 'grid', gap: 14 }}>

        {/* Live / setup status */}
        <Card className={live ? '' : 'cl-glass'} style={live ? { borderColor: 'var(--cyan)', borderWidth: 1.5 } : undefined}>
          <div className="cl-row cl-dashboard-status-row" style={{ gap: 12 }}>
            <div className="cl-dashboard-status-icon" style={{
              width: 46, height: 46, borderRadius: 8, display: 'grid', placeItems: 'center', flexShrink: 0,
              background: live ? 'var(--cyan-soft)' : 'var(--surface-2)', color: live ? 'var(--cyan-deep)' : 'var(--muted)',
            }}>
              {live ? <Rocket style={{ width: 22, height: 22 }} /> : <AlertCircle style={{ width: 22, height: 22 }} />}
            </div>
            <div className="cl-grow">
              <div style={{ fontWeight: 700, fontSize: 15 }}>
                {live ? 'Profile is live' : 'Not live yet'}
              </div>
              <div className="cl-small cl-muted" style={{ marginTop: 2, lineHeight: 1.5 }}>
                {live
                  ? 'Brands can discover and book you right now.'
                  : igConnected
                    ? 'Your profile is ready for admin review. Instagram is optional during onboarding.'
                    : 'Complete your profile and submit verification. Admin approval is required before you go live.'}
              </div>
            </div>
            {live && <Badge tone="cyan" icon={BadgeCheck}>Live</Badge>}
          </div>
          {false && igConnected && (
            <Button block size="lg" onClick={goLive} disabled={goingLive} icon={Rocket}
              style={{ marginTop: 14, background: 'linear-gradient(135deg, #06b6d4, #0891b2)', border: 'none' }}>
              {goingLive ? 'Going live…' : 'Go Live on Collancer'}
            </Button>
          )}
          {!live && (
            <div style={{ marginTop: 12 }}>
              <ProgressBar value={pct} />
              <div className="cl-small cl-muted" style={{ marginTop: 6 }}>{pct}% profile complete</div>
            </div>
          )}
        </Card>

        {/* Checklist when not live */}
        {!live && missing.length > 0 && (
          <Card>
            <div className="cl-section-title"><h3>Setup checklist</h3><span className="cl-small cl-muted">{items.length - missing.length}/{items.length}</span></div>
            <div style={{ display: 'grid', gap: 8 }}>
              {items.map((it) => (
                <button key={it.key} onClick={() => onNav('profile')}
                  style={{ all: 'unset', cursor: 'pointer' }}>
                  <div className="cl-row" style={{ gap: 10, padding: '8px 0', borderTop: '1px solid var(--line-soft)' }}>
                    {it.done
                      ? <CheckCircle2 style={{ width: 18, height: 18, color: 'var(--green)', flexShrink: 0 }} />
                      : <Clock3 style={{ width: 18, height: 18, color: 'var(--amber)', flexShrink: 0 }} />}
                    <span className="cl-small" style={{ fontWeight: it.done ? 400 : 600, color: it.done ? 'var(--muted)' : 'var(--ink)' }}>
                      {it.label}
                    </span>
                    {!it.done && <ChevronRight style={{ width: 15, height: 15, color: 'var(--faint)', marginLeft: 'auto' }} />}
                  </div>
                </button>
              ))}
            </div>
          </Card>
        )}

        {/* Verification state */}
        <Card>
          <div className="cl-row" style={{ gap: 12 }}>
            <div style={{ width: 44, height: 44, borderRadius: 8, background: 'var(--surface-2)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
              <ShieldCheck style={{ width: 21, height: 21, color: 'var(--cyan-deep)' }} />
            </div>
            <div className="cl-grow">
              <div style={{ fontWeight: 700, fontSize: 15 }}>Verification</div>
              <div className="cl-small cl-muted" style={{ marginTop: 2 }}>
                {verification?.status === 'verified' ? 'Identity and socials confirmed.' :
                  verification?.status === 'rejected' ? 'Needs attention — see reason and resubmit.' :
                    verification ? 'Submitted — our team is reviewing it.' : 'Required to go live on Collancer.'}
              </div>
            </div>
            <Badge tone={vt.tone}>{vt.label}</Badge>
          </div>
          {verification?.status !== 'verified' && (
            <Button variant="light" block size="sm" style={{ marginTop: 12 }} onClick={() => onOverlay('verification')}
              icon={ShieldCheck}>
              {verification ? (verification.status === 'rejected' ? 'Fix & resubmit verification' : 'View verification status') : 'Submit verification'}
            </Button>
          )}
        </Card>

        {/* Quick stats */}
        <div className="cl-dashboard-stat-grid">
          <Stat className="cl-creator-stat" label="Active bookings" value={activeBookings.length} icon={CalendarCheck} tone="cyan" />
          <Stat className="cl-creator-stat" label="Pending requests" value={pendingCount} icon={Clock3} />
          <Stat className="cl-creator-stat" label="Avg rating" value={avgRating ? avgRating.toFixed(1) : '—'} icon={Star} />
          <Stat className="cl-creator-stat" label="Reviews" value={reviews?.length || 0} icon={MessageCircle} />
        </div>

        {/* Active bookings strip */}
        {activeBookings.length > 0 && (
          <div>
            <div className="cl-section-title">
              <h3>Needs your action</h3>
              <button className="cl-link" style={{ border: 0, background: 'none', cursor: 'pointer' }} onClick={() => onNav('bookings')}>View all</button>
            </div>
            <div style={{ display: 'grid', gap: 10 }}>
              {activeBookings.slice(0, 3).map((b) => (
                <Card key={b.id} pressable onClick={() => onOpenBooking(b.id)} style={{ padding: 14 }}>
                  <div className="cl-row" style={{ gap: 10 }}>
                    <div className="cl-grow" style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {b.campaignName || b.productName || 'Collaboration'}
                      </div>
                      <div className="cl-small cl-muted" style={{ marginTop: 3 }}>
                        {b.bizName || 'Brand'} · {b.status === 'PendingCompletion' ? 'Under admin review' : 'In progress'}
                      </div>
                    </div>
                    <Badge tone={b.status === 'PendingCompletion' ? 'amber' : 'cyan'}>{b.status === 'PendingCompletion' ? 'In review' : 'Active'}</Badge>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}
        {pendingCount > 0 && activeBookings.length === 0 && (
          <Card pressable onClick={() => onNav('bookings')} className="cl-glass">
            <div className="cl-row" style={{ gap: 12 }}>
              <CalendarCheck style={{ width: 22, height: 22, color: 'var(--cyan-deep)', flexShrink: 0 }} />
              <div className="cl-grow">
                <div style={{ fontWeight: 700, fontSize: 14 }}>{pendingCount} new booking request{pendingCount > 1 ? 's' : ''}</div>
                <div className="cl-small cl-muted">Review and accept or reject them.</div>
              </div>
              <ChevronRight style={{ width: 17, height: 17, color: 'var(--faint)' }} />
            </div>
          </Card>
        )}

        {/* Shortcuts */}
        <div className="cl-dashboard-shortcut-grid">
          <Card pressable lift onClick={() => onNav('profile', 'ratecard')} style={{ textAlign: 'center', padding: 18 }}>
            <Wallet style={{ width: 22, height: 22, color: 'var(--cyan-deep)', margin: '0 auto 8px' }} />
            <div style={{ fontWeight: 700, fontSize: 13.5 }}>Set up rate card</div>
            <div className="cl-small cl-muted" style={{ marginTop: 3 }}>Story, reel, video prices</div>
          </Card>
          <Card pressable lift onClick={() => onNav('marketplace')} style={{ textAlign: 'center', padding: 18 }}>
            <Store style={{ width: 22, height: 22, color: 'var(--cyan-deep)', margin: '0 auto 8px' }} />
            <div style={{ fontWeight: 700, fontSize: 13.5 }}>Marketplace</div>
            <div className="cl-small cl-muted" style={{ marginTop: 3 }}>Pitch on brand briefs</div>
          </Card>
          <Card pressable lift onClick={() => onNav('earnings')} style={{ textAlign: 'center', padding: 18 }}>
            <Wallet style={{ width: 22, height: 22, color: 'var(--cyan-deep)', margin: '0 auto 8px' }} />
            <div style={{ fontWeight: 700, fontSize: 13.5 }}>Earnings</div>
            <div className="cl-small cl-muted" style={{ marginTop: 3 }}>Withdraw your share</div>
          </Card>
          <Card pressable lift onClick={() => onNav('collancer-ai')} style={{ textAlign: 'center', padding: 18 }}>
            <Sparkles style={{ width: 22, height: 22, color: 'var(--cyan-deep)', margin: '0 auto 8px' }} />
            <div style={{ fontWeight: 700, fontSize: 13.5 }}>Collancer AI</div>
            <div className="cl-small cl-muted" style={{ marginTop: 3 }}>Pricing & pitch help</div>
          </Card>
          <Card pressable lift onClick={() => onOverlay('demos')} style={{ textAlign: 'center', padding: 18 }}>
            <Megaphone style={{ width: 22, height: 22, color: 'var(--cyan-deep)', margin: '0 auto 8px' }} />
            <div style={{ fontWeight: 700, fontSize: 13.5 }}>Promo demos</div>
            <div className="cl-small cl-muted" style={{ marginTop: 3 }}>Your portfolio videos</div>
          </Card>
          <Card pressable lift onClick={() => onNav('support')} style={{ textAlign: 'center', padding: 18 }}>
            <AlertCircle style={{ width: 22, height: 22, color: 'var(--cyan-deep)', margin: '0 auto 8px' }} />
            <div style={{ fontWeight: 700, fontSize: 13.5 }}>Help & legal</div>
            <div className="cl-small cl-muted" style={{ marginTop: 3 }}>Support, privacy, terms</div>
          </Card>
        </div>

        {/* Latest review */}
        {reviews && reviews.length > 0 && (
          <div>
            <div className="cl-section-title"><h3>Latest review</h3></div>
            <Card>
              <div className="cl-row" style={{ gap: 8, marginBottom: 8 }}>
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} style={{
                    width: 15, height: 15,
                    color: i < Math.round(Number(reviews[0].stars || 0)) ? '#f59e0b' : 'var(--faint)',
                    fill: i < Math.round(Number(reviews[0].stars || 0)) ? '#f59e0b' : 'none',
                  }} />
                ))}
                <span className="cl-small cl-muted" style={{ marginLeft: 4 }}>{reviews[0].bizName || 'Brand'}</span>
              </div>
              <p className="cl-small" style={{ lineHeight: 1.6 }}>{reviews[0].text || reviews[0].review || 'Great collaboration.'}</p>
              <div className="cl-small cl-muted" style={{ marginTop: 8 }}>{timeAgo(reviews[0].createdAt)}</div>
            </Card>
          </div>
        )}
      </div>
    </Page>
  );
}
