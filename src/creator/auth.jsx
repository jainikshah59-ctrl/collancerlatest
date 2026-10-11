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
import PhoneLoginForm from '../components/PhoneLogin.jsx';

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
  const [loginMethod, setLoginMethod] = useState('email'); // email | phone (login tab)
  const [registerMethod, setRegisterMethod] = useState('form'); // form | phone (register tab)
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

  async function handlePhoneVerified(user) {
    setErr('');
    setBusy(true);
    try {
      const { getDocData } = await import('../lib/firebase.js');
      const c = await getDocData('creators', user.uid);
      if (!c) {
        await logout();
        setErr('No creator account found for this phone number. Please register first.');
        setLoginMethod('email');
      } else {
        toast.ok(`Welcome back, ${c.name?.split(' ')[0] || 'creator'}.`);
      }
    } catch {
      setErr('Login failed. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function handlePhoneSignup(user, { name, phone }) {
    setErr('');
    setBusy(true);
    try {
      const { getDocData } = await import('../lib/firebase.js');
      const existing = await getDocData('creators', user.uid);
      if (!existing) {
        await createCreatorDoc(user.uid, { name, phone, email: user.email || '' });
      }
      toast.ok('Account created. Connect your Instagram to finish setup.');
    } catch {
      setErr('Could not create your account. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  const pwToggle = (
    <button type="button" onClick={() => setShowPw((s) => !s)} aria-label="Toggle password visibility"
      style={{ position: 'absolute', right: 10, top: 14, border: 0, background: 'none', cursor: 'pointer', color: 'var(--faint)', display: 'grid', placeItems: 'center' }}>
      {showPw ? <EyeOff style={{ width: 18, height: 18 }} /> : <Eye style={{ width: 18, height: 18 }} />}
    </button>
  );

  return (
    <Page pageKey="creator-auth">
      <style>{`
        .collancer-liquid-auth{max-width:460px!important;padding:28px 20px 36px!important;min-height:100dvh;display:flex;flex-direction:column;justify-content:center}
        .collancer-liquid-auth:before{content:"";position:fixed;inset:0;pointer-events:none;z-index:0;background:radial-gradient(ellipse at 15% 10%,rgba(34,211,238,.13),transparent 38%),radial-gradient(ellipse at 90% 35%,rgba(125,211,252,.16),transparent 35%),linear-gradient(160deg,#f9fcff,#edf7fb 55%,#fff)}
        .collancer-liquid-auth>*{position:relative;z-index:1}
        .collancer-liquid-auth .collancer-brand{margin-bottom:25px!important}
        .collancer-liquid-auth .collancer-brand .brand-mark{width:76px;height:76px;margin:0 auto 17px;border-radius:25px;display:grid;place-items:center;background:linear-gradient(145deg,rgba(255,255,255,.95),rgba(224,246,252,.58));border:1px solid rgba(255,255,255,.98);box-shadow:0 18px 36px -18px rgba(8,145,178,.42),inset 0 1px 1px #fff}
        .collancer-liquid-auth .collancer-brand h1{font-size:29px!important;letter-spacing:-.8px;color:#080d12}
        .collancer-liquid-auth .collancer-brand .cl-small{line-height:1.55}
        .collancer-liquid-auth .collancer-auth-card{padding:20px!important;border-radius:32px!important;background:linear-gradient(155deg,rgba(255,255,255,.88),rgba(238,248,252,.68))!important;backdrop-filter:blur(28px) saturate(175%);-webkit-backdrop-filter:blur(28px) saturate(175%);border:1px solid rgba(255,255,255,.98)!important;box-shadow:0 0 0 1px rgba(15,40,60,.06),0 28px 50px -25px rgba(15,50,80,.25),inset 0 1px 1px #fff!important}
        .collancer-liquid-auth .cl-tabs{display:flex;gap:8px;padding:5px;border-radius:26px;background:rgba(222,239,247,.62);border:1px solid rgba(255,255,255,.9)}
        .collancer-liquid-auth .cl-tab{flex:1;border-radius:22px!important;min-height:44px;font-weight:750;transition:all .25s ease}
        .collancer-liquid-auth .cl-tab.on{background:linear-gradient(180deg,#383c43,#050608)!important;color:#fff!important;box-shadow:0 8px 18px -9px rgba(0,0,0,.55),inset 0 1px 1px rgba(255,255,255,.4)!important}
        .collancer-liquid-auth input{border-radius:17px!important;background:linear-gradient(180deg,rgba(220,234,242,.56),rgba(255,255,255,.92))!important;box-shadow:inset 0 2px 4px rgba(15,50,80,.09),0 0 0 1px rgba(15,40,60,.07)!important}
        .collancer-liquid-auth input:focus{outline:0!important;box-shadow:0 0 0 4px rgba(34,211,238,.18),0 8px 18px -10px rgba(8,145,178,.35)!important}
        .collancer-liquid-auth button{transition:transform .25s ease,box-shadow .25s ease}
        .collancer-liquid-auth form>button:first-of-type{border-radius:26px!important}
        .collancer-liquid-auth .cl-auth-foot{font-size:12px;text-align:center;color:#60707d;margin-top:17px;line-height:1.5}
        @media(max-width:420px){.collancer-liquid-auth{padding:20px 14px 28px!important}.collancer-liquid-auth .collancer-auth-card{padding:17px!important}.collancer-liquid-auth .collancer-brand h1{font-size:26px!important}}
        @media(prefers-reduced-motion:no-preference){.collancer-liquid-auth .collancer-brand{animation:collancerFloat 6s ease-in-out infinite}.collancer-liquid-auth .collancer-auth-card{animation:collancerRise .65s cubic-bezier(.2,.9,.3,1) both}}
        @keyframes collancerFloat{50%{transform:translateY(-5px)}}@keyframes collancerRise{from{opacity:0;transform:translateY(14px) scale(.99)}to{opacity:1;transform:none}}
      `}</style>
      <div className="cl-container collancer-liquid-auth" style={{ maxWidth: 460, paddingTop: 36, paddingBottom: 40 }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }} className="cl-fade collancer-brand">
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
            <Logo size={60} />
          </div>
          <h1 style={{ fontSize: 26, marginBottom: 4 }}>Collancer for Creators</h1>
          <p className="cl-small" style={{ letterSpacing: '.12em', fontWeight: 700, color: 'var(--cyan-deep)' }}>{TAGLINE}</p>
          <p className="cl-small cl-muted" style={{ marginTop: 8 }}>Get discovered by brands, manage bookings and track earnings.</p>
        </div>

        <Card className="cl-fade collancer-auth-card">
          {!googlePending && (
            <div className="cl-tabs" style={{ marginBottom: 18 }} role="tablist">
              {['login', 'register'].map((m) => (
                <button key={m} role="tab" aria-selected={mode === m} className={`cl-tab ${mode === m ? 'on' : ''}`}
                  onClick={() => { setMode(m); setLoginMethod('email'); setRegisterMethod('form'); setErr(''); }}>
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
            registerMethod === 'phone' ? (
              <PhoneLoginForm
                mode="signup"
                nameLabel="Full name"
                onVerified={handlePhoneSignup}
                onBack={() => { setRegisterMethod('form'); setErr(''); }}
              />
            ) : (
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
              <Button block variant="light" onClick={() => { setRegisterMethod('phone'); setErr(''); }} disabled={busy}
                style={{ marginTop: 10 }} icon={Phone}>
                Continue with Phone
              </Button>
              <p className="cl-small cl-muted" style={{ textAlign: 'center', marginTop: 12, lineHeight: 1.6 }}>
                That's all we ask — your profile builds itself when you connect Instagram next.
              </p>
            </form>
            )
          ) : loginMethod === 'phone' ? (
            <PhoneLoginForm
              onVerified={handlePhoneVerified}
              onBack={() => { setLoginMethod('email'); setErr(''); }}
            />
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
              <Button block variant="light" onClick={() => { setLoginMethod('phone'); setErr(''); }} disabled={busy}
                style={{ marginTop: 10 }} icon={Phone}>
                Continue with Phone
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
