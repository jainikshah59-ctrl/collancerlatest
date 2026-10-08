/* Collancer root — role gate.
   No React Router: navigation is state-based inside each role app.
   Role persisted in localStorage under `collancer_role`.
   Public role screen offers Business + Creator only. Admin is private:
   open the app with ?admin once to unlock the admin console on that device. */
import React, { Suspense, useEffect, useState } from 'react';
import { Briefcase, Sparkles, ArrowRight, Loader2 } from 'lucide-react';
import { TAGLINE } from './lib/constants.js';
import { ensureFirebase } from './lib/firebase.js';
import { ToastProvider, Button, Page, Logo, getTheme, applyTheme } from './components/ui.jsx';

const BusinessApp = React.lazy(() => import('./business/BusinessApp.jsx'));
const CreatorApp = React.lazy(() => import('./creator/CreatorApp.jsx'));
const AdminApp = React.lazy(() => import('./admin/AdminApp.jsx'));
const PublicCreatorProfile = React.lazy(() => import('./PublicCreatorProfile.jsx').then((m) => ({ default: m.PublicCreatorProfileWrap })));
const PublicPrivacyPage = React.lazy(() => import('./legal/PublicLegal.jsx').then((m) => ({ default: m.PublicPrivacyPage })));
const PublicDataDeletionPage = React.lazy(() => import('./legal/PublicLegal.jsx').then((m) => ({ default: m.PublicDataDeletionPage })));

const ROLE_KEY = 'collancer_role';

function RoleSelect({ onPick }) {
  const roles = [
    {
      key: 'business', icon: Briefcase, title: 'Business',
      desc: 'Discover creators, run campaigns, manage your wallet and marketplace requirements.',
    },
    {
      key: 'creator', icon: Sparkles, title: 'Creator',
      desc: 'Get discovered, manage bookings, track earnings and grow with Collancer AI.',
    },
  ];
  return (
    <Page pageKey="role-select">
      <div className="cl-container" style={{ paddingTop: 40, paddingBottom: 40, maxWidth: 520 }}>
        <div className="cl-fade" style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
            <Logo size={72} />
          </div>
          <h1 style={{ fontSize: 30, marginBottom: 6 }}>Collancer</h1>
          <p className="cl-small" style={{ letterSpacing: '.14em', fontWeight: 700, color: 'var(--cyan-deep)' }}>{TAGLINE}</p>
          <p className="cl-small cl-muted" style={{ marginTop: 10, lineHeight: 1.6 }}>
            The trusted bridge between brands and creators.<br />Choose how you want to continue.
          </p>
        </div>
        <div style={{ display: 'grid', gap: 12 }}>
          {roles.map((r, i) => (
            <button
              key={r.key}
              onClick={() => onPick(r.key)}
              className="cl-card pressable lift cl-fade"
              style={{
                display: 'flex', alignItems: 'center', gap: 14, textAlign: 'left',
                cursor: 'pointer', width: '100%',
                animationDelay: `${i * 70}ms`,
              }}
            >
              <div style={{
                width: 48, height: 48, borderRadius: 8, flexShrink: 0,
                display: 'grid', placeItems: 'center',
                background: 'var(--cyan-soft)', color: 'var(--cyan-deep)',
                border: '1px solid var(--line-soft)',
              }}>
                <r.icon style={{ width: 22, height: 22 }} />
              </div>
              <div className="cl-grow">
                <div style={{ fontWeight: 700, fontSize: 15.5 }}>{r.title}</div>
                <div className="cl-small cl-muted" style={{ marginTop: 3, lineHeight: 1.5 }}>{r.desc}</div>
              </div>
              <ArrowRight style={{ width: 18, height: 18, color: 'var(--faint)', flexShrink: 0 }} />
            </button>
          ))}
        </div>
        <p className="cl-small cl-muted" style={{ textAlign: 'center', marginTop: 26 }}>
          By continuing you agree to our{' '}
          <button
            onClick={() => { window.location.href = '/?legal=privacy'; }}
            style={{ background: 'none', border: 0, padding: 0, color: 'var(--cyan)', cursor: 'pointer', fontSize: 'inherit', textDecoration: 'underline' }}
          >
            Terms & Privacy Policy
          </button>.
        </p>
      </div>
    </Page>
  );
}

function Curtain() {
  return (
    <div style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', background: 'var(--bg)' }}>
      <div className="cl-fade" style={{ textAlign: 'center' }}>
        <Loader2 className="spin" style={{ width: 30, height: 30, color: 'var(--cyan-deep)', animation: 'spin 1s linear infinite' }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}} .spin{animation:spin 1s linear infinite}`}</style>
        <p className="cl-small cl-muted" style={{ marginTop: 12 }}>Loading Collancer…</p>
      </div>
    </div>
  );
}

export default function App() {
  const [role, setRole] = useState(null);
  const [booted, setBooted] = useState(false);

  useEffect(() => {
    // Apply the persisted theme ASAP so the first paint matches (index.html pre-sets data-theme too).
    applyTheme(getTheme());
    let cancelled = false;
    // Returning users get a short Firebase-auth curtain before the role screen.
    ensureFirebase().then(() => {
      if (cancelled) return;
      let saved = null;
      try {
        // Private admin entry: opening the app with ?admin unlocks the admin
        // console on that device. The role screen itself never offers admin.
        if (window.location.search.includes('admin')) {
          localStorage.setItem(ROLE_KEY, 'admin');
        }
        saved = localStorage.getItem(ROLE_KEY);
      } catch (e) { /* noop */ }
      if (saved === 'business' || saved === 'creator' || saved === 'admin') setRole(saved);
      setBooted(true);
    });
    return () => { cancelled = true; };
  }, []);

  const pick = (r) => {
    try { localStorage.setItem(ROLE_KEY, r); } catch (e) { /* noop */ }
    setRole(r);
  };
  const switchRole = () => {
    try { localStorage.removeItem(ROLE_KEY); } catch (e) { /* noop */ }
    setRole(null);
  };

  if (!booted) return <ToastProvider><Curtain /></ToastProvider>;

  // Public legal pages (no login required) — Meta App Review needs public
  // Privacy Policy and Data Deletion URLs.
  const legal = (() => {
    try {
      const m = new URLSearchParams(window.location.search).get('legal');
      return m === 'privacy' || m === 'data-deletion' ? m : null;
    } catch { return null; }
  })();
  if (legal) {
    return (
      <ToastProvider>
        <Suspense fallback={<Curtain />}>
          {legal === 'privacy' ? <PublicPrivacyPage /> : <PublicDataDeletionPage />}
        </Suspense>
      </ToastProvider>
    );
  }

  // Public creator profile: /c/{handle} — no login required (Collabstr-style).
  const publicHandle = (() => {
    try {
      const m = window.location.pathname.match(/^\/c\/([a-zA-Z0-9._]{1,30})\/?$/);
      return m ? m[1] : null;
    } catch { return null; }
  })();
  if (publicHandle) {
    return (
      <ToastProvider>
        <Suspense fallback={<Curtain />}>
          <PublicCreatorProfile handle={publicHandle} />
        </Suspense>
      </ToastProvider>
    );
  }

  return (
    <ToastProvider>
      {!role && <RoleSelect onPick={pick} />}
      {role && (
        <Suspense fallback={<Curtain />}>
          {role === 'business' && <BusinessApp onSwitchRole={switchRole} />}
          {role === 'creator' && <CreatorApp onSwitchRole={switchRole} />}
          {role === 'admin' && <AdminApp onSwitchRole={switchRole} />}
        </Suspense>
      )}
    </ToastProvider>
  );
}
