/* CreatorApp — creator role shell (audit §7 / §22).
   Owns creator auth internally; state-based page nav (no router).
   Real-time listeners per audit §17: creators/{uid}, bookings, reviews,
   creatorNotifs, payoutRequests, adCampaigns (creatorId==uid), requirements,
   requirementOffers. Maintains hasActiveBooking writeback + Pro expiry. */
import React, { useEffect, useMemo, useState } from 'react';
import {
  LayoutDashboard, Store, CalendarCheck, IndianRupee, User,
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
import { InstagramConnectScreen } from './InstagramConnect.jsx';
import { needsInstagramSync, refreshInstagram } from '../lib/instagram.js';
import DashboardPage from './DashboardPage.jsx';
import VerificationPage from './VerificationPage.jsx';
import BookingsPage from './BookingsPage.jsx';
import BookingDetailModal from './BookingDetailModal.jsx';
import EarningsPage from './EarningsPage.jsx';
import AdCampaignPage from './AdCampaignPage.jsx';
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
  const [overlay, setOverlay] = useState(null); // 'verification' | 'beontop' | 'demos' | 'logout' | {type:'booking', id}
  const [fbReady, setFbReady] = useState(false);

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
  const [ads, adsLoading] = useLiveList(
    () => (uid ? query(collection(db(), 'adCampaigns'), where('creatorId', '==', uid)) : null),
    uid ? `a-${uid}` : 'none', byCreatedDesc);
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
      if (ig === 'connected') toast.ok('Instagram connected — your profile is live.');
      else if (ig.startsWith('error')) {
        const reason = decodeURIComponent(ig.slice(6));
        toast.err(reason && reason !== 'access_denied'
          ? `Instagram connect failed: ${reason}`
          : 'Instagram connect was cancelled.');
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

  /* ---- post-signup step: connect Instagram before entering the studio ---- */
  if (creator.onboardingStep === 'connect-instagram' && !creator.instagram) {
    return (
      <InstagramConnectScreen
        creatorName={creator.name}
        onSkip={() => {
          updateDoc(doc(db(), 'creators', uid), { onboardingStep: 'done', updatedAt: serverTimestamp() })
            .catch(() => {});
        }}
      />
    );
  }

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
      {overlay === 'beontop' && (
        <AdCampaignPage creator={creator} adCampaigns={ads} loading={adsLoading}
          onBack={() => setOverlay(null)} onDone={() => setOverlay(null)} />
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
          verification={verification} adCampaigns={ads} unread={unread}
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
    </div>
  );
}
