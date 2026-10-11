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
        .collancer-liquid-auth{box-sizing:border-box;width:100%;max-width:390px!important;padding:0 16px 22px!important;min-height:100dvh;display:flex;flex-direction:column;justify-content:center;position:relative;isolation:isolate;font-family:-apple-system,BlinkMacSystemFont,'SF Pro Display','SF Pro Text','Inter',system-ui,sans-serif;letter-spacing:-.01em;color:#0b1217}
        .collancer-liquid-auth *{box-sizing:border-box}
        .collancer-liquid-auth:before{content:"";position:fixed;inset:0;pointer-events:none;z-index:-1;background:radial-gradient(ellipse at 14% 12%,rgba(34,211,238,.08),transparent 34%),radial-gradient(ellipse at 90% 36%,rgba(190,202,215,.18),transparent 38%),linear-gradient(160deg,#fbfcfd,#f1f4f7 58%,#fff)}
        .collancer-liquid-auth .collancer-brand{margin:0 0 17px!important;padding-top:22px!important;position:relative}
        .collancer-liquid-auth .collancer-brand .cl-brand-icon{width:60px;height:60px;margin:0 auto 11px;border-radius:19px;display:grid;place-items:center;background:linear-gradient(145deg,#fff 0%,#e5e9ee 48%,#fdfefe 100%);backdrop-filter:blur(18px) saturate(140%);-webkit-backdrop-filter:blur(18px) saturate(140%);border:1px solid #aeb8c4;box-shadow:0 0 0 1px rgba(255,255,255,.95),0 5px 12px rgba(42,53,66,.16),inset 0 1.5px 1px #fff,inset 0 -1px 2px rgba(105,119,136,.22)}
        .collancer-liquid-auth .cl-brand-core{width:43px;height:43px;border-radius:13px;background:linear-gradient(160deg,#555b64 0%,#20242a 52%,#090a0c 100%);border:1px solid #929ba6;box-shadow:0 0 0 1px rgba(255,255,255,.75),0 2px 4px rgba(0,0,0,.3),inset 0 1px 1px rgba(255,255,255,.55);display:grid;place-items:center}
        .collancer-liquid-auth .cl-brand-core svg{width:31px;height:31px}
        .collancer-liquid-auth .collancer-brand h1{font-size:25px!important;line-height:1.15;font-weight:800!important;letter-spacing:-.65px!important;color:#090c10;margin:12px 0 0!important}
        .collancer-liquid-auth .collancer-brand .cl-small{line-height:1.4}
        .collancer-liquid-auth .collancer-brand .cl-tagline{margin-top:6px;font-size:10px;font-weight:800;letter-spacing:1.65px;color:#0e7490}
        .collancer-liquid-auth .collancer-brand .cl-muted{margin:7px 8px 0!important;font-size:12.5px;line-height:1.45;color:#596573}
        .collancer-liquid-auth .collancer-auth-card{padding:15px!important;border-radius:25px!important;position:relative;overflow:visible;background:linear-gradient(145deg,rgba(255,255,255,.94),rgba(235,239,244,.82) 48%,rgba(255,255,255,.94))!important;backdrop-filter:blur(20px) saturate(145%);-webkit-backdrop-filter:blur(20px) saturate(145%);border:1px solid #aeb8c4!important;box-shadow:0 0 0 1px rgba(255,255,255,.95),0 10px 24px -13px rgba(28,39,53,.42),inset 0 1.5px 1px #fff,inset 0 -1px 2px rgba(104,118,136,.2)!important}
        .collancer-liquid-auth .collancer-auth-card:before{content:"";position:absolute;inset:0;border-radius:inherit;padding:1px;pointer-events:none;background:linear-gradient(135deg,#fff 0%,#8e9aa8 18%,#fdfefe 36%,#a3adba 55%,#fff 72%,#8e9aa8 100%);-webkit-mask:linear-gradient(#fff 0 0) content-box,linear-gradient(#fff 0 0);-webkit-mask-composite:xor;mask-composite:exclude}
        .collancer-liquid-auth .collancer-auth-card>*{position:relative;z-index:1}
        .collancer-liquid-auth .cl-tabs{display:flex;gap:6px;padding:4px;border-radius:20px;background:linear-gradient(145deg,#e9edf1,#f9fafb 55%,#e4e8ed);border:1px solid #b7c0ca;box-shadow:0 1px 0 #fff,inset 0 1px 3px rgba(54,66,80,.12);margin-bottom:15px!important}
        .collancer-liquid-auth .cl-tab{flex:1;min-height:38px;padding:8px 0;border-radius:16px!important;border:1px solid #b8c1cb!important;background:linear-gradient(145deg,#fff,#e9edf1)!important;color:#56616e!important;font-size:13.5px;font-weight:700!important;box-shadow:0 1px 0 #fff,inset 0 1px 2px rgba(255,255,255,.9),0 2px 4px rgba(34,44,56,.08)!important}
        .collancer-liquid-auth .cl-tab.on{color:#fff!important;font-weight:750!important;border:1px solid #7f8995!important;background:linear-gradient(180deg,#555b64 0%,#292d33 48%,#111317 100%)!important;box-shadow:0 0 0 1px #fff,0 2px 5px rgba(0,0,0,.28),inset 0 1px 1px rgba(255,255,255,.48),inset 0 -1px 2px rgba(0,0,0,.4)!important}
        .collancer-liquid-auth .cl-field{margin:0 0 11px!important}
        .collancer-liquid-auth .cl-label{display:block;font-size:12.5px!important;font-weight:700!important;margin:0 0 6px 2px!important;color:#252c34!important}
        .collancer-liquid-auth .cl-input{width:100%;height:44px!important;min-height:44px;padding:0 12px!important;border-radius:13px!important;border:1px solid #aeb8c4!important;background:linear-gradient(180deg,#e9edf1 0%,#f9fafb 55%,#fff 100%)!important;color:#0b1217!important;font:500 13.5px -apple-system,BlinkMacSystemFont,'SF Pro Display','SF Pro Text','Inter',system-ui,sans-serif!important;box-shadow:0 1px 0 #fff,inset 0 2px 3px rgba(46,58,72,.10),inset 0 -1px 1px rgba(255,255,255,.9)!important;transition:box-shadow .22s ease,border-color .22s ease}
        .collancer-liquid-auth .cl-input::placeholder{color:#7a8591!important}
        .collancer-liquid-auth .cl-input:focus{outline:0!important;border-color:#72899b!important;box-shadow:0 0 0 2px rgba(126,151,171,.22),0 2px 5px rgba(34,48,62,.08),inset 0 1px 1px #fff!important}
        .collancer-liquid-auth .cl-btn{min-height:43px;border-radius:20px!important;font:700 13.5px -apple-system,BlinkMacSystemFont,'SF Pro Display','SF Pro Text','Inter',system-ui,sans-serif!important;display:flex;align-items:center;justify-content:center;gap:8px;transition:transform .2s ease,box-shadow .2s ease!important}
        .collancer-liquid-auth .cl-btn:hover{transform:translateY(-1px)}
        .collancer-liquid-auth .cl-btn:active{transform:scale(.99)}
        .collancer-liquid-auth .cl-btn-dark{color:#fff!important;border:1px solid #727d89!important;background:linear-gradient(180deg,#565c65 0%,#2c3036 48%,#101215 100%)!important;box-shadow:0 0 0 1px #fff,0 3px 7px rgba(25,33,43,.28),inset 0 1px 1px rgba(255,255,255,.48),inset 0 -1px 2px rgba(0,0,0,.45)!important}
        .collancer-liquid-auth .cl-btn-light{color:#171c22!important;border:1px solid #aeb8c4!important;background:linear-gradient(145deg,#fff 0%,#eef1f4 52%,#e3e7ec 100%)!important;box-shadow:0 0 0 1px #fff,0 2px 5px rgba(28,39,53,.13),inset 0 1px 1px #fff!important}
        .collancer-liquid-auth .cl-row{font-size:11.5px;font-weight:600;color:#6a7580}
        .collancer-liquid-auth .cl-divider{background:linear-gradient(90deg,transparent,#aeb8c4)!important;height:1px!important}
        .collancer-liquid-auth .cl-error-text{position:relative;z-index:2;border:1px solid #d7a6ae;border-radius:10px;padding:8px 10px;background:rgba(225,29,72,.07);font-size:12px}
        .collancer-liquid-auth .cl-btn-label{white-space:normal}
        .collancer-liquid-auth .cl-small{font-size:12px}
        @media(max-width:420px){.collancer-liquid-auth{padding:0 13px 18px!important;justify-content:center}.collancer-liquid-auth .collancer-auth-card{padding:13px!important;border-radius:22px!important}.collancer-liquid-auth .collancer-brand{padding-top:16px!important;margin-bottom:14px!important}.collancer-liquid-auth .collancer-brand .cl-brand-icon{width:54px;height:54px;border-radius:17px}.collancer-liquid-auth .cl-brand-core{width:39px;height:39px;border-radius:12px}.collancer-liquid-auth .collancer-brand h1{font-size:23px!important}.collancer-liquid-auth .collancer-brand .cl-tagline{font-size:9px;letter-spacing:1.35px}.collancer-liquid-auth .collancer-brand .cl-muted{font-size:12px}.collancer-liquid-auth .cl-input{height:42px!important;min-height:42px}.collancer-liquid-auth .cl-btn{min-height:41px}}
        @media(max-height:720px){.collancer-liquid-auth{justify-content:flex-start;padding-top:8px!important}.collancer-liquid-auth .collancer-brand{padding-top:8px!important;margin-bottom:10px!important}.collancer-liquid-auth .collancer-brand .cl-brand-icon{width:48px;height:48px;margin-bottom:7px}.collancer-liquid-auth .cl-brand-core{width:35px;height:35px}.collancer-liquid-auth .collancer-brand h1{margin-top:7px!important;font-size:22px!important}.collancer-liquid-auth .collancer-brand .cl-muted{margin-top:4px!important}.collancer-liquid-auth .collancer-auth-card{padding:12px!important}.collancer-liquid-auth .cl-field{margin-bottom:8px!important}}
        @media(prefers-reduced-motion:no-preference){.collancer-liquid-auth .collancer-brand{animation:collancerFloat 7s ease-in-out infinite}.collancer-liquid-auth .collancer-auth-card{animation:collancerRise .55s ease-out both}}
        @keyframes collancerFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-3px)}}@keyframes collancerRise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
        @media(prefers-reduced-motion:reduce){.collancer-liquid-auth *{animation:none!important;transition:none!important}}
      `}</style>
      <div className="cl-container collancer-liquid-auth" style={{ maxWidth: 460, paddingTop: 36, paddingBottom: 40 }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }} className="cl-fade collancer-brand">
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
            <div className="cl-brand-icon" aria-hidden="true">
              <div className="cl-brand-core">
                <svg width="40" height="40" viewBox="0 0 40 40" aria-hidden="true">
                  <g stroke="#fff" strokeWidth="3.4" strokeLinecap="round">
                    <path d="M20 9v22M9 20h22M12 12l16 16M28 12L12 28" />
                  </g>
                  <g fill="#22d3ee">
                    <circle cx="20" cy="6" r="2.8" /><circle cx="20" cy="34" r="2.8" />
                    <circle cx="6" cy="20" r="2.8" /><circle cx="34" cy="20" r="2.8" />
                  </g>
                </svg>
              </div>
            </div>
          </div>
          <h1 style={{ fontSize: 26, marginBottom: 4 }}>Collancer for Creators</h1>
          <p className="cl-small cl-tagline">{TAGLINE || 'WHERE INFLUENCE MEETS INDUSTRY'}</p>
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
        <p className="cl-small cl-muted" style={{ textAlign: 'center', marginTop: 14, fontSize: 12 }}> <MapPin style={{ width: 13, height: 13, verticalAlign: -2 }} /> Built for creators across India </p>
      </div>
    </Page>
  );
}
