/* Collancer root — role gate.
   No React Router: navigation is state-based inside each role app.
   Role persisted in localStorage under `collancer_role`.
   Public role screen offers Business + Creator only. Admin is private:
   open the app with ?admin once to unlock the admin console on that device. */
import React, { Suspense, useEffect, useState } from 'react';
import { Sparkles, ArrowRight, Loader2, LockKeyhole } from 'lucide-react';
import { TAGLINE } from './lib/constants.js';
import { ensureFirebase } from './lib/firebase.js';
import { ToastProvider, Button, Page, Logo, getTheme, applyTheme } from './components/ui.jsx';

const CreatorApp = React.lazy(() => import('./creator/CreatorApp.jsx'));
const AdminApp = React.lazy(() => import('./admin/AdminApp.jsx'));
const PublicCreatorProfile = React.lazy(() => import('./PublicCreatorProfile.jsx').then((m) => ({ default: m.PublicCreatorProfileWrap })));
const PublicMediaKit = React.lazy(() => import('./PublicMediaKit.jsx'));
const PublicPrivacyPage = React.lazy(() => import('./legal/PublicLegal.jsx').then((m) => ({ default: m.PublicPrivacyPage })));
const PublicDataDeletionPage = React.lazy(() => import('./legal/PublicLegal.jsx').then((m) => ({ default: m.PublicDataDeletionPage })));

const ROLE_KEY = 'collancer_role';

function RoleSelect({ onPick }) {
  const roles = [{ key: 'creator', icon: Sparkles, title: 'Creator', desc: 'Get discovered, manage bookings, track earnings and grow with Collancer AI.' }];
  return (
    <Page pageKey="role-select">
      <div className="cl-container" style={{ paddingTop: 40, paddingBottom: 40, maxWidth: 520 }}>
        <div className="cl-fade" style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}><Logo size={72} /></div>
          <h1 style={{ fontSize: 30, marginBottom: 6 }}>Collancer</h1>
          <p className="cl-small" style={{ letterSpacing: '.14em', fontWeight: 700, color: 'var(--cyan-deep)' }}>{TAGLINE}</p>
          <p className="cl-small cl-muted" style={{ marginTop: 10, lineHeight: 1.6 }}>Creator onboarding is currently open. Brand access is temporarily closed.</p>
        </div>
        <button onClick={() => onPick('creator')} className="cl-card pressable lift cl-fade"
          style={{ display: 'flex', alignItems: 'center', gap: 14, textAlign: 'left', cursor: 'pointer', width: '100%' }}>
          <div style={{ width: 48, height: 48, borderRadius: 8, display: 'grid', placeItems: 'center', background: 'var(--cyan-soft)', color: 'var(--cyan-deep)', border: '1px solid var(--line-soft)' }}>
            <Sparkles style={{ width: 22, height: 22 }} />
          </div>
          <div className="cl-grow"><div style={{ fontWeight: 700, fontSize: 15.5 }}>Creator</div><div className="cl-small cl-muted" style={{ marginTop: 3, lineHeight: 1.5 }}>Get discovered, manage bookings, track earnings and grow with Collancer AI.</div></div>
          <ArrowRight style={{ width: 18, height: 18, color: 'var(--faint)', flexShrink: 0 }} />
        </button>
      </div>
    </Page>
  );
}

function BusinessLocked() {
  return (
    <Page pageKey="business-locked">
      <div className="cl-container" style={{ minHeight: '100dvh', maxWidth: 520, display: 'grid', placeItems: 'center', padding: 32 }}>
        <div className="cl-card cl-fade" style={{ textAlign: 'center', padding: 30 }}>
          <div style={{ width: 58, height: 58, margin: '0 auto 16px', borderRadius: 14, display: 'grid', placeItems: 'center', background: 'var(--surface-2)', color: 'var(--cyan-deep)' }}><LockKeyhole style={{ width: 26, height: 26 }} /></div>
          <h2 style={{ marginBottom: 8 }}>Brand access is temporarily closed</h2>
          <p className="cl-small cl-muted" style={{ lineHeight: 1.65 }}>Brand registration and login are currently unavailable while Collancer completes the creator onboarding and review rollout.</p>
          <Button block size="lg" style={{ marginTop: 18 }} onClick={() => { try { localStorage.removeItem(ROLE_KEY); } catch {} window.location.reload(); }}>Continue as Creator</Button>
        </div>
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

  // Public media kit: a standalone, dashboard-free creator media kit.
  const mediaKitHandle = (() => {
    try { const m = window.location.pathname.match(/^\\/media-kit\\/([a-zA-Z0-9._]{1,30})\\/?$/); return m ? m[1] : null; }
    catch { return null; }
  })();
  if (mediaKitHandle) {
    return <ToastProvider><Suspense fallback={<Curtain />}><PublicMediaKit handle={mediaKitHandle} /></Suspense></ToastProvider>;
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
          {role === 'business' && <BusinessLocked />}
          {role === 'creator' && <CreatorApp onSwitchRole={switchRole} />}
          {role === 'admin' && <AdminApp onSwitchRole={switchRole} />}
        </Suspense>
      )}
    </ToastProvider>
  );
}
