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
        .collancer-liquid-auth{box-sizing:border-box;width:100%;max-width:390px!important;margin-inline:auto;padding:clamp(12px,3.5vh,24px) 20px 24px!important;min-height:100vh;min-height:100dvh;display:flex;flex-direction:column;justify-content:center;position:relative;isolation:isolate;font-family:-apple-system,BlinkMacSystemFont,'SF Pro Display','SF Pro Text','Inter',system-ui,sans-serif;letter-spacing:-.011em;color:#0b1217}
        .collancer-liquid-auth *{box-sizing:border-box}
        .collancer-liquid-auth:before{content:"";position:fixed;inset:0;pointer-events:none;z-index:-1;background:#fff}
        .collancer-liquid-auth .collancer-brand{margin:0 0 20px!important;padding-top:12px!important;position:relative;text-align:center}
        .collancer-liquid-auth .collancer-brand .cl-brand-icon{width:76px;height:76px;margin:0 auto;border-radius:24px;display:grid;place-items:center;background:linear-gradient(155deg,rgba(255,255,255,.8),rgba(240,248,252,.46));backdrop-filter:blur(28px) saturate(190%);-webkit-backdrop-filter:blur(28px) saturate(190%);border:1px solid rgba(255,255,255,.95);box-shadow:0 0 0 1px rgba(15,40,60,.07),0 28px 50px -26px rgba(15,50,80,.34),0 8px 18px -10px rgba(15,50,80,.14),inset 0 1.5px 1px #fff,inset 0 -2px 6px rgba(14,116,144,.09),inset 0 0 20px rgba(255,255,255,.7)}
        .collancer-liquid-auth .cl-brand-core{width:56px;height:56px;border-radius:17px;background:linear-gradient(180deg,#3a3d44 0,#16181c 46%,#000 100%);border:1px solid #000;box-shadow:0 0 0 1px rgba(255,255,255,.55),0 0 0 2px rgba(0,0,0,.9),inset 0 1.5px 0 rgba(255,255,255,.45);display:grid;place-items:center}
        .collancer-liquid-auth .cl-brand-core svg{width:40px;height:40px}
        .collancer-liquid-auth .collancer-brand h1{font-size:31px!important;line-height:1.15;font-weight:800!important;letter-spacing:-.8px!important;color:#07090c;margin:20px 0 0!important;overflow-wrap:anywhere}
        .collancer-liquid-auth .collancer-brand .cl-small{line-height:1.45}
        .collancer-liquid-auth .collancer-brand .cl-tagline{margin-top:8px;font-size:clamp(9px,2.8vw,11.5px);font-weight:800;letter-spacing:clamp(1px,.55vw,2.6px);color:#0e7490}
        .collancer-liquid-auth .collancer-brand .cl-muted{margin:10px 8px 0!important;font-size:14px;line-height:1.45;color:#55616d}
        .collancer-liquid-auth .collancer-auth-card{width:100%;min-width:0;padding:18px!important;border-radius:30px!important;position:relative;overflow:visible;background:linear-gradient(155deg,rgba(255,255,255,.8),rgba(240,248,252,.46))!important;backdrop-filter:blur(28px) saturate(190%);-webkit-backdrop-filter:blur(28px) saturate(190%);border:1px solid rgba(255,255,255,.95)!important;box-shadow:0 0 0 1px rgba(15,40,60,.07),0 28px 50px -26px rgba(15,50,80,.34),0 8px 18px -10px rgba(15,50,80,.14),inset 0 1.5px 1px #fff,inset 0 -2px 6px rgba(14,116,144,.09),inset 0 0 20px rgba(255,255,255,.7)!important}
        .collancer-liquid-auth .collancer-auth-card:before{content:"";position:absolute;inset:0;border-radius:inherit;padding:1px;pointer-events:none;background:linear-gradient(115deg,rgba(255,255,255,.85) 0,rgba(255,255,255,0) 26%,rgba(34,211,238,.09) 64%,rgba(255,255,255,.5) 100%);mix-blend-mode:soft-light}
        .collancer-liquid-auth .collancer-auth-card:after{content:"";position:absolute;inset:-1px;border-radius:inherit;padding:2.5px;background:linear-gradient(145deg,#fff 0,#dcdcdc 16%,#a9a9a9 40%,#f4f4f4 60%,#bebebe 82%,#e6e6e6 100%);-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask:linear-gradient(#000 0 0) content-box exclude,linear-gradient(#000 0 0);pointer-events:none}
        .collancer-liquid-auth .collancer-auth-card>*{position:relative;z-index:1}
        .collancer-liquid-auth .cl-tabs{display:flex;gap:8px;padding:5px;border-radius:24px;background:linear-gradient(155deg,rgba(255,255,255,.8),rgba(240,248,252,.46));border:1px solid rgba(255,255,255,.95);box-shadow:0 0 0 1px rgba(15,40,60,.07),0 8px 14px -10px rgba(15,50,80,.3),inset 0 1.5px 1px #fff;margin-bottom:18px!important}
        .collancer-liquid-auth .cl-tab{position:relative;flex:1;min-width:0;min-height:44px;padding:10px 6px;border-radius:24px!important;border:1px solid rgba(255,255,255,.95)!important;background:linear-gradient(155deg,rgba(255,255,255,.9),rgba(240,248,252,.55))!important;color:#55616d!important;font-size:15px;font-weight:700!important;box-shadow:0 0 0 1px rgba(15,40,60,.07),0 8px 14px -10px rgba(15,50,80,.3),inset 0 1.5px 1px #fff!important}
        .collancer-liquid-auth .cl-tab.on{color:#fff!important;font-weight:800!important;border:1px solid #000!important;background:linear-gradient(180deg,#3a3d44 0,#16181c 46%,#000 100%)!important;box-shadow:0 0 0 1px rgba(255,255,255,.55),0 0 0 2px rgba(0,0,0,.9),0 10px 16px -8px rgba(0,0,0,.55),inset 0 1.5px 0 rgba(255,255,255,.45),inset 0 -2px 4px rgba(255,255,255,.08)!important}
        .collancer-liquid-auth .cl-field{width:100%;min-width:0;margin:0 0 14px!important}
        .collancer-liquid-auth .cl-label{display:block;font-size:13.5px!important;font-weight:700!important;margin:0 0 8px 2px!important;color:#1c242c!important}
        .collancer-liquid-auth .cl-input{display:block;width:100%;min-width:0;height:52px!important;min-height:52px;padding:0 12px!important;border-radius:12px!important;border:0!important;background:transparent!important;color:#0b1217!important;font:500 15px -apple-system,BlinkMacSystemFont,'SF Pro Display','SF Pro Text','Inter',system-ui,sans-serif!important;box-shadow:none!important;line-height:normal!important;text-align:left!important}
        .collancer-liquid-auth .cl-input::placeholder{color:#7a8794!important;opacity:1;text-align:left!important}
        .collancer-liquid-auth .cl-input:focus{outline:0!important}
        .collancer-liquid-auth .cl-field>div:has(>.cl-input){display:flex;align-items:center;gap:10px;width:100%;min-width:0;min-height:52px;padding:0 12px;border-radius:18px;position:relative;background:linear-gradient(180deg,rgba(228,238,245,.6),rgba(255,255,255,.85));box-shadow:0 0 0 1px rgba(15,40,60,.09),inset 0 2px 4px rgba(15,50,80,.10),inset 0 -1px 1px #fff}
        .collancer-liquid-auth .cl-field>div:has(>.cl-input):after{content:"";position:absolute;inset:-1px;border-radius:inherit;padding:1.5px;background:linear-gradient(145deg,#fff 0,#dcdcdc 16%,#a9a9a9 40%,#f4f4f4 60%,#bebebe 82%,#e6e6e6 100%);-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask:linear-gradient(#000 0 0) content-box exclude,linear-gradient(#000 0 0);pointer-events:none}
        .collancer-liquid-auth .cl-field>div:has(>.cl-input)>svg{flex:none}
        .collancer-liquid-auth .cl-field>div:has(>.cl-input)>.cl-input{flex:1;width:0;min-width:0;padding-left:0!important;padding-right:0!important}
        .collancer-liquid-auth .cl-field>div:has(>.cl-input)>.cl-input[autocomplete="current-password"],.collancer-liquid-auth .cl-field>div:has(>.cl-input)>.cl-input[autocomplete="new-password"]{padding-right:0!important}
        .collancer-liquid-auth .cl-field>div:has(>.cl-input)>.cl-input::placeholder{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .collancer-liquid-auth .cl-btn{width:100%;min-width:0;min-height:52px;padding:10px 14px;border-radius:26px!important;font:700 15px -apple-system,BlinkMacSystemFont,'SF Pro Display','SF Pro Text','Inter',system-ui,sans-serif!important;display:flex;align-items:center;justify-content:center;gap:10px;white-space:normal;transition:transform .3s cubic-bezier(.3,1.5,.5,1)!important}
        .collancer-liquid-auth .cl-btn:hover{transform:translateY(-1px)}
        .collancer-liquid-auth .cl-btn:active{transform:scale(.98)}
        .collancer-liquid-auth .cl-btn-dark{color:#fff!important;border:1px solid #000!important;background:linear-gradient(180deg,#3a3d44 0,#16181c 46%,#000 100%)!important;box-shadow:0 0 0 1px rgba(255,255,255,.55),0 0 0 2px rgba(0,0,0,.9),0 16px 24px -10px rgba(0,0,0,.55),inset 0 1.5px 0 rgba(255,255,255,.45),inset 0 -2px 4px rgba(255,255,255,.08)!important}
        .collancer-liquid-auth .cl-btn-light{position:relative;color:#0b1217!important;border:1px solid rgba(255,255,255,.95)!important;background:linear-gradient(155deg,rgba(255,255,255,.8),rgba(240,248,252,.46))!important;box-shadow:0 0 0 1px rgba(15,40,60,.07),0 8px 14px -10px rgba(15,50,80,.3),inset 0 1.5px 1px #fff!important}
        .collancer-liquid-auth .cl-btn-light:after{content:"";position:absolute;inset:-1px;border-radius:inherit;padding:2px;background:linear-gradient(145deg,#fff 0,#dcdcdc 16%,#a9a9a9 40%,#f4f4f4 60%,#bebebe 82%,#e6e6e6 100%);-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask:linear-gradient(#000 0 0) content-box exclude,linear-gradient(#000 0 0);pointer-events:none}
        .collancer-liquid-auth .cl-row{font-size:13px;font-weight:600;color:#6a7580;flex-wrap:wrap}
        .collancer-liquid-auth .cl-divider{background:linear-gradient(90deg,transparent,rgba(15,40,60,.18))!important;height:1px!important}
        .collancer-liquid-auth .cl-error-text{position:relative;z-index:2;border:1px solid #d7a6ae;border-radius:10px;padding:8px 10px;background:rgba(225,29,72,.07);font-size:12px;overflow-wrap:anywhere}
        .collancer-liquid-auth .cl-btn-label{white-space:normal}
        .collancer-liquid-auth .cl-small{font-size:12px}
        /* Precise text rhythm and alignment across both auth states */
        .collancer-liquid-auth .collancer-brand{width:100%;text-align:center;display:flex;flex-direction:column;align-items:center}
        .collancer-liquid-auth .collancer-brand h1{width:100%;max-width:100%;text-align:center;line-height:1.12!important;text-wrap:balance;letter-spacing:-.7px!important}
        .collancer-liquid-auth .collancer-brand .cl-tagline{display:block;width:100%;margin:8px auto 0!important;line-height:1.5!important;text-align:center;text-wrap:balance}
        .collancer-liquid-auth .collancer-brand .cl-muted{width:100%;max-width:300px;margin:10px auto 0!important;line-height:1.55!important;text-align:center;text-wrap:pretty}
        .collancer-liquid-auth .cl-field{display:flex;flex-direction:column;align-items:stretch;text-align:left}
        .collancer-liquid-auth .cl-field .cl-label{width:100%;line-height:1.35!important;text-align:left;letter-spacing:.01em}
        .collancer-liquid-auth .cl-input{line-height:1.35!important;letter-spacing:0!important}
        .collancer-liquid-auth .cl-row{display:flex;align-items:center;justify-content:center;line-height:1.4;text-align:center}
        .collancer-liquid-auth .cl-row .cl-muted{margin:0!important;line-height:1.3!important;white-space:nowrap}
        .collancer-liquid-auth form>p.cl-small{margin:0 0 14px!important;line-height:1.6!important;text-align:left}
        .collancer-liquid-auth form>p.cl-small.cl-muted{text-align:center;max-width:300px;margin:12px auto 0!important;line-height:1.55!important;text-wrap:pretty}
        .collancer-liquid-auth .cl-btn-label{display:block;max-width:100%;line-height:1.3;text-align:center;text-wrap:balance}
        .collancer-liquid-auth .cl-error-text{line-height:1.45;text-align:left}
        .collancer-liquid-auth>p.cl-muted{display:flex;align-items:center;justify-content:center;gap:5px;width:100%;line-height:1.45!important;text-align:center;margin:14px auto 0!important}
        /* Input icons are absolutely positioned: reserve real space before placeholder text. */
        .collancer-liquid-auth .cl-field>div:has(>.cl-input){display:block!important;padding:0 12px!important;min-height:52px!important}
        .collancer-liquid-auth .cl-field>div:has(>.cl-input)>.cl-input{display:block!important;width:100%!important;min-width:0!important;height:50px!important;min-height:50px!important;padding:0 10px 0 38px!important;margin:0!important;flex:none!important}
        .collancer-liquid-auth .cl-field>div:has(>.cl-input)>.cl-input[autocomplete="current-password"],
        .collancer-liquid-auth .cl-field>div:has(>.cl-input)>.cl-input[autocomplete="new-password"]{padding-right:42px!important}
        .collancer-liquid-auth .cl-field>div:has(>.cl-input)>svg{position:absolute!important;left:13px!important;top:50%!important;transform:translateY(-50%)!important;width:17px!important;height:17px!important;z-index:1}
        .collancer-liquid-auth .cl-field>div:has(>.cl-input)>.cl-input::placeholder{opacity:1!important;text-align:left!important}
        /* Keep the OR label in the true center between equal divider columns. */
        .collancer-liquid-auth form .cl-row:has(>.cl-divider){display:grid!important;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr)!important;align-items:center!important;justify-content:initial!important;gap:12px!important;width:100%!important}
        .collancer-liquid-auth form .cl-row:has(>.cl-divider)>.cl-divider{display:block!important;width:100%!important;min-width:0!important}
        .collancer-liquid-auth form .cl-row:has(>.cl-divider)>span{justify-self:center!important;text-align:center!important}
        /* Center Google label independently, with the Google mark anchored consistently. */
        .collancer-liquid-auth .cl-btn-light:has(svg path[fill="#4285F4"]){position:relative!important;justify-content:center!important;padding-left:48px!important;padding-right:48px!important;gap:0!important}
        .collancer-liquid-auth .cl-btn-light:has(svg path[fill="#4285F4"])>svg{position:absolute!important;left:18px!important;top:50%!important;transform:translateY(-50%)!important;width:17px!important;height:17px!important;flex:none!important}
        .collancer-liquid-auth .cl-btn-light:has(svg path[fill="#4285F4"])>.cl-btn-label{width:100%!important;text-align:center!important}
        @media(max-width:420px){
          .collancer-liquid-auth .cl-field>div:has(>.cl-input){min-height:46px!important}
          .collancer-liquid-auth .cl-field>div:has(>.cl-input)>.cl-input{height:44px!important;min-height:44px!important;padding-left:38px!important}
          .collancer-liquid-auth form .cl-row:has(>.cl-divider){gap:9px!important}
          .collancer-liquid-auth .cl-btn-light:has(svg path[fill="#4285F4"]){padding-left:42px!important;padding-right:42px!important}
          .collancer-liquid-auth .cl-btn-light:has(svg path[fill="#4285F4"])>svg{left:15px!important}
        }
        @media(max-width:420px){.collancer-liquid-auth .collancer-brand .cl-muted{max-width:280px}.collancer-liquid-auth form>p.cl-small.cl-muted{max-width:270px}.collancer-liquid-auth .cl-field .cl-label{margin-bottom:7px!important}.collancer-liquid-auth .cl-row{gap:9px}}
        @media(max-width:420px){.collancer-liquid-auth{padding:12px 14px 20px!important;justify-content:flex-start}.collancer-liquid-auth .collancer-auth-card{padding:14px!important;border-radius:24px!important}.collancer-liquid-auth .collancer-brand{padding-top:8px!important;margin-bottom:14px!important}.collancer-liquid-auth .collancer-brand .cl-brand-icon{width:60px;height:60px;border-radius:20px}.collancer-liquid-auth .cl-brand-core{width:44px;height:44px;border-radius:14px}.collancer-liquid-auth .collancer-brand h1{font-size:clamp(22px,6vw,26px)!important;margin-top:14px!important}.collancer-liquid-auth .collancer-brand .cl-tagline{font-size:clamp(8px,2.5vw,10px);letter-spacing:1.2px}.collancer-liquid-auth .collancer-brand .cl-muted{font-size:12.5px}.collancer-liquid-auth .cl-input{height:46px!important;min-height:46px}.collancer-liquid-auth .cl-field>div:has(>.cl-input){min-height:46px}.collancer-liquid-auth .cl-btn{min-height:46px}}
        @media(max-height:720px){.collancer-liquid-auth{justify-content:flex-start;padding-top:8px!important}.collancer-liquid-auth .collancer-brand{padding-top:4px!important;margin-bottom:10px!important}.collancer-liquid-auth .collancer-brand .cl-brand-icon{width:50px;height:50px}.collancer-liquid-auth .cl-brand-core{width:37px;height:37px}.collancer-liquid-auth .collancer-brand h1{margin-top:8px!important;font-size:22px!important}.collancer-liquid-auth .collancer-brand .cl-muted{margin-top:4px!important}.collancer-liquid-auth .collancer-auth-card{padding:12px!important}.collancer-liquid-auth .cl-field{margin-bottom:9px!important}.collancer-liquid-auth .cl-input{height:42px!important;min-height:42px}.collancer-liquid-auth .cl-field>div:has(>.cl-input){min-height:42px}.collancer-liquid-auth .cl-btn{min-height:42px}}
        @media(prefers-reduced-motion:no-preference){.collancer-liquid-auth .collancer-brand{animation:collancerFloat 7s ease-in-out infinite}.collancer-liquid-auth .collancer-auth-card{animation:collancerRise .55s ease-out both}}
        @keyframes collancerFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}@keyframes collancerRise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
        @media(prefers-reduced-motion:reduce){.collancer-liquid-auth *{animation:none!important;transition:none!important}}
      `}</style>
      <div className="cl-container collancer-liquid-auth" style={{ maxWidth: 390, paddingTop: 0, paddingBottom: 24, width: "100%", marginInline: "auto" }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }} className="cl-fade collancer-brand">
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 0 }}>
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
