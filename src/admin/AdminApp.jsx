/* Admin role app — default export AdminApp({ onSwitchRole }).
   Owns admin auth internally (AdminAuthScreen when signed out).
   Tabs: Verification (ShieldCheck), Completions (PackageCheck), Payouts (IndianRupee), Deposits (Landmark)
   with live count badges. Each queue wrapped in <Page pageKey> + ErrorBoundary. */
import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { LogOut, Repeat, ShieldCheck, PackageCheck, IndianRupee, Landmark } from 'lucide-react';
import { ensureFirebase, auth, logout, getDocData } from '../lib/firebase.js';
import {
  TopBar, Badge, IconBtn, SkeletonCard, ToastProvider,
  ErrorBoundary, Page, useToast,
} from '../components/ui.jsx';
import AdminAuthScreen from './auth.jsx';
import VerificationQueue from './VerificationQueue.jsx';
import CompletionQueue from './CompletionQueue.jsx';
import PayoutQueue from './PayoutQueue.jsx';
import DepositQueue from './DepositQueue.jsx';

const TABS = [
  { key: 'verification', label: 'Verification', icon: ShieldCheck },
  { key: 'completions', label: 'Completions', icon: PackageCheck },
  { key: 'payouts', label: 'Payouts', icon: IndianRupee },
  { key: 'deposits', label: 'Deposits', icon: Landmark },
];

function TabBar({ value, onChange, counts }) {
  return (
    <div className="cl-tabs" role="tablist" style={{ marginBottom: 16 }}>
      {TABS.map((t) => {
        const I = t.icon;
        const n = counts[t.key] || 0;
        return (
          <button
            key={t.key}
            role="tab"
            aria-selected={value === t.key}
            className={`cl-tab ${value === t.key ? 'on' : ''}`}
            onClick={() => onChange(t.key)}
          >
            <I />
            {t.label}
            {n > 0 && <Badge tone="cyan">{n}</Badge>}
          </button>
        );
      })}
    </div>
  );
}

function AdminShell({ onSwitchRole }) {
  const toast = useToast();
  const [user, setUser] = useState(null);
  const [denied, setDenied] = useState(false);
  const [checking, setChecking] = useState(true);
  const [tab, setTab] = useState('verification');
  const [counts, setCounts] = useState({ verification: 0, completions: 0, payouts: 0, deposits: 0 });
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    let unsub = null;
    let dead = false;
    (async () => {
      await ensureFirebase();
      if (dead) return;
      unsub = onAuthStateChanged(auth(), async (u) => {
        if (dead) return;
        if (!u) { setUser(null); setChecking(false); return; }
        try {
          const adminDoc = await getDocData('admins', u.uid);
          if (adminDoc) {
            setUser(u); setDenied(false);
          } else {
            // Signed in but not an admin — revoke immediately.
            await logout();
            setDenied(true);
          }
        } catch (e) {
          setDenied(true);
        } finally {
          if (!dead) setChecking(false);
        }
      });
    })();
    return () => { dead = true; if (unsub) unsub(); };
  }, []);

  const handleLogout = async () => {
    setLoggingOut(true);
    try { await logout(); } finally { setUser(null); setLoggingOut(false); toast.info('Signed out'); }
  };

  const setCount = (key) => (n) => setCounts((c) => (c[key] === n ? c : { ...c, [key]: n }));

  if (checking) {
    return (
      <div className="cl-container" style={{ paddingTop: 24 }}>
        <SkeletonCard /><div style={{ height: 12 }} /><SkeletonCard />
      </div>
    );
  }

  if (!user) {
    return <AdminAuthScreen accessDenied={denied} onSwitchRole={onSwitchRole} />;
  }

  return (
    <div className="cl-container" style={{ paddingBottom: 48 }}>
      <TopBar
        title="Admin Console"
        subtitle={user.email || 'Administrator'}
        left={<ShieldCheck style={{ width: 22, height: 22, color: 'var(--cyan-deep)', flexShrink: 0 }} />}
        right={
          <div className="cl-row" style={{ gap: 8 }}>
            <Badge tone="cyan" icon={ShieldCheck}>Admin</Badge>
            <IconBtn icon={Repeat} label="Switch role" onClick={onSwitchRole} title="Switch role" />
            <IconBtn
              icon={LogOut} label="Sign out" title="Sign out"
              onClick={handleLogout}
              style={loggingOut ? { opacity: 0.5, pointerEvents: 'none' } : undefined}
            />
          </div>
        }
      />

      <TabBar value={tab} onChange={setTab} counts={counts} />

      <ErrorBoundary>
        <Page pageKey={tab}>
          {tab === 'verification' && <VerificationQueue onCount={setCount('verification')} />}
          {tab === 'completions' && <CompletionQueue onCount={setCount('completions')} />}
          {tab === 'payouts' && <PayoutQueue onCount={setCount('payouts')} />}
          {tab === 'deposits' && <DepositQueue onCount={setCount('deposits')} />}
        </Page>
      </ErrorBoundary>
    </div>
  );
}

export default function AdminApp({ onSwitchRole }) {
  return (
    <ToastProvider>
      <AdminShell onSwitchRole={onSwitchRole} />
    </ToastProvider>
  );
}
