/* Creator authentication — login + minimal registration.
   Register asks for NAME + PHONE only (plus email/password or Google).
   The creator's handle/profile is built from their Instagram account on the
   Connect-Instagram step that follows registration — nothing else is asked.
   Per audit §3.5: creators/{uid}; handle reservation happens at Instagram
   connect time (server-side), not at signup. */
import React, { useState } from 'react';
import { Mail, Lock, User as UserIcon, Phone, Eye, EyeOff, Loader2, BadgeCheck, MapPin } from 'lucide-react';
import {
  ensureFirebase, db, registerEmail, loginEmail, logout,
  loginGooglePopup, doc, setDoc, serverTimestamp,
} from '../lib/firebase.js';
import { TAGLINE } from '../lib/constants.js';
import { Button, Field, Input, Card, Page, Logo, useToast } from '../components/ui.jsx';

const emailOk = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(e || '').trim());
const phoneOk = (p) => /^[+\d][\d\s-]{7,15}$/.test(String(p || '').trim());

function blankCreatorDoc(uid, { name, phone, email }) {
  return {
    id: uid,
    name: name.trim(),
    phone: phone.trim(),
    whatsapp: phone.trim(),
    email: email.trim().toLowerCase(),
    handle: null,
    handleLower: null,
    platform: 'Instagram',
    niche: '',
    city: '',
    address: '',
    barterEligible: true,
    followers: 0,
    engagement: 0,
    rating: 0,
    bio: '',
    pfp: '',
    prices: {},
    instagram: null,
    onboardingStep: 'connect-instagram',
    verified: false,
    addedToCollancer: false,
    waitlisted: true,
    active: true,
    createdAt: serverTimestamp(),
  };
}

async function createCreatorDoc(uid, fields) {
  await ensureFirebase();
  await setDoc(doc(db(), 'creators', uid), blankCreatorDoc(uid, fields));
}

export default function CreatorAuthScreen() {
  const toast = useToast();
  const [mode, setMode] = useState('login'); // login | register
  const [busy, setBusy] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [err, setErr] = useState('');
  // Google register step 2: we have name+email from Google, still need the phone.
  const [googlePending, setGooglePending] = useState(null); // { name, email } | null
  const [f, setF] = useState({ name: '', phone: '', email: '', password: '' });
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target ? e.target.value : e }));

  async function doRegister(e) {
    e?.preventDefault();
    setErr('');
    if (f.name.trim().length < 2) return setErr('Please enter your full name.');
    if (!phoneOk(f.phone)) return setErr('Please enter a valid phone number.');
    if (!emailOk(f.email)) return setErr('Please enter a valid email address.');
    if (String(f.password).length < 6) return setErr('Password must be at least 6 characters.');
    setBusy(true);
    try {
      await ensureFirebase();
      const cred = await registerEmail(f.email.trim(), f.password);
      await createCreatorDoc(cred.user.uid, { name: f.name, phone: f.phone, email: f.email });
      toast.ok('Account created. Connect your Instagram to finish setup.');
    } catch (e2) {
      const m = String(e2?.message || e2);
      if (m.includes('email-already-in-use')) setErr('This email is already registered. Try logging in.');
      else setErr('Registration failed. Please check your details and try again.');
    } finally {
      setBusy(false);
    }
  }

  async function doGoogleRegisterPhone(e) {
    e?.preventDefault();
    setErr('');
    if (!googlePending) return;
    if (f.name.trim().length < 2) return setErr('Please enter your full name.');
    if (!phoneOk(f.phone)) return setErr('Please enter a valid phone number.');
    setBusy(true);
    try {
      const { getDocData } = await import('../lib/firebase.js');
      const { auth } = await import('../lib/firebase.js');
      const user = auth()?.currentUser;
      if (!user) throw new Error('not-signed-in');
      const existing = await getDocData('creators', user.uid);
      if (!existing) {
        await createCreatorDoc(user.uid, { name: f.name, phone: f.phone, email: googlePending.email });
      }
      setGooglePending(null);
      toast.ok('Account created. Connect your Instagram to finish setup.');
    } catch {
      setErr('Could not finish registration. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function doLogin(e) {
    e?.preventDefault();
    setErr('');
    if (!emailOk(f.email)) return setErr('Please enter a valid email address.');
    if (!f.password) return setErr('Please enter your password.');
    setBusy(true);
    try {
      const cred = await loginEmail(f.email.trim(), f.password);
      const { getDocData } = await import('../lib/firebase.js');
      const c = await getDocData('creators', cred.user.uid);
      if (!c) {
        await logout();
        setErr('No creator account found for this login. Please register first.');
      } else {
        toast.ok(`Welcome back, ${c.name?.split(' ')[0] || 'creator'}.`);
      }
    } catch (e2) {
      const m = String(e2?.code || e2?.message || '');
      if (m.includes('invalid-credential') || m.includes('wrong-password') || m.includes('user-not-found'))
        setErr('Incorrect email or password.');
      else setErr('Login failed. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function doGoogle() {
    setErr('');
    setBusy(true);
    try {
      const cred = await loginGooglePopup();
      const { getDocData } = await import('../lib/firebase.js');
      const c = await getDocData('creators', cred.user.uid);
      if (c) {
        toast.ok(`Welcome back, ${c.name?.split(' ')[0] || 'creator'}.`);
      } else if (mode === 'register') {
        // New Google user on the Register tab: just need the phone number.
        const nm = cred.user.displayName || '';
        setF((p) => ({ ...p, name: nm }));
        setGooglePending({ name: nm, email: cred.user.email || '' });
      } else {
        await logout();
        setErr('This Google account is not registered yet. Switch to the Register tab to join.');
      }
    } catch (e2) {
      if (String(e2?.code || '').includes('popup-closed-by-user')) { /* user dismissed */ }
      else setErr('Google sign-in failed. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  const pwToggle = (
    <button type="button" onClick={() => setShowPw((s) => !s)} aria-label="Toggle password visibility"
      style={{ position: 'absolute', right: 10, top: 11, border: 0, background: 'none', cursor: 'pointer', color: 'var(--faint)' }}>
      {showPw ? <EyeOff style={{ width: 18, height: 18 }} /> : <Eye style={{ width: 18, height: 18 }} />}
    </button>
  );

  return (
    <Page pageKey="creator-auth">
      <div className="cl-container" style={{ maxWidth: 460, paddingTop: 36, paddingBottom: 40 }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }} className="cl-fade">
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
            <Logo size={60} />
          </div>
          <h1 style={{ fontSize: 26, marginBottom: 4 }}>Collancer for Creators</h1>
          <p className="cl-small" style={{ letterSpacing: '.12em', fontWeight: 700, color: 'var(--cyan-deep)' }}>{TAGLINE}</p>
          <p className="cl-small cl-muted" style={{ marginTop: 8 }}>Get discovered by brands, manage bookings and track earnings.</p>
        </div>

        <Card className="cl-fade">
          {!googlePending && (
            <div className="cl-tabs" style={{ marginBottom: 18 }} role="tablist">
              {['login', 'register'].map((m) => (
                <button key={m} role="tab" aria-selected={mode === m} className={`cl-tab ${mode === m ? 'on' : ''}`}
                  onClick={() => { setMode(m); setErr(''); }}>
                  {m === 'login' ? 'Log in' : 'Register'}
                </button>
              ))}
            </div>
          )}

          {googlePending ? (
            <form onSubmit={doGoogleRegisterPhone}>
              <p className="cl-small" style={{ marginBottom: 14, lineHeight: 1.6 }}>
                One last step — add your phone number to finish creating your creator account.
              </p>
              <Field label="Full name">
                <div style={{ position: 'relative' }}>
                  <UserIcon style={{ position: 'absolute', left: 13, top: 14, width: 17, height: 17, color: 'var(--faint)' }} />
                  <Input value={f.name} onChange={set('name')} placeholder="Aarav Sharma" style={{ paddingLeft: 38 }} autoComplete="name" />
                </div>
              </Field>
              <Field label="Phone number">
                <div style={{ position: 'relative' }}>
                  <Phone style={{ position: 'absolute', left: 13, top: 14, width: 17, height: 17, color: 'var(--faint)' }} />
                  <Input value={f.phone} onChange={set('phone')} placeholder="+91 98765 43210" style={{ paddingLeft: 38 }} inputMode="tel" autoComplete="tel" />
                </div>
              </Field>
              {err && <div className="cl-error-text" style={{ marginBottom: 12 }}>{err}</div>}
              <Button block size="lg" loading={busy} type="submit" icon={BadgeCheck}>Finish registration</Button>
            </form>
          ) : mode === 'register' ? (
            <form onSubmit={doRegister}>
              <Field label="Full name">
                <div style={{ position: 'relative' }}>
                  <UserIcon style={{ position: 'absolute', left: 13, top: 14, width: 17, height: 17, color: 'var(--faint)' }} />
                  <Input value={f.name} onChange={set('name')} placeholder="Aarav Sharma" style={{ paddingLeft: 38 }} autoComplete="name" />
                </div>
              </Field>
              <Field label="Phone number">
                <div style={{ position: 'relative' }}>
                  <Phone style={{ position: 'absolute', left: 13, top: 14, width: 17, height: 17, color: 'var(--faint)' }} />
                  <Input value={f.phone} onChange={set('phone')} placeholder="+91 98765 43210" style={{ paddingLeft: 38 }} inputMode="tel" autoComplete="tel" />
                </div>
              </Field>
              <Field label="Email">
                <div style={{ position: 'relative' }}>
                  <Mail style={{ position: 'absolute', left: 13, top: 14, width: 17, height: 17, color: 'var(--faint)' }} />
                  <Input type="email" value={f.email} onChange={set('email')} placeholder="you@example.com" style={{ paddingLeft: 38 }} autoComplete="email" />
                </div>
              </Field>
              <Field label="Password">
                <div style={{ position: 'relative' }}>
                  <Lock style={{ position: 'absolute', left: 13, top: 14, width: 17, height: 17, color: 'var(--faint)' }} />
                  <Input type={showPw ? 'text' : 'password'} value={f.password} onChange={set('password')}
                    placeholder="Minimum 6 characters" style={{ paddingLeft: 38, paddingRight: 44 }} autoComplete="new-password" />
                  {pwToggle}
                </div>
              </Field>
              {err && <div className="cl-error-text" style={{ marginBottom: 12 }}>{err}</div>}
              <Button block size="lg" loading={busy} type="submit" icon={BadgeCheck}>Create creator account</Button>
              <div className="cl-row" style={{ margin: '16px 0 12px', gap: 12 }}>
                <div className="cl-divider cl-grow" style={{ margin: 0 }} />
                <span className="cl-small cl-muted">or</span>
                <div className="cl-divider cl-grow" style={{ margin: 0 }} />
              </div>
              <Button block variant="light" onClick={doGoogle} disabled={busy}>
                {busy ? <Loader2 className="spin" style={{ width: 17, height: 17 }} /> : (
                  <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
                  </svg>
                )}
                Continue with Google
              </Button>
              <p className="cl-small cl-muted" style={{ textAlign: 'center', marginTop: 12, lineHeight: 1.6 }}>
                That's all we ask — your profile builds itself when you connect Instagram next.
              </p>
            </form>
          ) : (
            <form onSubmit={doLogin}>
              <Field label="Email">
                <div style={{ position: 'relative' }}>
                  <Mail style={{ position: 'absolute', left: 13, top: 14, width: 17, height: 17, color: 'var(--faint)' }} />
                  <Input type="email" value={f.email} onChange={set('email')} placeholder="you@example.com" style={{ paddingLeft: 38 }} autoComplete="email" />
                </div>
              </Field>
              <Field label="Password">
                <div style={{ position: 'relative' }}>
                  <Lock style={{ position: 'absolute', left: 13, top: 14, width: 17, height: 17, color: 'var(--faint)' }} />
                  <Input type={showPw ? 'text' : 'password'} value={f.password} onChange={set('password')}
                    placeholder="Your password" style={{ paddingLeft: 38, paddingRight: 44 }} autoComplete="current-password" />
                  {pwToggle}
                </div>
              </Field>
              {err && <div className="cl-error-text" style={{ marginBottom: 12 }}>{err}</div>}
              <Button block size="lg" loading={busy} type="submit">Log in</Button>
              <div className="cl-row" style={{ margin: '16px 0 12px', gap: 12 }}>
                <div className="cl-divider cl-grow" style={{ margin: 0 }} />
                <span className="cl-small cl-muted">or</span>
                <div className="cl-divider cl-grow" style={{ margin: 0 }} />
              </div>
              <Button block variant="light" onClick={doGoogle} disabled={busy}>
                {busy ? <Loader2 className="spin" style={{ width: 17, height: 17 }} /> : (
                  <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
                  </svg>
                )}
                Continue with Google
              </Button>
              <p className="cl-small cl-muted" style={{ textAlign: 'center', marginTop: 12 }}>
                New here? Switch to the Register tab to join as a creator.
              </p>
            </form>
          )}
        </Card>
        <p className="cl-small cl-muted" style={{ textAlign: 'center', marginTop: 18 }}>
          <MapPin style={{ width: 13, height: 13, verticalAlign: -2 }} /> Built for creators across India
        </p>
      </div>
    </Page>
  );
}
