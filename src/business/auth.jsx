/* Business authentication: register + login + Google helper.
   Audit §3.4: register -> businesses/{uid} (+ registration summary on same doc);
   login reads businesses/{uid}; missing doc -> reject with "please register" message. */
import React, { useEffect, useState } from 'react';
import { Building2, Mail, Lock, Phone, MapPin, Briefcase, ArrowRight, Loader2, LogIn, UserPlus, RefreshCw } from 'lucide-react';
import {
  ensureFirebase, registerEmail, loginEmail, loginGooglePopup,
  handleGoogleRedirectResult, logout, setDoc, doc, serverTimestamp,
} from '../lib/firebase.js';
import { INDUSTRIES, TAGLINE } from '../lib/constants.js';
import { Button, Field, Input, Select, Page, Logo, useToast } from '../components/ui.jsx';
import PhoneLoginForm from '../components/PhoneLogin.jsx';

const inputIcon = { width: 16, height: 16, color: 'var(--faint)', flexShrink: 0 };

function LabeledInput({ icon: Icon, ...props }) {
  return (
    <div className="cl-row" style={{ gap: 10 }}>
      {Icon && <Icon style={inputIcon} />}
      <Input {...props} style={{ flex: 1 }} />
    </div>
  );
}

export default function BusinessAuthScreen({ onSwitchRole, notice }) {
  const toast = useToast();
  const [mode, setMode] = useState('login'); // login | register
  const [loginMethod, setLoginMethod] = useState('email'); // email | phone (login tab)
  const [registerMethod, setRegisterMethod] = useState('form'); // form | phone (register tab)
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    bizName: '', email: '', whatsapp: '', address: '', industry: '', password: '',
  });

  useEffect(() => {
    ensureFirebase().then(() => handleGoogleRedirectResult().catch(() => null));
  }, []);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function writeBusinessDoc(uid, data) {
    const { db } = await ensureFirebase();
    await setDoc(doc(db, 'businesses', uid), {
      uid,
      type: 'business',
      createdAt: serverTimestamp(),
      waitlisted: true,
      walletBalance: 0,
      isPro: false,
      proActive: false,
      ...data,
      // registration summary (audit §3.4 — written to the same document)
      name: data.bizName || data.name,
      email: data.email,
      phone: data.whatsapp || data.phone || '',
      niche: data.industry || data.niche || '',
      platform: data.platform || '',
      socialUsername: data.socialUsername || '',
      registrationType: 'business',
      status: 'new',
      submittedAt: serverTimestamp(),
    }, { merge: true });
  }

  async function handleRegister(e) {
    e.preventDefault();
    setError('');
    const { bizName, email, whatsapp, address, industry, password } = form;
    if (!bizName.trim() || !email.trim() || !password || !whatsapp.trim()) {
      setError('Please fill business name, email, WhatsApp and password.');
      return;
    }
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    setBusy(true);
    try {
      const cred = await registerEmail(email.trim(), password);
      await writeBusinessDoc(cred.user.uid, {
        bizName: bizName.trim(), email: email.trim(), whatsapp: whatsapp.trim(),
        address: address.trim(), industry,
      });
      toast.ok('Business account created. Welcome to Collancer.');
    } catch (err) {
      console.error('[biz-auth] register', err);
      setError(err.code === 'auth/email-already-in-use'
        ? 'This email is already registered. Please log in instead.'
        : `Registration failed: ${err.message || 'please try again.'}`);
    } finally { setBusy(false); }
  }

  async function handleLogin(e) {
    e.preventDefault();
    setError('');
    if (!form.email.trim() || !form.password) { setError('Enter your email and password.'); return; }
    setBusy(true);
    try {
      const cred = await loginEmail(form.email.trim(), form.password);
      const { db } = await ensureFirebase();
      const { getDoc } = await import('../lib/firebase.js');
      const snap = await getDoc(doc(db, 'businesses', cred.user.uid));
      if (!snap.exists()) {
        await logout();
        setError('No business account found for this email. Please register first.');
        setMode('register');
        return;
      }
      toast.ok('Welcome back.');
    } catch (err) {
      console.error('[biz-auth] login', err);
      const code = err.code || '';
      setError(code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found'
        ? 'Incorrect email or password. Please try again.'
        : `Login failed: ${err.message || 'please try again.'}`);
    } finally { setBusy(false); }
  }

  async function handleGoogle() {
    setError('');
    setGoogleBusy(true);
    try {
      const cred = await loginGooglePopup();
      const u = cred.user;
      const { db } = await ensureFirebase();
      const { getDoc } = await import('../lib/firebase.js');
      const snap = await getDoc(doc(db, 'businesses', u.uid));
      if (!snap.exists()) {
        // Provision a minimal business doc so the Google helper stays usable;
        // the business can complete its profile from the dashboard.
        await writeBusinessDoc(u.uid, {
          bizName: u.displayName || 'My Business',
          email: u.email || '',
          whatsapp: '', address: '', industry: '',
          pfp: u.photoURL || null,
        });
        toast.info('Business profile created from your Google account — complete it in the dashboard.');
      } else {
        toast.ok('Welcome back.');
      }
    } catch (err) {
      console.error('[biz-auth] google', err);
      if (err.code !== 'auth/popup-closed-by-user') setError(`Google sign-in failed: ${err.message || 'try again.'}`);
    } finally { setGoogleBusy(false); }
  }

  async function handlePhoneVerified(user) {
    setError('');
    setBusy(true);
    try {
      const { db } = await ensureFirebase();
      const { getDoc } = await import('../lib/firebase.js');
      const snap = await getDoc(doc(db, 'businesses', user.uid));
      if (!snap.exists()) {
        await logout();
        setError('No business account found for this phone number. Please register first.');
        setLoginMethod('email');
      } else {
        toast.ok('Welcome back.');
      }
    } catch (err) {
      console.error('[biz-auth] phone', err);
      setError('Login failed. Please try again.');
    } finally { setBusy(false); }
  }

  async function handlePhoneSignup(user, { name, phone }) {
    setError('');
    setBusy(true);
    try {
      const { db } = await ensureFirebase();
      const { getDoc } = await import('../lib/firebase.js');
      const snap = await getDoc(doc(db, 'businesses', user.uid));
      if (!snap.exists()) {
        await writeBusinessDoc(user.uid, {
          bizName: name, email: user.email || '',
          whatsapp: phone, address: '', industry: '',
        });
      }
      toast.ok('Business account created. Welcome to Collancer.');
    } catch (err) {
      console.error('[biz-auth] phone-signup', err);
      setError('Could not create your account. Please try again.');
    } finally { setBusy(false); }
  }

  return (
    <Page pageKey="biz-auth">
      <div className="cl-container" style={{ paddingTop: 44, paddingBottom: 40, maxWidth: 460 }}>
        <div className="cl-fade" style={{ textAlign: 'center', marginBottom: 26 }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
            <Logo size={62} />
          </div>
          <h1 style={{ fontSize: 26 }}>Collancer for Business</h1>
          <p className="cl-small" style={{ letterSpacing: '.12em', fontWeight: 700, color: 'var(--cyan-deep)', marginTop: 6 }}>{TAGLINE}</p>
          <p className="cl-small cl-muted" style={{ marginTop: 10, lineHeight: 1.6 }}>
            Discover verified creators, run campaigns, and track everything in one place.
          </p>
        </div>

        {notice && (
          <div className="cl-card cl-fade" style={{ marginBottom: 16, borderColor: 'var(--amber)', background: 'var(--amber-soft)' }}>
            <p className="cl-small" style={{ color: 'var(--amber)', fontWeight: 600 }}>{notice}</p>
          </div>
        )}

        <div className="cl-card cl-fade">
          <div className="cl-tabs" style={{ marginBottom: 20 }}>
            <button className={`cl-tab ${mode === 'login' ? 'on' : ''}`} onClick={() => { setMode('login'); setLoginMethod('email'); setRegisterMethod('form'); setError(''); }}>
              <LogIn /> Log in
            </button>
            <button className={`cl-tab ${mode === 'register' ? 'on' : ''}`} onClick={() => { setMode('register'); setLoginMethod('email'); setRegisterMethod('form'); setError(''); }}>
              <UserPlus /> Register
            </button>
          </div>

          {mode === 'register' ? (
            registerMethod === 'phone' ? (
              <PhoneLoginForm
                mode="signup"
                nameLabel="Business name"
                onVerified={handlePhoneSignup}
                onBack={() => { setRegisterMethod('form'); setError(''); }}
              />
            ) : (
            <form onSubmit={handleRegister}>
              <Field label="Business name">
                <LabeledInput icon={Building2} placeholder="e.g. Acme Foods Pvt. Ltd." value={form.bizName} onChange={set('bizName')} />
              </Field>
              <Field label="Work email">
                <LabeledInput icon={Mail} type="email" placeholder="you@company.com" value={form.email} onChange={set('email')} />
              </Field>
              <div className="cl-row" style={{ alignItems: 'flex-start' }}>
                <div className="cl-grow">
                  <Field label="WhatsApp">
                    <LabeledInput icon={Phone} placeholder="+91 …" value={form.whatsapp} onChange={set('whatsapp')} />
                  </Field>
                </div>
                <div className="cl-grow">
                  <Field label="Industry">
                    <Select value={form.industry} onChange={set('industry')}>
                      <option value="">Select…</option>
                      {INDUSTRIES.map((i) => <option key={i} value={i}>{i}</option>)}
                    </Select>
                  </Field>
                </div>
              </div>
              <Field label="Address">
                <LabeledInput icon={MapPin} placeholder="City, State" value={form.address} onChange={set('address')} />
              </Field>
              <Field label="Password" hint="Minimum 6 characters">
                <LabeledInput icon={Lock} type="password" placeholder="Create a password" value={form.password} onChange={set('password')} />
              </Field>
              {error && <p className="cl-error-text" style={{ marginBottom: 12 }}>{error}</p>}
              <Button type="submit" block loading={busy} icon={ArrowRight}>Create business account</Button>
              <div className="cl-row" style={{ margin: '14px 0', gap: 12 }}>
                <div className="cl-divider" style={{ flex: 1, margin: 0 }} />
                <span className="cl-small cl-muted">or</span>
                <div className="cl-divider" style={{ flex: 1, margin: 0 }} />
              </div>
              <Button variant="light" block onClick={() => { setRegisterMethod('phone'); setError(''); }}
                disabled={busy} icon={Phone}>
                Continue with Phone
              </Button>
            </form>
            )
          ) : loginMethod === 'phone' ? (
            <PhoneLoginForm
              onVerified={handlePhoneVerified}
              onBack={() => { setLoginMethod('email'); setError(''); }}
            />
          ) : (
            <form onSubmit={handleLogin}>
              <Field label="Email">
                <LabeledInput icon={Mail} type="email" placeholder="you@company.com" value={form.email} onChange={set('email')} />
              </Field>
              <Field label="Password">
                <LabeledInput icon={Lock} type="password" placeholder="Your password" value={form.password} onChange={set('password')} />
              </Field>
              {error && <p className="cl-error-text" style={{ marginBottom: 12 }}>{error}</p>}
              <Button type="submit" block loading={busy} icon={LogIn}>Log in</Button>
              <div className="cl-row" style={{ margin: '14px 0', gap: 12 }}>
                <div className="cl-divider" style={{ flex: 1, margin: 0 }} />
                <span className="cl-small cl-muted">or</span>
                <div className="cl-divider" style={{ flex: 1, margin: 0 }} />
              </div>
              <Button variant="light" block loading={googleBusy} onClick={handleGoogle} icon={Briefcase}>
                Continue with Google
              </Button>
              <Button variant="light" block onClick={() => { setLoginMethod('phone'); setError(''); }}
                disabled={busy || googleBusy} style={{ marginTop: 10 }} icon={Phone}>
                Continue with Phone
              </Button>
            </form>
          )}
        </div>

        <button
          onClick={onSwitchRole}
          className="cl-small"
          style={{
            display: 'flex', alignItems: 'center', gap: 8, margin: '22px auto 0',
            background: 'none', border: 0, cursor: 'pointer', color: 'var(--muted)', fontWeight: 600,
          }}
        >
          <RefreshCw style={{ width: 14, height: 14 }} /> Use a different role
        </button>
        <p className="cl-small cl-muted" style={{ textAlign: 'center', marginTop: 14 }}>
          {busy ? <Loader2 className="spin" style={{ width: 14, height: 14, display: 'inline', verticalAlign: -2 }} /> : null}
          {' '}Secured with Firebase Authentication.
        </p>
      </div>
    </Page>
  );
}
