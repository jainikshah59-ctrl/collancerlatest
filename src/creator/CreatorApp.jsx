/* CreatorApp — creator role shell (audit §7 / §22).
   Owns creator auth internally; state-based page nav (no router).
   Real-time listeners per audit §17: creators/{uid}, bookings, reviews,
   creatorNotifs, payoutRequests, requirements,
   requirementOffers. Maintains hasActiveBooking writeback + Pro expiry. */
import React, { useEffect, useMemo, useState } from 'react';
import {
  LayoutDashboard, Store, CalendarCheck, IndianRupee, User, Wrench,
  Loader2, LogOut,
} from 'lucide-react';
import {
  ensureFirebase, db, logout, watchAuth, doc, collection,
  query, where, orderBy, limit, onSnapshot, updateDoc, serverTimestamp,
} from '../lib/firebase.js';
import {
  BottomNav, Page, useToast, ConfirmDialog, Button, EmptyState, useEffectiveTheme,
} from '../components/ui.jsx';
import CreatorAuthScreen from './auth.jsx';
import ToolsPage from './ToolsPage.jsx';
import { needsInstagramSync, refreshInstagram } from '../lib/instagram.js';
import DashboardPage from './DashboardPage.jsx';
import VerificationPage from './VerificationPage.jsx';
import BookingsPage from './BookingsPage.jsx';
import BookingDetailModal from './BookingDetailModal.jsx';
import ChatToastHost from '../components/ChatToastHost.jsx';
import EarningsPage from './EarningsPage.jsx';
import PromoDemoSection from './PromoDemoSection.jsx';
import ProfilePageH from './ProfilePageH.jsx';
import MarketplacePage from './MarketplacePage.jsx';
import CreatorProPage from './CreatorProPage.jsx';
import CreatorAIPage from './CreatorAIPage.jsx';
import NotificationsPage from './NotificationsPage.jsx';
import { HomeSupportPage, PrivacyPage, TermsPage } from './SupportPages.jsx';

/* ---------- live data hooks ---------- */
function useLiveDoc(getRef, key) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let unsub = () => {};
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        await ensureFirebase();
        if (cancelled) return;
        const ref = getRef();
        if (!ref) { setData(null); setLoading(false); return; }
        unsub = onSnapshot(ref,
          (snap) => {
            if (!cancelled) {
              setData(snap.exists() ? { id: snap.id, ...snap.data() } : null);
              setLoading(false);
            }
          },
          () => { if (!cancelled) setLoading(false); });
      } catch (e) { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; unsub(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return [data, loading];
}

function useLiveList(getQuery, key, sortFn) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let unsub = () => {};
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        await ensureFirebase();
        if (cancelled) return;
        const q = getQuery();
        if (!q) { setData([]); setLoading(false); return; }
        unsub = onSnapshot(q,
          (snap) => {
            if (!cancelled) {
              const arr = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
              if (sortFn) arr.sort(sortFn);
              setData(arr);
              setLoading(false);
            }
          },
          () => { if (!cancelled) setLoading(false); });
      } catch (e) { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; unsub(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return [data, loading];
}

const byCreatedDesc = (a, b) => {
  const x = a.createdAt?.seconds || 0, y = b.createdAt?.seconds || 0;
  return y - x;
};

const NAV_ITEMS = [
  { key: 'dashboard', label: 'Home', icon: LayoutDashboard },
  { key: 'marketplace', label: 'Market', icon: Store },
  { key: 'bookings', label: 'Bookings', icon: CalendarCheck },
  { key: 'earnings', label: 'Earnings', icon: IndianRupee },
  { key: 'profile', label: 'Profile', icon: User },
  { key: 'tools', label: 'Tools', icon: Wrench },
];
const MAIN_PAGES = new Set(NAV_ITEMS.map((i) => i.key));

function Curtain({ label }) {
  return (
    <div style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', background: 'var(--bg)' }}>
      <div className="cl-fade" style={{ textAlign: 'center' }}>
        <Loader2 style={{ width: 30, height: 30, color: 'var(--cyan-deep)', animation: 'spin 1s linear infinite' }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        <p className="cl-small cl-muted" style={{ marginTop: 12 }}>{label || 'Loading…'}</p>
      </div>
    </div>
  );
}

export default function CreatorApp({ onSwitchRole }) {
  const toast = useToast();
  const [authUser, setAuthUser] = useState(undefined); // undefined = resolving
  const [page, setPage] = useState('dashboard');
  const [profileTab, setProfileTab] = useState('profile');
  const [overlay, setOverlay] = useState(null); // 'verification' | 'demos' | 'logout' | {type:'booking', id}
  const [fbReady, setFbReady] = useState(false);
  const [instagramSuccessOpen, setInstagramSuccessOpen] = useState(false);

  /* ---- auth ---- */
  useEffect(() => {
    let cancelled = false;
    ensureFirebase().then(() => {
      if (cancelled) return;
      setFbReady(true);
      watchAuth((u) => { if (!cancelled) setAuthUser(u || null); });
    });
    return () => { cancelled = true; };
  }, []);

  const uid = authUser?.uid || null;

  /* ---- real-time listeners (audit §17) ---- */
  const [creator, creatorLoading] = useLiveDoc(
    () => (uid ? doc(db(), 'creators', uid) : null), uid || 'none');
  /* Pro subscribers automatically get the premium gold theme. */
  useEffectiveTheme(!!creator?.creatorIsPro);
  const [verification, verificationLoading] = useLiveDoc(
    () => (uid ? doc(db(), 'verificationRequests', uid) : null), uid ? `v-${uid}` : 'none');
  const [bookings, bookingsLoading] = useLiveList(
    () => (uid ? query(collection(db(), 'bookings'), where('creatorId', '==', uid)) : null),
    uid || 'none', byCreatedDesc);
  const [reviews, reviewsLoading] = useLiveList(
    () => (uid ? query(collection(db(), 'reviews'), where('creatorId', '==', uid)) : null),
    uid ? `r-${uid}` : 'none', byCreatedDesc);
  const [notifs, notifsLoading] = useLiveList(
    () => (uid ? query(collection(db(), 'creatorNotifs'), where('creatorId', '==', uid)) : null),
    uid ? `n-${uid}` : 'none', byCreatedDesc);
  const [payouts, payoutsLoading] = useLiveList(
    () => (uid ? query(collection(db(), 'payoutRequests'), where('creatorId', '==', uid)) : null),
    uid ? `p-${uid}` : 'none', byCreatedDesc);
  const [requirements, reqsLoading] = useLiveList(
    () => query(collection(db(), 'requirements'), orderBy('createdAt', 'desc'), limit(60)),
    uid ? `req-${uid}` : 'none', null);
  const [offers, offersLoading] = useLiveList(
    () => (uid ? query(collection(db(), 'requirementOffers'), where('creatorId', '==', uid)) : null),
    uid ? `o-${uid}` : 'none', byCreatedDesc);

  /* ---- hasActiveBooking writeback (audit §7.4) ---- */
  const hasActiveNow = useMemo(
    () => bookings.some((b) => b.status === 'Active' || b.status === 'PendingCompletion'),
    [bookings],
  );
  useEffect(() => {
    if (!uid || creatorLoading || !creator) return;
    if (!!creator.hasActiveBooking === hasActiveNow) return;
    updateDoc(doc(db(), 'creators', uid), { hasActiveBooking: hasActiveNow }).catch(() => {});
  }, [uid, creatorLoading, creator?.hasActiveBooking, hasActiveNow]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---- Creator Pro expiry: on snapshot + every 60s (contract rule 13) ---- */
  useEffect(() => {
    if (!uid || !creator?.creatorIsPro) return;
    const raw = creator.creatorProExpiresAt;
    const exp = raw?.seconds ? raw.seconds * 1000 : Number(raw) || 0;
    if (!exp) return;
    let timer = null;
    const check = () => {
      if (Date.now() > exp) {
        updateDoc(doc(db(), 'creators', uid), {
          creatorIsPro: false, creatorProPlan: null, updatedAt: serverTimestamp(),
        }).catch(() => {});
      }
    };
    check();
    timer = setInterval(check, 60000);
    return () => clearInterval(timer);
  }, [uid, creator?.creatorIsPro, creator?.creatorProExpiresAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const unread = useMemo(() => notifs.filter((n) => !n.read).length, [notifs]);

  /* ---- Instagram return handling (?ig=connected / ?ig=error=...) ---- */
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const ig = params.get('ig');
      if (!ig) return;
      if (ig === 'connected') setInstagramSuccessOpen(true);
      else if (ig.startsWith('error')) {
        const reason = decodeURIComponent(ig.slice(6));
        if (reason === 'code-expired') {
          toast.err('The Instagram authorization code expired or was already used. Please restart Connect Instagram and approve once.');
        } else if (reason === 'redirect-uri-mismatch') {
          toast.err('Instagram redirect URL mismatch. The callback URL in Meta and Vercel must match exactly.');
        } else if (reason === 'app-credentials-invalid') {
          toast.err('Instagram app credentials were rejected. Check that Vercel uses the App ID and App Secret from the same Instagram Login app.');
        } else if (reason === 'long-token-failed') {
          toast.err('Instagram authorized the account, but the long-lived token could not be issued. Check the Instagram App Secret and retry.');
        } else if (reason === 'token-failed') {
          toast.err('Instagram could not exchange the authorization code. Check the App ID, App Secret and exact redirect URL, then retry.');
        } else if (reason === 'access_denied') {
          toast.info('Instagram connection was cancelled. No changes were made.');
        } else if (reason.startsWith('sync-failed')) {
          toast.err('Instagram authorization succeeded, but profile syncing failed. Check the account type and Instagram API permissions, then retry.');
        } else {
          toast.err(reason ? `Instagram connect failed: ${reason}` : 'Instagram connect failed. Please try again.');
        }
      }
      params.delete('ig');
      const clean = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ''}${window.location.hash}`;
      window.history.replaceState(null, '', clean);
    } catch { /* noop */ }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---- Instagram live sync: refresh stale data in the background ---- */
  useEffect(() => {
    if (!uid || !creator?.instagram || !needsInstagramSync(creator)) return;
    let cancelled = false;
    (async () => {
      try {
        const j = await refreshInstagram(false);
        if (!cancelled && j?.ok && !j.fresh) toast.ok('Instagram data refreshed.');
      } catch { /* silent — profile still shows cached data */ }
    })();
    return () => { cancelled = true; };
  }, [uid, creator?.instagram?.lastSyncedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---- navigation helpers ---- */
  const go = (p, sub) => {
    if (p === 'profile' && sub) setProfileTab(sub);
    setOverlay(null);
    setPage(p);
    try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (e) { /* noop */ }
  };
  const openBooking = (id) => setOverlay({ type: 'booking', id });
  const backTo = (p) => go(p || 'dashboard');

  async function doLogout() {
    setOverlay(null);
    try { await logout(); } catch (e) { /* noop */ }
    toast.info('Logged out.');
  }

  /* ---- render states ---- */
  if (!fbReady || authUser === undefined) return <Curtain label="Connecting…" />;
  if (authUser === null) return <CreatorAuthScreen />;
  if (!creatorLoading && !creator) {
    return (
      <Page pageKey="creator-no-profile">
        <div className="cl-container" style={{ maxWidth: 440, paddingTop: 80, paddingBottom: 40 }}>
          <EmptyState icon={LogOut} title="No creator profile found"
            body="This login is not linked to a creator account. Sign out and log in with your creator account."
            action={
              <div style={{ display: 'grid', gap: 10 }}>
                <Button onClick={doLogout} icon={LogOut}>Sign out</Button>
              </div>
            } />
        </div>
      </Page>
    );
  }
  if (creatorLoading || !creator) return <Curtain label="Loading your studio…" />;

  /* ---- manual onboarding: Instagram is optional during registration/review ---- */
  // Do not block the creator studio on Instagram during the review rollout.
  // Existing creators can connect Instagram later when integrations reopen.


  const overlayBooking = overlay?.type === 'booking'
    ? bookings.find((b) => b.id === overlay.id) || null
    : null;

  const showNav = MAIN_PAGES.has(page) && !overlay;

  return (
    <div className="cl-page">
      {/* ---- overlay pages ---- */}
      {overlay === 'verification' && (
        <VerificationPage creator={creator} verification={verification}
          loading={verificationLoading} onBack={() => setOverlay(null)} onSubmitted={() => setOverlay(null)} />
      )}
      {overlay === 'demos' && (
        <PromoDemoSection creator={creator} onBack={() => setOverlay(null)} />
      )}
      {overlay?.type === 'booking' && overlayBooking && (
        <BookingDetailModal booking={overlayBooking} creator={creator}
          onClose={() => setOverlay(null)} onChanged={() => {}} />
      )}

      {/* ---- main / secondary pages ---- */}
      {!overlay && page === 'dashboard' && (
        <DashboardPage creator={creator} bookings={bookings} reviews={reviews}
          verification={verification} unread={unread}
          onNav={go} onOverlay={setOverlay} onOpenBooking={openBooking} />
      )}
      {!overlay && page === 'marketplace' && (
        <MarketplacePage creator={creator} requirements={requirements} offers={offers}
          loading={reqsLoading || offersLoading} onGoPro={() => go('creatorpro')} />
      )}
      {!overlay && page === 'bookings' && (
        <BookingsPage bookings={bookings} loading={bookingsLoading} onOpen={openBooking} />
      )}
      {!overlay && page === 'creatorpro' && (
        <CreatorProPage creator={creator} onBack={() => backTo('dashboard')} />
      )}
      {!overlay && page === 'profile' && (
        <ProfilePageH key={profileTab} creator={creator} initialTab={profileTab}
          isPro={!!creator?.creatorIsPro}
          onLogout={() => setOverlay('logout')} onSwitchRole={onSwitchRole} />
      )}
      {!overlay && page === 'earnings' && (
        <EarningsPage creator={creator} bookings={bookings} payouts={payouts} loading={payoutsLoading} />
      )}
      {!overlay && page === 'tools' && (
        <ToolsPage creator={creator} approved={!!(creator?.verified && creator?.addedToCollancer && !creator?.banned)} onBack={() => backTo('dashboard')} />
      )}
      {!overlay && page === 'collancer-ai' && (
        <CreatorAIPage creator={creator} bookings={bookings} payouts={payouts}
          verification={verification} onBack={() => backTo('dashboard')} />
      )}
      {!overlay && page === 'notifications' && (
        <NotificationsPage notifs={notifs} loading={notifsLoading}
          onBack={() => backTo('dashboard')} onOpenBooking={openBooking} />
      )}
      {!overlay && page === 'support' && (
        <HomeSupportPage onBack={() => backTo('dashboard')} onNav={go} />
      )}
      {!overlay && page === 'privacy' && (
        <PrivacyPage onBack={() => backTo('support')} />
      )}
      {!overlay && page === 'terms' && (
        <TermsPage onBack={() => backTo('support')} />
      )}

      {showNav && <BottomNav items={NAV_ITEMS} value={page} onChange={(k) => go(k)} />}

      <ConfirmDialog
        open={overlay === 'logout'}
        onClose={() => setOverlay(null)}
        title="Log out?"
        body="You will be signed out of your creator account on this device."
        confirmLabel="Log out"
        danger
        onConfirm={doLogout}
      />
      {instagramSuccessOpen && <div className="cl-ig-success-backdrop" role="presentation" onClick={() => setInstagramSuccessOpen(false)}>
        <section className="cl-ig-success-modal" role="dialog" aria-modal="true" aria-labelledby="cl-ig-success-title" onClick={e => e.stopPropagation()}>
          <button className="cl-ig-success-close" type="button" onClick={() => setInstagramSuccessOpen(false)} aria-label="Close success message">×</button>
          <div className="cl-ig-success-orbit"><div className="cl-ig-success-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4.3 4.3L19 6.8" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/></svg></div></div>
          <div className="cl-ig-success-eyebrow">CONNECTION COMPLETE</div>
          <h2 id="cl-ig-success-title">Instagram connected!</h2>
          <p>Your creator profile is now linked. Your Instagram details can sync into Collancer so brands can discover your work.</p>
          <div className="cl-ig-success-detail"><span className="cl-ig-success-dot"/>Account connection confirmed</div>
          <button className="cl-ig-success-cta" type="button" onClick={() => setInstagramSuccessOpen(false)}>Continue to dashboard <span>→</span></button>
        </section>
        <style>{`.cl-ig-success-backdrop{position:fixed;inset:0;z-index:10000;display:grid;place-items:center;padding:18px;background:rgba(3,8,18,.62);backdrop-filter:blur(12px);animation:cl-ig-fade .25s ease both}.cl-ig-success-modal{position:relative;width:min(100%,420px);padding:34px 26px 26px;text-align:center;overflow:hidden;border:1px solid rgba(255,255,255,.36);border-radius:26px;color:var(--ink);background:linear-gradient(145deg,rgba(255,255,255,.88),rgba(240,250,255,.68));box-shadow:0 32px 90px rgba(0,0,0,.3),inset 0 1px 0 #fff;backdrop-filter:blur(28px);animation:cl-ig-pop .55s cubic-bezier(.2,1.4,.4,1) both}.cl-ig-success-modal:before{content:'';position:absolute;z-index:-1;width:220px;height:220px;top:-130px;left:calc(50% - 110px);border-radius:50%;background:rgba(34,211,238,.25);filter:blur(18px)}[data-theme=dark] .cl-ig-success-modal,[data-theme=gold] .cl-ig-success-modal{color:#f4f7fb;background:linear-gradient(145deg,rgba(31,39,52,.92),rgba(18,25,38,.82));border-color:rgba(255,255,255,.16)}.cl-ig-success-close{position:absolute;right:13px;top:10px;width:32px;height:32px;border:0;border-radius:50%;background:rgba(128,128,128,.12);color:inherit;font-size:24px;cursor:pointer}.cl-ig-success-orbit{width:92px;height:92px;margin:0 auto 22px;border-radius:30px;display:grid;place-items:center;background:linear-gradient(135deg,#ddfaff,#fff);box-shadow:0 14px 30px rgba(6,182,212,.2),inset 0 1px 0 #fff;animation:cl-ig-float 3s ease-in-out infinite alternate}.cl-ig-success-icon{width:62px;height:62px;border-radius:22px;display:grid;place-items:center;color:white;background:linear-gradient(145deg,#06b6d4,#0e7490);box-shadow:inset 0 2px 2px rgba(255,255,255,.45),0 8px 16px rgba(6,182,212,.25);transform:rotate(-5deg)}.cl-ig-success-icon svg{width:32px;height:32px}.cl-ig-success-eyebrow{font-size:10px;letter-spacing:.17em;font-weight:850;color:var(--cyan-deep)}.cl-ig-success-modal h2{font-size:clamp(24px,6vw,30px);letter-spacing:-.04em;margin:9px 0}.cl-ig-success-modal p{font-size:14px;line-height:1.7;color:var(--muted);margin:0 auto;max-width:320px}.cl-ig-success-detail{display:flex;justify-content:center;align-items:center;gap:8px;margin:20px auto;padding:11px 12px;border:1px solid var(--glass-border);border-radius:12px;background:var(--glass-lo);font-size:12px;font-weight:700}.cl-ig-success-dot{width:8px;height:8px;border-radius:50%;background:#22c55e;box-shadow:0 0 0 4px rgba(34,197,94,.12)}.cl-ig-success-cta{display:flex;align-items:center;justify-content:center;gap:12px;width:100%;min-height:48px;border:0;border-radius:13px;background:linear-gradient(135deg,#06b6d4,#0e7490);color:white;font-weight:800;cursor:pointer;box-shadow:0 9px 22px rgba(6,182,212,.22)}.cl-ig-success-cta span{font-size:19px}.cl-ig-success-cta:active{transform:scale(.985)}@keyframes cl-ig-fade{from{opacity:0}to{opacity:1}}@keyframes cl-ig-pop{from{opacity:0;transform:translateY(18px) scale(.92)}to{opacity:1;transform:translateY(0) scale(1)}}@keyframes cl-ig-float{to{transform:translateY(-5px) rotate(2deg)}}@media(prefers-reduced-motion:reduce){.cl-ig-success-backdrop,.cl-ig-success-modal,.cl-ig-success-orbit{animation:none!important}}`}</style>
      </div>}
      <ChatToastHost notifs={notifs} myType="creator" />
    </div>
  );
}
