/* BusinessApp — business role shell.
   Owns business auth internally (BusinessAuthScreen when signed out).
   State-based pages: discover, dashboard, ai, wallet, marketplace, referral,
   pro, support, privacy, terms. Creator profile = subpage w/ back; booking = modal.
   Real-time listeners: businesses/{uid}, bizNotifs, bizCampaigns, creators,
   reviews, adCampaigns, bookings (bizId == uid). Pro expiry checked on snapshot
   + every 60s. Toasts for key business notifications. */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Compass, LayoutDashboard, Sparkles, Wallet as WalletIcon, Store, Bell,
  Menu, ChevronLeft, Crown, Gift, LifeBuoy, FileText, ShieldCheck,
  RefreshCw, CheckCheck, Loader2, LogOut,
} from 'lucide-react';
import { dedupeCreators } from '../ai/engine.js';
import {
  ensureFirebase, watchAuth, logout, doc, onSnapshot, collection,
  query, where, updateDoc,
} from '../lib/firebase.js';
import { BizProvider, tsMs, isBizPro } from './ctx.jsx';
import BusinessAuthScreen from './auth.jsx';
import DiscoverPage from './DiscoverPage.jsx';
import CreatorProfile from './CreatorProfile.jsx';
import BookModal from './BookModal.jsx';
import DashboardPage from './DashboardPage.jsx';
import WalletPage from './WalletPage.jsx';
import RequirementsPage from './RequirementsPage.jsx';
import ProPage from './ProPage.jsx';
import ReferralPage from './ReferralPage.jsx';
import { SupportPage, PrivacyPage, TermsPage } from './SupportPages.jsx';
import AIPage from './AIPage.jsx';
import ChatToastHost from '../components/ChatToastHost.jsx';
import NegotiationModal from '../components/NegotiationModal.jsx';
import {
  TopBar, BottomNav, IconBtn, Badge, Sheet, Card, Button,
  EmptyState, Page, useToast, ThemeToggle, useEffectiveTheme,
} from '../components/ui.jsx';

const NAV = [
  { key: 'discover', label: 'Discover', icon: Compass },
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'ai', label: 'AI', icon: Sparkles },
  { key: 'wallet', label: 'Wallet', icon: WalletIcon },
  { key: 'marketplace', label: 'Marketplace', icon: Store },
];

const TOAST_FOR_TYPE = {
  booking_rejected: (n) => ({ kind: 'err', msg: `Booking rejected${n.body ? `: ${n.body}` : ''}` }),
  drive_link_shared: () => ({ kind: 'info', msg: 'Creator shared a delivery link — check your dashboard.' }),
  promotion_completed: () => ({ kind: 'ok', msg: 'Promotion completed by the creator.' }),
  completion_approved: () => ({ kind: 'ok', msg: 'Campaign approved — escrow released.' }),
  deposit_credited: (n) => ({ kind: 'ok', msg: `Wallet credited${n.amount ? ` with ₹${Number(n.amount).toLocaleString('en-IN')}` : ''}.` }),
  deposit_rejected: (n) => ({ kind: 'err', msg: `Wallet deposit rejected${n.body ? `: ${n.body}` : ''}.` }),
};

export default function BusinessApp({ onSwitchRole }) {
  const toast = useToast();
  const [booted, setBooted] = useState(false);
  const [user, setUser] = useState(null);
  const [biz, setBiz] = useState(null);
  const [bizMissing, setBizMissing] = useState(false);
  const [authNotice, setAuthNotice] = useState('');
  const [page, setPage] = useState('discover');
  const [creators, setCreators] = useState([]);
  const [loadingCreators, setLoadingCreators] = useState(true);
  const [bookings, setBookings] = useState([]);
  const [bizCampaigns, setBizCampaigns] = useState([]);
  const [notifs, setNotifs] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [boostedIds, setBoostedIds] = useState(new Set());
  const [boostedByCat, setBoostedByCat] = useState({});
  const [creatorId, setCreatorId] = useState(null);
  const [bookingCreator, setBookingCreator] = useState(null);
  const [bookingOptions, setBookingOptions] = useState({});
  const [negotiation, setNegotiation] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [inboxOpen, setInboxOpen] = useState(false);
  /* Pro subscribers automatically get the premium gold theme. */
  useEffectiveTheme(isBizPro(biz));
  const seenRef = useRef(new Set());
  const firstNotifLoad = useRef(true);

  /* ---------- auth ---------- */
  useEffect(() => {
    ensureFirebase().then(() => {
      watchAuth((u) => {
        setUser(u);
        setBooted(true);
        if (!u) {
          setBiz(null); setBizMissing(false);
          setCreators([]); setBookings([]); setNotifs([]); setReviews([]);
          seenRef.current = new Set(); firstNotifLoad.current = true;
        }
      });
    });
  }, []);

  const handleLogout = useCallback(async () => {
    await logout(); // also clears collancer_role — restore it so we stay in business role
    try { localStorage.setItem('collancer_role', 'business'); } catch (e) { /* noop */ }
  }, []);

  /* ---------- business doc + pro expiry ---------- */
  useEffect(() => {
    if (!user) return;
    let unsub = () => {};
    ensureFirebase().then(({ db }) => {
      unsub = onSnapshot(doc(db, 'businesses', user.uid), (snap) => {
        if (!snap.exists()) {
          setBizMissing(true);
          handleLogout();
          setAuthNotice('Your business profile was not found. Please register again.');
          return;
        }
        const data = { uid: snap.id, ...snap.data() };
        setBiz(data);
        // Pro expiry check on every snapshot
        if (data.proActive && tsMs(data.proExpiresAt) && tsMs(data.proExpiresAt) < Date.now()) {
          updateDoc(doc(db, 'businesses', user.uid), { isPro: false, proActive: false })
            .catch((e) => console.error('[biz] pro revoke', e));
        }
      }, (e) => console.error('[biz] doc', e));
    });
    return () => unsub();
  }, [user, handleLogout]);

  useEffect(() => {
    if (!user) return;
    const t = setInterval(async () => {
      try {
        const { db } = await ensureFirebase();
        const { getDoc } = await import('../lib/firebase.js');
        const snap = await getDoc(doc(db, 'businesses', user.uid));
        const d = snap.data();
        if (d?.proActive && tsMs(d.proExpiresAt) && tsMs(d.proExpiresAt) < Date.now()) {
          await updateDoc(doc(db, 'businesses', user.uid), { isPro: false, proActive: false });
          toast.info('Your Pro plan expired.');
        }
      } catch (e) { /* silent periodic check */ }
    }, 60000);
    return () => clearInterval(t);
  }, [user, toast]);

  /* ---------- live collections ---------- */
  useEffect(() => {
    if (!user) return;
    const unsubs = [];
    ensureFirebase().then(({ db }) => {
      unsubs.push(onSnapshot(collection(db, 'creators'), (s) => {
        const list = s.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((c) => c.addedToCollancer === true && !c.banned && c.hasActiveBooking !== true);
        try { setCreators(dedupeCreators(list)); }
        catch (e) { console.error('[biz] dedupe', e); setCreators(list); }
        setLoadingCreators(false);
      }, () => setLoadingCreators(false)));

      unsubs.push(onSnapshot(
        query(collection(db, 'bookings'), where('bizId', '==', user.uid)),
        (s) => setBookings(s.docs.map((d) => ({ id: d.id, ...d.data() }))),
        (e) => console.error('[biz] bookings', e)
      ));

      unsubs.push(onSnapshot(
        query(collection(db, 'bizCampaigns'), where('bizId', '==', user.uid)),
        (s) => setBizCampaigns(s.docs.map((d) => ({ id: d.id, ...d.data() }))),
        () => {}
      ));

      unsubs.push(onSnapshot(collection(db, 'reviews'), (s) => {
        setReviews(s.docs.map((d) => ({ id: d.id, ...d.data() })));
      }, () => {}));

      unsubs.push(onSnapshot(collection(db, 'adCampaigns'), (s) => {        const now = Date.now();
        const ids = new Set();
        const byCat = {};
        s.docs.forEach((d) => {
          const a = d.data();
          if (a.status === 'active' && tsMs(a.endsAt) > now && a.creatorId) {
            ids.add(a.creatorId);
            (a.categories || []).forEach((c) => {
              byCat[c] = byCat[c] || new Set();
              byCat[c].add(a.creatorId);
            });
          }
        });
        setBoostedIds(ids);
        setBoostedByCat(byCat);
      }, () => {}));

      unsubs.push(onSnapshot(
        query(collection(db, 'bizNotifs'), where('bizId', '==', user.uid)),
        (s) => {
          const list = s.docs.map((d) => ({ id: d.id, ...d.data() }));
          list.sort((a, b) => tsMs(b.createdAt) - tsMs(a.createdAt));
          setNotifs(list);
          if (firstNotifLoad.current) {
            list.forEach((n) => seenRef.current.add(n.id));
            firstNotifLoad.current = false;
            return;
          }
          list.forEach((n) => {
            if (seenRef.current.has(n.id)) return;
            seenRef.current.add(n.id);
            const fmt = TOAST_FOR_TYPE[n.type];
            if (fmt) {
              const { kind, msg } = fmt(n);
              toast[kind](msg);
            }
          });
        },
        (e) => console.error('[biz] notifs', e)
      ));
    });
    return () => unsubs.forEach((u) => u());
  }, [user, toast]);

  /* ---------- navigation ---------- */
  const goPage = useCallback((key) => {
    setCreatorId(null);
    setMenuOpen(false);
    setInboxOpen(false);
    setPage(key);
    try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (e) { window.scrollTo(0, 0); }
  }, []);

  const openCreator = useCallback((id) => { setBookingCreator(null); setCreatorId(id); }, []);
  const openBooking = useCallback((creator, options = {}) => { setBookingOptions(options); setBookingCreator(creator); }, []);

  useEffect(() => {
    if (!user || !creators.length) return;
    try {
      const raw = sessionStorage.getItem('collancer_public_intent');
      if (!raw) return;
      const intent = JSON.parse(raw);
      if (!intent?.creatorId) return;
      const c = creators.find((x) => x.id === intent.creatorId);
      if (!c) return;
      sessionStorage.removeItem('collancer_public_intent');
      const options = { initialPackageKey: intent.packageKey || null };
      if (intent.action === 'negotiate') setNegotiation({ creator: c, packageKey: intent.packageKey || null });
      else openBooking(c, options);
    } catch (e) { console.error('[business] public intent', e); }
  }, [user, creators, openBooking]);

  const unread = useMemo(() => notifs.filter((n) => !n.read).length, [notifs]);

  async function markAllRead() {
    try {
      const { db } = await ensureFirebase();
      await Promise.all(notifs.filter((n) => !n.read).map((n) =>
        updateDoc(doc(db, 'bizNotifs', n.id), { read: true }).catch(() => {})
      ));
    } catch (e) { /* noop */ }
  }

  async function markOneRead(id) {
    try {
      const { db } = await ensureFirebase();
      await updateDoc(doc(db, 'bizNotifs', id), { read: true });
    } catch (e) { /* noop */ }
  }

  /* ---------- render: auth gate ---------- */
  if (!booted) {
    return (
      <div style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center' }}>
        <Loader2 style={{ width: 28, height: 28, color: 'var(--cyan-deep)', animation: 'spin 1s linear infinite' }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }
  if (!user) {
    return <BusinessAuthScreen onSwitchRole={onSwitchRole} notice={authNotice} />;
  }

  const pro = isBizPro(biz);

  const ctx = {
    user, biz, creators, loadingCreators, bookings, bizCampaigns, notifs, reviews,
    boostedIds, boostedByCat, isPro: pro,
    page, goPage, openCreator, openBooking, onLogout: handleLogout, onSwitchRole,
  };

  const menuItems = [
    { key: 'referral', label: 'Referrals', icon: Gift, desc: 'Invite businesses, earn 5%' },
    { key: 'pro', label: pro ? 'Pro — Active' : 'Collancer Pro', icon: Crown, desc: pro ? 'Your plan and benefits' : 'Unlock marketplace, AI, 5% off' },
    { key: 'support', label: 'Support', icon: LifeBuoy, desc: 'Help and answers' },
    { key: 'privacy', label: 'Privacy Policy', icon: FileText, desc: 'How we handle your data' },
    { key: 'terms', label: 'Terms of Service', icon: ShieldCheck, desc: 'The fine print' },
  ];

  return (
    <BizProvider value={ctx}>
      <div className="cl-page">
        {creatorId ? (
          <CreatorProfile creatorId={creatorId} onBack={() => setCreatorId(null)} />
        ) : (
          <>
            {/* AI tab is full-screen: the assistant's own bar is the top bar */}
            {page !== 'ai' && (
              <TopBar
                brand
                pro={pro}
                right={
                  <>
                    <div style={{ position: 'relative' }}>
                      <IconBtn icon={Bell} label="Notifications" onClick={() => setInboxOpen(true)} />
                      {unread > 0 && (
                        <span style={{
                          position: 'absolute', top: 2, right: 2, minWidth: 18, height: 18, borderRadius: 8,
                          background: 'var(--red)', color: '#fff', fontSize: 10.5, fontWeight: 700,
                          display: 'grid', placeItems: 'center', padding: '0 5px', border: '2px solid #fff',
                        }}>
                          {unread > 9 ? '9+' : unread}
                        </span>
                      )}
                    </div>
                    <IconBtn icon={Menu} label="Menu" onClick={() => setMenuOpen(true)} />
                  </>
                }
              />
            )}
            {page === 'discover' && <DiscoverPage />}
            {page === 'dashboard' && <DashboardPage />}
            {page === 'ai' && <AIPage />}
            {page === 'wallet' && <WalletPage />}
            {page === 'marketplace' && <RequirementsPage />}
            {page === 'referral' && <ReferralPage />}
            {page === 'pro' && <ProPage />}
            {page === 'support' && <SupportPage />}
            {page === 'privacy' && <PrivacyPage />}
            {page === 'terms' && <TermsPage />}
            <BottomNav items={NAV} value={page} onChange={goPage} />
          </>
        )}

        {bookingCreator && (
          <BookModal
            creator={bookingCreator}
            initialPackageKey={bookingOptions.initialPackageKey}
            negotiatedPrice={bookingOptions.negotiatedPrice}
            negotiationId={bookingOptions.negotiationId}
            onClose={() => { setBookingCreator(null); setBookingOptions({}); }}
          />
        )}
        {negotiation && (
          <NegotiationModal
            mode="business"
            creator={negotiation.creator}
            biz={biz}
            user={user}
            negotiationId={negotiation.negotiationId}
            packageKey={negotiation.packageKey}
            onClose={() => setNegotiation(null)}
            onBook={({ amount, negotiationId }) => {
              setNegotiation(null);
              openBooking(negotiation.creator, {
                initialPackageKey: negotiation.packageKey,
                negotiatedPrice: amount,
                negotiationId,
              });
            }}
          />
        )}

        {/* more menu */}
        <Sheet open={menuOpen} onClose={() => setMenuOpen(false)} labelledBy="More options">
          <h3 style={{ fontSize: 17, marginBottom: 14 }}>More</h3>
          {menuItems.map((m) => (
            <button
              key={m.key}
              onClick={() => goPage(m.key)}
              className="cl-card pressable"
              style={{
                display: 'flex', gap: 12, alignItems: 'center', width: '100%',
                textAlign: 'left', cursor: 'pointer', marginBottom: 10,
              }}
            >
              <div style={{
                width: 40, height: 40, borderRadius: 8, flexShrink: 0,
                background: 'var(--cyan-soft)', display: 'grid', placeItems: 'center', color: 'var(--cyan-deep)',
              }}>
                <m.icon style={{ width: 18, height: 18 }} />
              </div>
              <div className="cl-grow">
                <div style={{ fontWeight: 700, fontSize: 14.5 }}>{m.label}</div>
                <div className="cl-small cl-muted">{m.desc}</div>
              </div>
            </button>
          ))}
          <div className="cl-divider" />
          <ThemeToggle pro={pro} />
          <Button variant="danger" block icon={LogOut} onClick={handleLogout}>Log out</Button>
        </Sheet>

        {/* notification inbox */}
        <Sheet open={inboxOpen} onClose={() => setInboxOpen(false)} labelledBy="Notifications">
          <div className="cl-row" style={{ marginBottom: 14 }}>
            <h3 style={{ fontSize: 17 }} className="cl-grow">Notifications</h3>
            {unread > 0 && (
              <Button size="sm" variant="ghost" icon={CheckCheck} onClick={markAllRead}>Mark all read</Button>
            )}
          </div>
          {notifs.length === 0 ? (
            <EmptyState icon={Bell} title="No notifications" body="Booking updates, deliveries and wallet events will appear here." />
          ) : (
            notifs.map((n) => (
              <Card
                key={n.id}
                onClick={() => markOneRead(n.id)}
                style={{
                  marginBottom: 10, cursor: 'pointer',
                  borderLeft: n.read ? undefined : '3px solid var(--cyan)',
                  opacity: n.read ? 0.75 : 1,
                }}
              >
                <div style={{ fontWeight: 700, fontSize: 14 }}>{n.title || n.type}</div>
                {n.body && <p className="cl-small cl-muted" style={{ marginTop: 4, lineHeight: 1.55 }}>{n.body}</p>}
                <div className="cl-small cl-muted" style={{ marginTop: 6 }}>
                  {n.createdAt?.seconds ? new Date(n.createdAt.seconds * 1000).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : ''}
                </div>
              </Card>
            ))
          )}
        </Sheet>
        <ChatToastHost notifs={notifs} myType="brand" />
      </div>
    </BizProvider>
  );
}
