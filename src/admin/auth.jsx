/* Admin authentication screen — email/password + admins/{uid} doc gate.
   NO hardcoded UID list (client ADMIN_UIDS = [] per audit). Access is decided
   solely by the existence of the admins/{uid} Firestore document. */
import { useState } from 'react';
import { loginEmail, logout, getDocData } from '../lib/firebase.js';
import {
  Button, Card, Field, Input, Badge, EmptyState, Logo, useToast,
} from '../components/ui.jsx';
import { ShieldCheck, ShieldAlert, Lock, Mail, KeyRound, ArrowLeftRight } from 'lucide-react';

export default function AdminAuthScreen({ accessDenied, onSwitchRole }) {
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const handleLogin = async (e) => {
    e?.preventDefault();
    if (!email.trim() || !password) { setErr('Enter your admin email and password.'); return; }
    setBusy(true); setErr('');
    try {
      const cred = await loginEmail(email.trim(), password);
      const adminDoc = await getDocData('admins', cred.user.uid);
      if (!adminDoc) {
        // Authenticated but not an admin — revoke the session immediately.
        await logout();
        setErr('Access denied. This account is not registered as a Collancer admin.');
        toast.err('Access denied — not an admin account');
        return;
      }
      toast.ok('Welcome back, admin');
      // onAuthStateChanged in AdminApp picks up the verified session.
    } catch (e2) {
      const code = e2?.code || '';
      setErr(
        code === 'auth/user-not-found' || code === 'auth/wrong-password' || code === 'auth/invalid-credential'
          ? 'Invalid email or password.'
          : code === 'auth/too-many-requests'
            ? 'Too many attempts. Please wait and try again.'
            : 'Sign-in failed. Check your connection and try again.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="cl-container" style={{ paddingTop: 56, maxWidth: 440 }}>
      <Card style={{ padding: 24 }}>
        <div className="cl-row" style={{ gap: 12, marginBottom: 8 }}>
          <Logo size={46} radius={14} style={{ flexShrink: 0 }} />
          <div>
            <h2 style={{ fontSize: 20 }}>Admin Console</h2>
            <div className="cl-small cl-muted">Restricted to Collancer administrators</div>
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <Badge tone="cyan" icon={Lock}>admins/&#123;uid&#125; gated</Badge>
        </div>

        {accessDenied && (
          <div className="cl-card" style={{
            borderColor: 'var(--red-line)', background: 'var(--red-soft)',
            padding: 12, marginBottom: 16,
          }}>
            <div className="cl-row" style={{ gap: 8 }}>
              <ShieldAlert style={{ width: 18, height: 18, color: 'var(--red)', flexShrink: 0 }} />
              <div className="cl-small" style={{ color: 'var(--red)', lineHeight: 1.5 }}>
                The last signed-in account is not an admin and was signed out.
              </div>
            </div>
          </div>
        )}

        <form onSubmit={handleLogin}>
          <Field label="Admin email" error={undefined}>
            <div className="cl-search" style={{ marginBottom: 0 }}>
              <Mail />
              <input
                type="email" autoComplete="username" value={email}
                onChange={(e) => setEmail(e.target.value)} placeholder="admin@collancer.in"
              />
            </div>
          </Field>
          <Field label="Password" error={err || undefined}>
            <div className="cl-search" style={{ marginBottom: 0 }}>
              <KeyRound />
              <input
                type="password" autoComplete="current-password" value={password}
                onChange={(e) => setPassword(e.target.value)} placeholder="••••••••"
              />
            </div>
          </Field>
          <Button type="submit" variant="dark" block loading={busy} style={{ marginTop: 8 }}>
            Sign in as admin
          </Button>
        </form>

        <div className="cl-row" style={{ justifyContent: 'center', marginTop: 16 }}>
          <Button variant="ghost" size="sm" icon={ArrowLeftRight} onClick={onSwitchRole}>
            Switch role
          </Button>
        </div>
      </Card>
      <EmptyState
        icon={ShieldCheck}
        title=""
        body="Admin access is granted only when an admins/{uid} document exists for the signed-in account. Nothing is hardcoded on the client."
      />
    </div>
  );
}
