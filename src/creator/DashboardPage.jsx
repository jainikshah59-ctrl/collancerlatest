/* Creator Dashboard — profile completion, verification state, live state,
   active booking state, review summary and rate-card shortcut.
   Per audit §7.2: if not live (verified + addedToCollancer), dashboard stays the
   main page with a checklist. */
import React, { useMemo, useState } from 'react';
import {
  ShieldCheck, BadgeCheck, Rocket, Star, CalendarCheck,
  ChevronRight, AlertCircle, Clock3, CheckCircle2, MessageCircle,
  Bell, Menu, X, Sparkles,
} from 'lucide-react';
import { Page, TopBar, IconBtn, Card, Button, Badge, ProgressBar, Stat } from '../components/ui.jsx';
import { timeAgo } from '../lib/format.js';
import { completionItems, completionPct, isLive } from '../lib/creator.js';

export { completionItems, completionPct, isLive };

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
  const pct = completionPct(creator);
  const items = completionItems(creator);
  const live = isLive(creator);
  const igConnected = !!(creator?.instagram?.connected || creator?.instagram?.username);

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
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <Page pageKey="creator-dashboard">
      <TopBar
        title={`Hi, ${creator?.name?.split(' ')[0] || 'Creator'}`}
        subtitle={live ? 'You are live on Collancer' : 'Finish setup to go live'}
        right={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, position: 'relative' }}>
            <IconBtn icon={Bell} label="Notifications" onClick={() => onNav('notifications')}
              style={unread ? { borderColor: 'var(--cyan)', color: 'var(--cyan-deep)' } : undefined} />
            <button type="button" aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
              style={{ width: 40, height: 40, flexShrink: 0, display: 'grid', placeItems: 'center',
                border: '1px solid var(--line)', borderRadius: 12, background: 'var(--surface)',
                color: 'var(--ink)', boxShadow: 'var(--shadow-sm)', cursor: 'pointer' }}>
              {menuOpen ? <X style={{ width: 20, height: 20 }} /> : <Menu style={{ width: 20, height: 20 }} />}
            </button>
            {menuOpen && (
              <>
                <button type="button" aria-label="Close menu" onClick={() => setMenuOpen(false)}
                  style={{ position: 'fixed', inset: 0, zIndex: 90, border: 0, padding: 0, background: 'transparent', cursor: 'default' }} />
                <div role="menu" aria-label="Creator menu"
                  style={{ position: 'absolute', top: 48, right: 0, zIndex: 91, width: 224,
                    padding: 7, border: '1px solid var(--glass-border)', borderRadius: 16,
                    background: 'var(--surface)', boxShadow: '0 18px 48px rgba(15,23,42,.18)',
                    backdropFilter: 'blur(18px)' }}>
                  {[
                    { key: 'support', label: 'Support', icon: MessageCircle },
                    { key: 'privacy', label: 'Privacy Policy', icon: ShieldCheck },
                    { key: 'terms', label: 'Terms of Service', icon: FileText },
                  ].map((item) => (
                    <button key={item.key} type="button" role="menuitem"
                      onClick={() => { setMenuOpen(false); onNav(item.key); }}
                      style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 11,
                        padding: '11px 10px', border: 0, borderRadius: 10, background: 'transparent',
                        color: 'var(--ink)', textAlign: 'left', cursor: 'pointer', font: 'inherit', fontSize: 13 }}>
                      <item.icon style={{ width: 17, height: 17, color: 'var(--cyan-deep)', flexShrink: 0 }} />
                      <span>{item.label}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        }
      />
      <div className="cl-container" style={{ paddingTop: 14, paddingBottom: 24, display: 'grid', gap: 14 }}>

        {/* Live / setup status */}
        <Card className={live ? '' : 'cl-glass'} style={live ? { borderColor: 'var(--cyan)' } : undefined}>
          <div className="cl-row cl-row-nowrap" style={{ gap: 12 }}>
            <div className={`cl-tile ${live ? 'tint-cyan' : 'tint-grey'}`}>
              {live ? <Rocket /> : <AlertCircle />}
            </div>
            <div className="cl-grow">
              <div className="cl-card-title">
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
              {items.map((it, idx) => (
                <button key={it.key} onClick={() => onNav('profile')} className="cl-list-row"
                  aria-label={`${it.label}: ${it.done ? 'done' : 'go to profile'}`}>
                  <div className="cl-row cl-row-nowrap" style={{
                    gap: 10, padding: '8px 0',
                    borderTop: idx > 0 ? '1px solid var(--line-soft)' : 'none',
                  }}>
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
          <div className="cl-row cl-row-nowrap" style={{ gap: 12 }}>
            <div className="cl-tile tint-cyan">
              <ShieldCheck />
            </div>
            <div className="cl-grow">
              <div className="cl-card-title">Verification</div>
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
          <Stat className="cl-creator-stat" label="Pending requests" value={pendingCount} icon={Clock3} tone="amber" />
          <Stat className="cl-creator-stat" label="Avg rating" value={avgRating ? avgRating.toFixed(1) : '—'} icon={Star} tone="violet" />
          <Stat className="cl-creator-stat" label="Reviews" value={reviews?.length || 0} icon={MessageCircle} tone="green" />
        </div>

        {/* Collancer AI — featured 3D glass card matching verification card footprint */}
        <Card className="cl-ai-feature-card">
          <div className="cl-ai-feature-inner">
            <div className="cl-ai-feature-orb" aria-hidden="true">
              <div className="cl-ai-feature-orb-core"><Sparkles /></div>
              <span className="cl-ai-feature-orbit cl-ai-feature-orbit-one" />
              <span className="cl-ai-feature-orbit cl-ai-feature-orbit-two" />
            </div>
            <div className="cl-grow cl-ai-feature-copy">
              <div className="cl-ai-feature-eyebrow">YOUR CREATOR ASSISTANT</div>
              <div className="cl-card-title">Collancer AI</div>
              <div className="cl-small cl-muted" style={{ marginTop: 3, lineHeight: 1.5 }}>
                Get smart help with collaborations, bookings, earnings and growing your creator profile.
              </div>
            </div>
          </div>
          <Button block size="sm" icon={Sparkles} onClick={() => onNav('collancer-ai')} className="cl-ai-feature-button">
            Open Collancer AI
          </Button>
        </Card>

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
                  <div className="cl-row cl-row-nowrap" style={{ gap: 10 }}>
                    <div className="cl-grow" style={{ minWidth: 0 }}>
                      <div className="cl-card-title" style={{ fontSize: 'var(--fs-md)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
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
            <div className="cl-row cl-row-nowrap" style={{ gap: 12 }}>
              <div className="cl-tile tint-cyan">
                <CalendarCheck />
              </div>
              <div className="cl-grow">
                <div className="cl-card-title" style={{ fontSize: 'var(--fs-md)' }}>{pendingCount} new booking request{pendingCount > 1 ? 's' : ''}</div>
                <div className="cl-small cl-muted">Review and accept or reject them.</div>
              </div>
              <ChevronRight style={{ width: 17, height: 17, color: 'var(--faint)' }} />
            </div>
          </Card>
        )}

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
