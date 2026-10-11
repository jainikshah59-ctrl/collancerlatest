/* Creator Dashboard — Liquid Glass redesign based on the supplied Collancer Home HTML.
   Keeps live creator data, setup actions, verification flow, booking navigation and AI navigation. */
import React, { useMemo, useState } from 'react';
import {
  ShieldCheck, BadgeCheck, Rocket, Star, CalendarCheck, ChevronRight,
  AlertCircle, Clock3, CheckCircle2, MessageCircle, Bell, Menu, X,
  Sparkles, FileText, CircleHelp, LayoutDashboard, Store, IndianRupee, User, Wrench,
} from 'lucide-react';
import { Page } from '../components/ui.jsx';
import { timeAgo } from '../lib/format.js';
import { completionItems, completionPct, isLive } from '../lib/creator.js';

export { completionItems, completionPct, isLive };

function verificationTone(v) {
  if (!v) return { tone: 'grey', label: 'Not submitted' };
  if (v.status === 'verified') return { tone: 'green', label: 'Verified' };
  if (v.status === 'rejected') return { tone: 'red', label: 'Rejected — resubmit' };
  return { tone: 'amber', label: 'Under review' };
}

const HomeStyles = () => (
  <style>{`
    .cl-home-dashboard{--home-ink:#0b1217;--home-muted:#55616d;--home-line:rgba(15,40,60,.09);color:var(--home-ink);padding:0 0 22px;overflow:hidden}
    .cl-home-dashboard *{box-sizing:border-box}
    .cl-home-dashboard .home-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:22px 20px 0}
    .cl-home-dashboard .home-greeting{font-size:24px;font-weight:850;letter-spacing:-.6px;line-height:1.15}
    .cl-home-dashboard .home-subtitle{margin-top:4px;font-size:14px;color:var(--home-muted)}
    .cl-home-dashboard .home-head-actions{display:flex;gap:9px;flex-shrink:0}
    .cl-home-dashboard .home-icon-button{width:38px;height:38px;border:0;padding:0;display:grid;place-items:center;border-radius:13px;cursor:pointer;color:#fff;box-shadow:inset 0 1px 1px rgba(255,255,255,.7),inset 0 -3px 5px rgba(0,0,0,.16),0 7px 14px -7px rgba(15,50,80,.38);transition:transform .22s ease}
    .cl-home-dashboard .home-icon-button:active{transform:scale(.95)}
    .cl-home-dashboard .home-icon-button svg{width:19px;height:19px;stroke-width:2}
    .cl-home-dashboard .home-icon-button.notify{background:linear-gradient(160deg,#fcd34d,#ea580c)}
    .cl-home-dashboard .home-icon-button.menu{background:linear-gradient(160deg,#2b2d33,#000)}
    .cl-home-dashboard .home-content{padding:18px 16px 4px;display:flex;flex-direction:column;gap:14px}
    .cl-home-dashboard .home-glass{position:relative;isolation:isolate;border:1px solid rgba(255,255,255,.96);border-radius:28px;background:linear-gradient(155deg,rgba(255,255,255,.88),rgba(240,248,252,.63));backdrop-filter:blur(24px) saturate(175%);-webkit-backdrop-filter:blur(24px) saturate(175%);box-shadow:0 0 0 1px rgba(15,40,60,.055),0 16px 32px -23px rgba(15,50,80,.30),0 6px 14px -10px rgba(15,50,80,.15),inset 0 1.5px 1px #fff,inset 0 -2px 6px rgba(14,116,144,.07)}
    .cl-home-dashboard .home-glass:before{content:"";position:absolute;inset:0;z-index:-1;border-radius:inherit;pointer-events:none;background:linear-gradient(115deg,rgba(255,255,255,.65),transparent 35%,rgba(34,211,238,.06) 72%,rgba(255,255,255,.45))}
    .cl-home-dashboard .home-card{padding:18px}
    .cl-home-dashboard .home-card-heading{font-size:19px;font-weight:850;letter-spacing:-.35px}
    .cl-home-dashboard .home-copy{font-size:13.5px;line-height:1.48;color:var(--home-muted)}
    .cl-home-dashboard .home-icon-tile{width:54px;height:54px;flex-shrink:0;display:grid;place-items:center;border-radius:17px;color:#fff;box-shadow:inset 0 1.5px 1px rgba(255,255,255,.75),inset 0 -4px 6px rgba(0,0,0,.15),0 8px 15px -8px rgba(15,50,80,.25)}
    .cl-home-dashboard .home-icon-tile svg{width:25px;height:25px;stroke-width:1.8}
    .cl-home-dashboard .home-icon-tile.grey{background:linear-gradient(160deg,#cbd5e1,#475569)}
    .cl-home-dashboard .home-icon-tile.green{background:linear-gradient(160deg,#6ee7b7,#059669)}
    .cl-home-dashboard .home-icon-tile.cyan{background:linear-gradient(160deg,#67e8f9,#0e7490)}
    .cl-home-dashboard .home-icon-tile.orange{background:linear-gradient(160deg,#fcd34d,#ea580c)}
    .cl-home-dashboard .home-icon-tile.purple{background:linear-gradient(160deg,#c4b5fd,#7c3aed)}
    .cl-home-dashboard .home-icon-tile.blue{background:linear-gradient(160deg,#7dd3fc,#1d4ed8)}
    .cl-home-dashboard .home-icon-tile.red{background:linear-gradient(160deg,#fda4af,#e11d48)}
    .cl-home-dashboard .home-status-row{display:flex;align-items:flex-start;gap:13px}
    .cl-home-dashboard .home-progress-track{height:12px;border-radius:7px;background:linear-gradient(180deg,rgba(215,230,239,.8),rgba(255,255,255,.9));box-shadow:0 0 0 1px rgba(15,40,60,.08),inset 0 2px 3px rgba(15,50,80,.12);overflow:hidden}
    .cl-home-dashboard .home-progress-fill{height:100%;border-radius:7px;background:linear-gradient(180deg,#a5f3fc,#22d3ee 50%,#0891b2);box-shadow:inset 0 1.5px 1px rgba(255,255,255,.8),0 4px 10px -2px rgba(34,211,238,.5);transition:width .7s cubic-bezier(.2,.9,.3,1)}
    .cl-home-dashboard .home-small-muted{font-size:12.5px;color:var(--home-muted)}
    .cl-home-dashboard .home-section-head{display:flex;justify-content:space-between;align-items:baseline;gap:10px;margin-bottom:8px}
    .cl-home-dashboard .home-count{font-size:13px;font-weight:750;color:var(--home-muted);white-space:nowrap}
    .cl-home-dashboard .home-check-row{width:100%;min-height:47px;display:flex;align-items:center;gap:11px;padding:8px 0;border:0;border-top:1px solid rgba(15,40,60,.08);background:transparent;text-align:left;font:inherit;cursor:pointer;color:var(--home-ink)}
    .cl-home-dashboard .home-check-row:first-of-type{border-top:0}
    .cl-home-dashboard .home-check-row .home-check-icon{width:27px;height:27px;border-radius:9px;display:grid;place-items:center;flex-shrink:0;color:white;background:linear-gradient(160deg,#fbbf24,#d97706);box-shadow:inset 0 1px 1px rgba(255,255,255,.7),inset 0 -2px 3px rgba(0,0,0,.12)}
    .cl-home-dashboard .home-check-row.done .home-check-icon{background:linear-gradient(160deg,#6ee7b7,#059669)}
    .cl-home-dashboard .home-check-icon svg{width:15px;height:15px;stroke-width:2.3}
    .cl-home-dashboard .home-check-label{flex:1;min-width:0;font-size:14px;font-weight:650}
    .cl-home-dashboard .home-check-row.done .home-check-label{font-weight:500;color:#667380}
    .cl-home-dashboard .home-chevron{width:17px;height:17px;stroke:#8793a0;flex-shrink:0}
    .cl-home-dashboard .home-badge{max-width:48%;font-size:9.5px;letter-spacing:.08em;font-weight:850;padding:8px 9px;border-radius:11px;border:1px solid rgba(15,40,60,.08);background:rgba(240,248,252,.8);color:var(--home-muted);text-align:center}
    .cl-home-dashboard .home-button{width:100%;min-height:49px;display:flex;align-items:center;justify-content:center;gap:9px;padding:12px 16px;border-radius:25px;border:1px solid #000;color:#fff;background:linear-gradient(180deg,#3a3d44 0,#16181c 46%,#000 100%);font:800 14px inherit;cursor:pointer;box-shadow:0 0 0 1px rgba(255,255,255,.55),0 0 0 2px rgba(0,0,0,.8),0 12px 20px -10px rgba(0,0,0,.42),inset 0 1.5px 0 rgba(255,255,255,.35);transition:transform .22s ease}
    .cl-home-dashboard .home-button:active{transform:scale(.985)}
    .cl-home-dashboard .home-button svg{width:19px;height:19px;flex-shrink:0}
    .cl-home-dashboard .home-stat-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:11px}
    .cl-home-dashboard .home-stat{min-width:0;display:flex;align-items:center;gap:11px;padding:13px;border-radius:23px}
    .cl-home-dashboard .home-stat .home-icon-tile{width:42px;height:42px;border-radius:14px}
    .cl-home-dashboard .home-stat .home-icon-tile svg{width:20px;height:20px}
    .cl-home-dashboard .home-stat-value{font-size:22px;font-weight:850;line-height:1;letter-spacing:-.5px}
    .cl-home-dashboard .home-stat-label{font-size:12px;line-height:1.25;color:var(--home-muted);margin-top:4px}
    .cl-home-dashboard .home-ai-row{display:flex;align-items:center;gap:13px}
    .cl-home-dashboard .home-ai-orb{width:65px;height:65px;display:grid;place-items:center;flex-shrink:0;border-radius:22px;background:linear-gradient(145deg,#dbeafe,#f0f9ff);box-shadow:inset 0 1px 0 #fff,0 8px 18px rgba(37,99,235,.12)}
    .cl-home-dashboard .home-ai-core{width:48px;height:48px;display:grid;place-items:center;border-radius:17px;color:#fff;background:linear-gradient(145deg,#38bdf8,#1d4ed8);box-shadow:inset 0 2px 2px rgba(255,255,255,.45),0 8px 16px rgba(29,78,216,.24);animation:homeBob 4s ease-in-out infinite}
    .cl-home-dashboard .home-ai-core svg{width:24px;height:24px}
    .cl-home-dashboard .home-ai-eyebrow{font-size:9.5px;font-weight:850;letter-spacing:1.4px;color:var(--home-muted)}
    .cl-home-dashboard .home-link-button{border:0;padding:4px 0;background:none;color:#0e7490;font-size:12px;font-weight:800;cursor:pointer}
    .cl-home-dashboard .home-menu{position:absolute;top:46px;right:0;z-index:120;width:218px;padding:7px;border:1px solid rgba(255,255,255,.9);border-radius:19px;background:rgba(255,255,255,.94);box-shadow:0 18px 44px rgba(15,23,42,.2);backdrop-filter:blur(20px)}
    .cl-home-dashboard .home-menu-item{width:100%;display:flex;align-items:center;gap:10px;padding:12px 10px;border:0;border-radius:12px;background:transparent;color:#0b1217;text-align:left;font:500 13px inherit;cursor:pointer}
    .cl-home-dashboard .home-menu-item:hover{background:rgba(34,211,238,.12)}
    .cl-home-dashboard .home-menu-item svg{width:17px;height:17px;color:#0e7490}
    .cl-home-dashboard .home-review-stars{display:flex;align-items:center;gap:4px;margin-bottom:8px}
    .cl-home-dashboard .home-review-stars svg{width:15px;height:15px}
    .cl-home-dashboard .home-fade{animation:homeRise .65s cubic-bezier(.2,.9,.3,1) both}
    .cl-home-dashboard .home-fade:nth-child(2){animation-delay:.06s}.cl-home-dashboard .home-fade:nth-child(3){animation-delay:.12s}.cl-home-dashboard .home-fade:nth-child(4){animation-delay:.18s}
    .cl-home-dashboard .home-notification-dot{position:absolute;right:-2px;top:-2px;width:9px;height:9px;border-radius:50%;background:#ef4444;border:2px solid #fff}
    .cl-home-dashboard .home-action-overlay{position:fixed;inset:0;z-index:110;background:transparent;border:0;padding:0}
    .cl-creator-shell:has(.cl-home-dashboard) .cl-bottomnav{border:1px solid rgba(255,255,255,.88)!important;border-radius:28px!important;background:linear-gradient(155deg,rgba(255,255,255,.9),rgba(240,248,252,.72))!important;backdrop-filter:blur(24px) saturate(180%)!important;-webkit-backdrop-filter:blur(24px) saturate(180%)!important;box-shadow:0 0 0 1px rgba(15,40,60,.08),0 16px 30px -20px rgba(15,50,80,.36),inset 0 1px 1px #fff!important;padding:5px!important}
    .cl-creator-shell:has(.cl-home-dashboard) .cl-bottomnav button{border-radius:19px!important;gap:4px!important}
    .cl-creator-shell:has(.cl-home-dashboard) .cl-bottomnav button.on{background:linear-gradient(180deg,rgba(255,255,255,.96),rgba(225,240,247,.8))!important;box-shadow:0 0 0 1px rgba(15,40,60,.08),inset 0 1px 1px #fff,0 5px 10px -7px rgba(8,145,178,.45)!important;color:#0b1217!important}
    .cl-creator-shell:has(.cl-home-dashboard) .cl-bottomnav button svg{filter:drop-shadow(0 2px 3px rgba(15,50,80,.08))}
    @keyframes homeRise{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
    @keyframes homeBob{50%{transform:translateY(-4px)}}
    @media(max-width:420px){.cl-home-dashboard .home-head{padding:19px 16px 0}.cl-home-dashboard .home-greeting{font-size:22px}.cl-home-dashboard .home-content{padding:15px 12px 4px;gap:12px}.cl-home-dashboard .home-card{padding:15px;border-radius:24px}.cl-home-dashboard .home-stat{padding:11px;gap:9px}.cl-home-dashboard .home-stat .home-icon-tile{width:38px;height:38px;border-radius:12px}.cl-home-dashboard .home-stat-value{font-size:21px}.cl-home-dashboard .home-stat-label{font-size:11.5px}.cl-home-dashboard .home-badge{font-size:8px;letter-spacing:.04em;padding:7px 6px}.cl-home-dashboard .home-ai-orb{width:56px;height:56px;border-radius:19px}.cl-home-dashboard .home-ai-core{width:42px;height:42px;border-radius:15px}}
    @media(prefers-reduced-motion:reduce){.cl-home-dashboard .home-fade,.cl-home-dashboard .home-ai-core{animation:none!important;transition:none!important}}
    [data-theme=dark] .cl-home-dashboard,[data-theme=gold] .cl-home-dashboard{--home-ink:#f4f7fb;--home-muted:#a9b5c4;--home-line:rgba(255,255,255,.1)}
    [data-theme=dark] .cl-home-dashboard .home-glass,[data-theme=gold] .cl-home-dashboard .home-glass{background:linear-gradient(155deg,rgba(30,41,59,.92),rgba(15,23,42,.78));border-color:rgba(255,255,255,.14);box-shadow:0 0 0 1px rgba(255,255,255,.05),0 16px 32px -23px rgba(0,0,0,.5),inset 0 1px 1px rgba(255,255,255,.1)}
    [data-theme=dark] .cl-home-dashboard .home-glass:before,[data-theme=gold] .cl-home-dashboard .home-glass:before{background:linear-gradient(115deg,rgba(255,255,255,.08),transparent 35%,rgba(34,211,238,.05) 72%,rgba(255,255,255,.03))}
    [data-theme=dark] .cl-home-dashboard .home-check-row,[data-theme=gold] .cl-home-dashboard .home-check-row{border-top-color:rgba(255,255,255,.08)}
    [data-theme=dark] .cl-home-dashboard .home-badge,[data-theme=gold] .cl-home-dashboard .home-badge{background:rgba(30,41,59,.9);border-color:rgba(255,255,255,.12)}
    [data-theme=dark] .cl-home-dashboard .home-menu,[data-theme=gold] .cl-home-dashboard .home-menu{background:rgba(15,23,42,.96);border-color:rgba(255,255,255,.12)}
    [data-theme=dark] .cl-home-dashboard .home-menu-item,[data-theme=gold] .cl-home-dashboard .home-menu-item{color:#f4f7fb}
    [data-theme=dark] .cl-creator-shell:has(.cl-home-dashboard) .cl-bottomnav,[data-theme=gold] .cl-creator-shell:has(.cl-home-dashboard) .cl-bottomnav{background:linear-gradient(155deg,rgba(30,41,59,.95),rgba(15,23,42,.88))!important;border-color:rgba(255,255,255,.12)!important;box-shadow:0 12px 28px rgba(0,0,0,.28),inset 0 1px 1px rgba(255,255,255,.1)!important}
  `}</style>
);

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
    return reviews.reduce((sum, review) => sum + Number(review.stars || 0), 0) / reviews.length;
  }, [reviews, creator]);
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = () => setMenuOpen(false);
  const missingCount = items.filter((item) => !item.done).length;

  return (
    <Page pageKey="creator-dashboard" className="cl-home-dashboard">
      <HomeStyles />
      <header className="home-head home-fade">
        <div style={{ minWidth: 0 }}>
          <div className="home-greeting">Hi, {creator?.name?.trim()?.split(/\s+/)[0] || 'Creator'} <span aria-hidden="true" style={{ fontWeight: 400 }}>👋</span></div>
          <div className="home-subtitle">{live ? 'You are live on Collancer' : 'Finish setup to go live'}</div>
        </div>
        <div className="home-head-actions" style={{ position: 'relative' }}>
          <button type="button" className="home-icon-button notify" aria-label="Notifications" onClick={() => onNav('notifications')}>
            <Bell />
            {unread > 0 && <span className="home-notification-dot" />}
          </button>
          <button type="button" className="home-icon-button menu" aria-label={menuOpen ? 'Close menu' : 'Open menu'} aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}>
            {menuOpen ? <X /> : <Menu />}
          </button>
          {menuOpen && <>
            <button className="home-action-overlay" type="button" aria-label="Close menu" onClick={closeMenu} />
            <div className="home-menu" role="menu" aria-label="Creator menu">
              {[
                { key: 'support', label: 'Support', icon: MessageCircle },
                { key: 'privacy', label: 'Privacy Policy', icon: ShieldCheck },
                { key: 'terms', label: 'Terms of Service', icon: FileText },
              ].map((item) => <button key={item.key} type="button" role="menuitem" className="home-menu-item" onClick={() => { closeMenu(); onNav(item.key); }}><item.icon />{item.label}</button>)}
            </div>
          </>}
        </div>
      </header>

      <div className="home-content">
        <section className="home-glass home-card home-fade">
          <div className="home-status-row">
            <div className={`home-icon-tile ${live ? 'green' : 'grey'}`}>{live ? <Rocket /> : <AlertCircle />}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="home-card-heading">{live ? 'Profile is live' : 'Not live yet'}</div>
              <div className="home-copy" style={{ marginTop: 4 }}>
                {live ? 'Brands can discover and book you right now.' : igConnected ? 'Your profile is ready for admin review. Instagram is optional during onboarding.' : 'Complete your profile and submit verification. Admin approval is required before you go live.'}
              </div>
            </div>
            {live && <div className="home-badge" style={{ color: '#047857', borderColor: 'rgba(16,185,129,.28)' }}>LIVE</div>}
          </div>
          {!live && <>
            <div className="home-progress-track" style={{ marginTop: 16 }}><div className="home-progress-fill" style={{ width: `${pct}%` }} /></div>
            <div className="home-small-muted" style={{ marginTop: 8 }}>{pct}% profile complete</div>
          </>}
        </section>

        {!live && missingCount > 0 && <section className="home-glass home-card home-fade" style={{ paddingBottom: 8 }}>
          <div className="home-section-head">
            <div className="home-card-heading">Setup checklist</div>
            <div className="home-count">{items.length - missingCount}/{items.length}</div>
          </div>
          {items.map((item) => <button key={item.key} type="button" className={`home-check-row ${item.done ? 'done' : ''}`} onClick={() => onNav('profile')} aria-label={`${item.label}: ${item.done ? 'complete' : 'go to profile'}`}>
            <span className="home-check-icon">{item.done ? <CheckCircle2 /> : <Clock3 />}</span>
            <span className="home-check-label">{item.label}</span>
            {!item.done && <ChevronRight className="home-chevron" />}
          </button>)}
        </section>}

        <section className="home-glass home-card home-fade">
          <div className="home-status-row" style={{ alignItems: 'center' }}>
            <div className="home-icon-tile green"><ShieldCheck /></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="home-card-heading">Verification</div>
              <div className="home-copy" style={{ marginTop: 3 }}>
                {verification?.status === 'verified' ? 'Identity and socials confirmed.' : verification?.status === 'rejected' ? 'Needs attention — see reason and resubmit.' : verification ? 'Submitted — our team is reviewing it.' : 'Required to go live on Collancer.'}
              </div>
            </div>
            <div className="home-badge">{vt.label.toUpperCase()}</div>
          </div>
          {verification?.status !== 'verified' && <button type="button" className="home-button" style={{ marginTop: 16 }} onClick={() => onOverlay('verification')}>
            <ShieldCheck />{verification ? (verification.status === 'rejected' ? 'Fix & resubmit verification' : 'View verification status') : 'Submit verification'}
          </button>}
        </section>

        <div className="home-stat-grid home-fade">
          <div className="home-glass home-stat"><div className="home-icon-tile cyan"><CalendarCheck /></div><div style={{ minWidth: 0 }}><div className="home-stat-value">{activeBookings.length}</div><div className="home-stat-label">Active bookings</div></div></div>
          <div className="home-glass home-stat"><div className="home-icon-tile orange"><Clock3 /></div><div style={{ minWidth: 0 }}><div className="home-stat-value">{pendingCount}</div><div className="home-stat-label">Pending requests</div></div></div>
          <div className="home-glass home-stat"><div className="home-icon-tile orange"><Star /></div><div style={{ minWidth: 0 }}><div className="home-stat-value">{avgRating ? avgRating.toFixed(1) : '—'}</div><div className="home-stat-label">Avg rating</div></div></div>
          <div className="home-glass home-stat"><div className="home-icon-tile purple"><MessageCircle /></div><div style={{ minWidth: 0 }}><div className="home-stat-value">{reviews?.length || 0}</div><div className="home-stat-label">Reviews</div></div></div>
        </div>

        <section className="home-glass home-card home-fade">
          <div className="home-ai-row">
            <div className="home-ai-orb" aria-hidden="true"><div className="home-ai-core"><Sparkles /></div></div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="home-ai-eyebrow">YOUR CREATOR ASSISTANT</div>
              <div className="home-card-heading" style={{ marginTop: 2 }}>Collancer AI</div>
              <div className="home-copy" style={{ marginTop: 4 }}>Smart help with collaborations, bookings, earnings and growing your profile.</div>
            </div>
          </div>
          <button type="button" className="home-button" style={{ marginTop: 16 }} onClick={() => onNav('collancer-ai')}><Sparkles />Open Collancer AI</button>
        </section>

        {activeBookings.length > 0 && <section className="home-fade">
          <div className="home-section-head" style={{ padding: '0 3px' }}>
            <div className="home-card-heading">Needs your action</div>
            <button type="button" className="home-link-button" onClick={() => onNav('bookings')}>View all</button>
          </div>
          <div style={{ display: 'grid', gap: 10 }}>
            {activeBookings.slice(0, 3).map((booking) => <button key={booking.id} type="button" className="home-glass home-card" style={{ width: '100%', padding: 14, textAlign: 'left', color: 'inherit', cursor: 'pointer' }} onClick={() => onOpenBooking(booking.id)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 800, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{booking.campaignName || booking.productName || 'Collaboration'}</div>
                  <div className="home-small-muted" style={{ marginTop: 4 }}>{booking.bizName || 'Brand'} · {booking.status === 'PendingCompletion' ? 'Under admin review' : 'In progress'}</div>
                </div>
                <div className="home-badge">{booking.status === 'PendingCompletion' ? 'IN REVIEW' : 'ACTIVE'}</div>
              </div>
            </button>)}
          </div>
        </section>}

        {pendingCount > 0 && activeBookings.length === 0 && <button type="button" className="home-glass home-card home-fade" style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 12, textAlign: 'left', color: 'inherit', cursor: 'pointer' }} onClick={() => onNav('bookings')}>
          <div className="home-icon-tile cyan"><CalendarCheck /></div>
          <div style={{ minWidth: 0, flex: 1 }}><div style={{ fontWeight: 800 }}>{pendingCount} new booking request{pendingCount > 1 ? 's' : ''}</div><div className="home-copy">Review and accept or reject them.</div></div>
          <ChevronRight className="home-chevron" />
        </button>}

        {reviews && reviews.length > 0 && <section className="home-fade">
          <div className="home-section-head" style={{ padding: '0 3px' }}><div className="home-card-heading">Latest review</div></div>
          <div className="home-glass home-card">
            <div className="home-review-stars">
              {Array.from({ length: 5 }).map((_, index) => <Star key={index} style={{ color: index < Math.round(Number(reviews[0].stars || 0)) ? '#f59e0b' : '#cbd5e1', fill: index < Math.round(Number(reviews[0].stars || 0)) ? '#f59e0b' : 'none' }} />)}
              <span className="home-small-muted" style={{ marginLeft: 5 }}>{reviews[0].bizName || 'Brand'}</span>
            </div>
            <p className="home-copy" style={{ margin: 0 }}>{reviews[0].text || reviews[0].review || 'Great collaboration.'}</p>
            <div className="home-small-muted" style={{ marginTop: 9 }}>{timeAgo(reviews[0].createdAt)}</div>
          </div>
        </section>}
      </div>
    </Page>
  );
}
