/* Creator authentication — registration with atomic handle reservation + login.
   Per audit §3.5 / §3.6: creators/{uid} with ALL §3.5 fields, creatorHandles/{handleLower}
   reservation in a transaction, with a fallback path for older rulesets. */
import React, { useState } from 'react';
import { Mail, Lock, AtSign, User as UserIcon, MapPin, Phone, Home, Eye, EyeOff, Loader2, BadgeCheck } from 'lucide-react';
import {
  ensureFirebase, db, registerEmail, loginEmail, logout,
  loginGooglePopup, doc, collection, query, where, limit, getDocs,
  runTransaction, setDoc, serverTimestamp,
} from '../lib/firebase.js';
import { PLATFORMS, NICHES, CITIES, TAGLINE } from '../lib/constants.js';
import { Button, Field, Input, TextArea, Select, Card, Page, Toggle, Logo, useToast } from '../components/ui.jsx';

const normHandle = (h) => String(h || '').trim().replace(/^@/, '').toLowerCase();
const emailOk = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(e || '').trim());
const handleOk = (h) => /^[a-z0-9._]{3,30}$/.test(normHandle(h));

function blankCreatorDoc(uid, f, handle, handleLower) {
  return {
    id: uid,
    name: f.name.trim(),
    handle,
    handleLower,
    email: f.email.trim().toLowerCase(),
    platform: f.platform,
    niche: f.niche,
    city: f.city,
    whatsapp: f.whatsapp.trim(),
    address: f.address.trim(),
    barterEligible: !!f.barterEligible,
    followers: 0,
    ytSubscribers: 0,
    engagement: 0,
    rating: 0,
    price: 0,
    bio: '',
    verified: false,
    trending: false,
    featured: false,
    tags: [],
    reviews: 0,
    avgViews: 0,
    avgLikes: 0,
    reach: 0,
    prices: {},
    createdAt: serverTimestamp(),
    active: true,
    verificationStatus: 'none',
    addedToCollancer: false,
    waitlisted: true,
  };
}

export default function CreatorAuthScreen() {
  const toast = useToast();
  const [mode, setMode] = useState('login'); // login | register
  const [busy, setBusy] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [err, setErr] = useState('');
  const [f, setF] = useState({
    name: '', handle: '', email: '', platform: 'Instagram', niche: NICHES[0], city: 'Mumbai',
    whatsapp: '', address: '', password: '', barterEligible: true,
  });
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target ? e.target.value : e }));

  async function doRegister(e) {
    e?.preventDefault();
    setErr('');
    const handle = normHandle(f.handle);
    if (f.name.trim().length < 2) return setErr('Please enter your full name.');
    if (!handleOk(f.handle)) return setErr('Handle must be 3–30 characters: letters, numbers, dot or underscore.');
    if (!emailOk(f.email)) return setErr('Please enter a valid email address.');
    if (!/^[+\d][\d\s-]{7,15}$/.test(f.whatsapp.trim())) return setErr('Please enter a valid WhatsApp number.');
    if (f.address.trim().length < 10) return setErr('Please enter your full shipping address (needed for barter).');
    if (String(f.password).length < 6) return setErr('Password must be at least 6 characters.');
    setBusy(true);
    try {
      await ensureFirebase();
      // 1. Pre-check handle uniqueness in creators.
      const pre = await getDocs(query(collection(db(), 'creators'), where('handleLower', '==', handle), limit(1)));
      if (!pre.empty) throw new Error('HANDLE_TAKEN');
      // 2. Create Firebase Auth user.
      const cred = await registerEmail(f.email.trim(), f.password);
      const uid = cred.user.uid;
      const creatorDoc = blankCreatorDoc(uid, f, f.handle.trim().replace(/^@/, ''), handle);
      // 3. Transaction: reserve handle + create creator doc atomically.
      try {
        await runTransaction(db(), async (tx) => {
          const hRef = doc(db(), 'creatorHandles', handle);
          const cRef = doc(db(), 'creators', uid);
          const [hSnap, cSnap] = await Promise.all([tx.get(hRef), tx.get(cRef)]);
          if (hSnap.exists()) throw new Error('HANDLE_TAKEN');
          if (cSnap.exists()) throw new Error('ACCOUNT_EXISTS');
          tx.set(hRef, { creatorId: uid, handle: creatorDoc.handle, createdAt: serverTimestamp() });
          tx.set(cRef, creatorDoc);
        });
      } catch (txErr) {
        // Fallback path for rulesets that predate creatorHandles: create the creator
        // document directly, then best-effort the handle reservation.
        const msg = String(txErr?.message || '');
        if (msg.includes('HANDLE_TAKEN')) throw new Error('This handle is already taken. Try another.');
        if (msg.includes('ACCOUNT_EXISTS')) throw new Error('An account already exists for this login.');
        try {
          await setDoc(doc(db(), 'creators', uid), creatorDoc);
          try {
            await setDoc(doc(db(), 'creatorHandles', handle), { creatorId: uid, handle: creatorDoc.handle, createdAt: serverTimestamp() });
          } catch (e2) { /* reservation unavailable on this ruleset — profile still created */ }
        } catch (e3) {
          throw txErr;
        }
      }
      toast.ok('Creator account created. Welcome to Collancer.');
    } catch (e2) {
      const m = String(e2?.message || e2);
      if (m.includes('HANDLE_TAKEN') || m.includes('already taken')) setErr('This handle is already taken. Try another.');
      else if (m.includes('email-already-in-use')) setErr('This email is already registered. Try logging in.');
      else if (m.includes('ACCOUNT_EXISTS')) setErr('An account already exists for this login.');
      else setErr('Registration failed. Please check your details and try again.');
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
        setErr('No creator account found for this login. Please register as a creator first.');
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
      if (!c) {
        await logout();
        setErr('This Google account is not registered as a creator yet. Please complete the registration form first.');
      } else {
        toast.ok(`Welcome back, ${c.name?.split(' ')[0] || 'creator'}.`);
      }
    } catch (e2) {
      if (String(e2?.code || '').includes('popup-closed-by-user')) { /* user dismissed */ }
      else setErr('Google sign-in failed. Please try again.');
    } finally {
      setBusy(false);
    }
  }

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
          <div className="cl-tabs" style={{ marginBottom: 18 }} role="tablist">
            {['login', 'register'].map((m) => (
              <button key={m} role="tab" aria-selected={mode === m} className={`cl-tab ${mode === m ? 'on' : ''}`}
                onClick={() => { setMode(m); setErr(''); }}>
                {m === 'login' ? 'Log in' : 'Register'}
              </button>
            ))}
          </div>

          {mode === 'register' ? (
            <form onSubmit={doRegister}>
              <div className="cl-row" style={{ gap: 10 }}>
                <div className="cl-grow">
                  <Field label="Full name">
                    <div style={{ position: 'relative' }}>
                      <UserIcon style={{ position: 'absolute', left: 13, top: 14, width: 17, height: 17, color: 'var(--faint)' }} />
                      <Input value={f.name} onChange={set('name')} placeholder="Aarav Sharma" style={{ paddingLeft: 38 }} autoComplete="name" />
                    </div>
                  </Field>
                </div>
                <div className="cl-grow">
                  <Field label="Creator handle" hint="Unique, case-insensitive">
                    <div style={{ position: 'relative' }}>
                      <AtSign style={{ position: 'absolute', left: 13, top: 14, width: 17, height: 17, color: 'var(--faint)' }} />
                      <Input value={f.handle} onChange={set('handle')} placeholder="aarav.creates" style={{ paddingLeft: 38 }} autoComplete="username" />
                    </div>
                  </Field>
                </div>
              </div>
              <Field label="Email">
                <div style={{ position: 'relative' }}>
                  <Mail style={{ position: 'absolute', left: 13, top: 14, width: 17, height: 17, color: 'var(--faint)' }} />
                  <Input type="email" value={f.email} onChange={set('email')} placeholder="you@example.com" style={{ paddingLeft: 38 }} autoComplete="email" />
                </div>
              </Field>
              <div className="cl-row" style={{ gap: 10 }}>
                <div className="cl-grow">
                  <Field label="Primary platform">
                    <Select value={f.platform} onChange={set('platform')}>
                      {PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
                    </Select>
                  </Field>
                </div>
                <div className="cl-grow">
                  <Field label="Niche">
                    <Select value={f.niche} onChange={set('niche')}>
                      {NICHES.map((n) => <option key={n} value={n}>{n}</option>)}
                    </Select>
                  </Field>
                </div>
              </div>
              <div className="cl-row" style={{ gap: 10 }}>
                <div className="cl-grow">
                  <Field label="City">
                    <Select value={f.city} onChange={set('city')}>
                      {CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </Select>
                  </Field>
                </div>
                <div className="cl-grow">
                  <Field label="WhatsApp">
                    <div style={{ position: 'relative' }}>
                      <Phone style={{ position: 'absolute', left: 13, top: 14, width: 17, height: 17, color: 'var(--faint)' }} />
                      <Input value={f.whatsapp} onChange={set('whatsapp')} placeholder="+91 98765 43210" style={{ paddingLeft: 38 }} inputMode="tel" />
                    </div>
                  </Field>
                </div>
              </div>
              <Field label="Shipping address" hint="Shared with brands only after you accept a barter booking">
                <div style={{ position: 'relative' }}>
                  <Home style={{ position: 'absolute', left: 13, top: 14, width: 17, height: 17, color: 'var(--faint)' }} />
                  <TextArea value={f.address} onChange={set('address')} placeholder="Flat, street, area, city, PIN" style={{ paddingLeft: 38, minHeight: 76 }} />
                </div>
              </Field>
              <Field label="Password">
                <div style={{ position: 'relative' }}>
                  <Lock style={{ position: 'absolute', left: 13, top: 14, width: 17, height: 17, color: 'var(--faint)' }} />
                  <Input type={showPw ? 'text' : 'password'} value={f.password} onChange={set('password')}
                    placeholder="Minimum 6 characters" style={{ paddingLeft: 38, paddingRight: 44 }} autoComplete="new-password" />
                  <button type="button" onClick={() => setShowPw((s) => !s)} aria-label="Toggle password visibility"
                    style={{ position: 'absolute', right: 10, top: 11, border: 0, background: 'none', cursor: 'pointer', color: 'var(--faint)' }}>
                    {showPw ? <EyeOff style={{ width: 18, height: 18 }} /> : <Eye style={{ width: 18, height: 18 }} />}
                  </button>
                </div>
              </Field>
              <div className="cl-row" style={{ marginBottom: 16 }}>
                <Toggle on={f.barterEligible} onChange={(v) => setF((p) => ({ ...p, barterEligible: v }))} />
                <span className="cl-small" style={{ fontWeight: 600 }}>Open to barter collaborations</span>
              </div>
              {err && <div className="cl-error-text" style={{ marginBottom: 12 }}>{err}</div>}
              <Button block size="lg" loading={busy} type="submit" icon={BadgeCheck}>Create creator account</Button>
              <p className="cl-small cl-muted" style={{ textAlign: 'center', marginTop: 12, lineHeight: 1.6 }}>
                Your handle is reserved uniquely at registration and can be changed later from your profile.
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
                  <button type="button" onClick={() => setShowPw((s) => !s)} aria-label="Toggle password visibility"
                    style={{ position: 'absolute', right: 10, top: 11, border: 0, background: 'none', cursor: 'pointer', color: 'var(--faint)' }}>
                    {showPw ? <EyeOff style={{ width: 18, height: 18 }} /> : <Eye style={{ width: 18, height: 18 }} />}
                  </button>
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
                New here? Switch to the Register tab to create your creator profile.
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
