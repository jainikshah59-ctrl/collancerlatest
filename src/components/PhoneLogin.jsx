/* Phone OTP auth — shared by creator + business auth screens.
   mode="login":  phone -> OTP -> onVerified(user). Parent checks whether a
                  creator/business document exists (login-only, like email).
   mode="signup": name + phone -> OTP -> onVerified(user, { name, phone }).
                  Parent creates the creator/business document. */
import React, { useState } from 'react';
import { Phone, KeyRound, ArrowLeft, RotateCcw, User as UserIcon } from 'lucide-react';
import {
  normalizePhoneNumber, sendPhoneOtp, verifyPhoneOtp, clearPhoneRecaptcha,
} from '../lib/firebase.js';
import { Button, Field, Input } from './ui.jsx';

export default function PhoneLoginForm({ mode = 'login', nameLabel = 'Full name', onVerified, onBack }) {
  const isSignup = mode === 'signup';
  const [step, setStep] = useState('number'); // number | otp
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [confirmRes, setConfirmRes] = useState(null);
  const [e164, setE164] = useState('');

  async function handleSend(e) {
    e?.preventDefault();
    setErr('');
    if (isSignup && name.trim().length < 2) return setErr(`Please enter your ${nameLabel.toLowerCase()}.`);
    const normalized = normalizePhoneNumber(phone);
    if (!normalized) return setErr('Please enter a valid phone number.');
    setBusy(true);
    try {
      const cr = await sendPhoneOtp(normalized);
      setConfirmRes(cr);
      setE164(normalized);
      setStep('otp');
    } catch (e2) {
      const code = String(e2?.code || '');
      if (code.includes('invalid-phone-number')) setErr('Please enter a valid phone number.');
      else if (code.includes('too-many-requests')) setErr('Too many attempts. Please try again later.');
      else setErr('Could not send the OTP. Please check the number and try again.');
    } finally {
      setBusy(false);
    }
  }

  async function handleVerify(e) {
    e?.preventDefault();
    setErr('');
    if (String(otp).trim().length < 6) return setErr('Please enter the 6-digit OTP.');
    if (!confirmRes) return setErr('Please request an OTP first.');
    setBusy(true);
    try {
      const cred = await verifyPhoneOtp(confirmRes, otp);
      clearPhoneRecaptcha();
      onVerified(cred.user, { name: name.trim(), phone: e164 });
    } catch (e2) {
      const code = String(e2?.code || '');
      if (code.includes('invalid-verification-code')) setErr('Incorrect OTP. Please check and try again.');
      else if (code.includes('code-expired')) setErr('This OTP has expired. Please request a new one.');
      else setErr('Verification failed. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  function backToNumber() {
    setErr('');
    setOtp('');
    setConfirmRes(null);
    clearPhoneRecaptcha();
    setStep('number');
  }

  return (
    <div>
      {/* Invisible reCAPTCHA target for Firebase phone auth */}
      <div id="recaptcha-container" />
      {step === 'number' ? (
        <form onSubmit={handleSend}>
          {isSignup && (
            <Field label={nameLabel}>
              <div style={{ position: 'relative' }}>
                <UserIcon style={{ position: 'absolute', left: 13, top: 14, width: 17, height: 17, color: 'var(--faint)' }} />
                <Input value={name} onChange={(e) => setName(e.target.value)}
                  placeholder={nameLabel === 'Business name' ? 'e.g. Acme Foods Pvt. Ltd.' : 'Aarav Sharma'}
                  style={{ paddingLeft: 38 }} autoComplete="name" />
              </div>
            </Field>
          )}
          <Field label="Phone number" hint="We'll send a 6-digit OTP to this number.">
            <div style={{ position: 'relative' }}>
              <Phone style={{ position: 'absolute', left: 13, top: 14, width: 17, height: 17, color: 'var(--faint)' }} />
              <Input value={phone} onChange={(e) => setPhone(e.target.value)}
                placeholder="+91 98765 43210" style={{ paddingLeft: 38 }}
                inputMode="tel" autoComplete="tel" />
            </div>
          </Field>
          {err && <div className="cl-error-text" style={{ marginBottom: 12 }}>{err}</div>}
          <Button block size="lg" loading={busy} type="submit" icon={Phone}>Send OTP</Button>
          <button type="button" onClick={onBack}
            className="cl-small"
            style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '14px auto 0', background: 'none', border: 0, cursor: 'pointer', color: 'var(--muted)', fontWeight: 600 }}>
            <ArrowLeft style={{ width: 14, height: 14 }} /> Back to other {isSignup ? 'signup' : 'login'} options
          </button>
        </form>
      ) : (
        <form onSubmit={handleVerify}>
          <p className="cl-small" style={{ marginBottom: 14, lineHeight: 1.6 }}>
            Enter the 6-digit code sent to <strong>{phone}</strong>.
          </p>
          <Field label="OTP">
            <div style={{ position: 'relative' }}>
              <KeyRound style={{ position: 'absolute', left: 13, top: 14, width: 17, height: 17, color: 'var(--faint)' }} />
              <Input value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="6-digit code" style={{ paddingLeft: 38, letterSpacing: '.2em' }}
                inputMode="numeric" autoComplete="one-time-code" />
            </div>
          </Field>
          {err && <div className="cl-error-text" style={{ marginBottom: 12 }}>{err}</div>}
          <Button block size="lg" loading={busy} type="submit" icon={KeyRound}>
            {isSignup ? 'Verify & create account' : 'Verify & log in'}
          </Button>
          <div className="cl-row" style={{ marginTop: 14, gap: 16, justifyContent: 'center' }}>
            <button type="button" onClick={handleSend} disabled={busy}
              className="cl-small"
              style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 0, cursor: 'pointer', color: 'var(--muted)', fontWeight: 600 }}>
              <RotateCcw style={{ width: 14, height: 14 }} /> Resend OTP
            </button>
            <button type="button" onClick={backToNumber} disabled={busy}
              className="cl-small"
              style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 0, cursor: 'pointer', color: 'var(--muted)', fontWeight: 600 }}>
              <ArrowLeft style={{ width: 14, height: 14 }} /> Change number
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
