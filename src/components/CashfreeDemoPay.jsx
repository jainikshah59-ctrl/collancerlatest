/* Cashfree payment page (shared).
   REAL TEST MODE: when the backend is configured (CASHFREE_APP_ID/SECRET set on
   the server), this creates a real Cashfree sandbox order via /api/cashfree-order
   and opens Cashfree's hosted checkout (JS SDK, modal). Payment is verified
   server-side via /api/cashfree-verify — only order_status === 'PAID' succeeds.
   FALLBACK: if the backend is not configured, the honestly-labeled demo
   simulation is used instead. The secret key never touches the browser. */
import { useEffect, useRef, useState } from 'react';
import {
  X, Smartphone, CreditCard, Landmark, ShieldCheck, Lock,
  CheckCircle2, Loader2, Info, ChevronLeft, BadgeIndianRupee,
  AlertTriangle, ExternalLink,
} from 'lucide-react';
import { Button, Field, Input, Select } from './ui.jsx';
import { inr } from '../lib/format.js';

const TABS = [
  { key: 'upi', label: 'UPI', icon: Smartphone },
  { key: 'card', label: 'Card', icon: CreditCard },
  { key: 'nb', label: 'Netbanking', icon: Landmark },
];

const BANKS = ['HDFC Bank', 'ICICI Bank', 'State Bank of India', 'Axis Bank', 'Kotak Mahindra', 'Punjab National Bank'];
const SDK_URL = 'https://sdk.cashfree.com/js/v3/cashfree.js';

function demoTxnRef() {
  return `CFDEMO_${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function loadSdk() {
  return new Promise((resolve, reject) => {
    if (window.Cashfree) return resolve(window.Cashfree);
    const s = document.createElement('script');
    s.src = SDK_URL;
    s.async = true;
    s.onload = () => (window.Cashfree ? resolve(window.Cashfree) : reject(new Error('SDK missing')));
    s.onerror = () => reject(new Error('SDK load failed'));
    document.head.appendChild(s);
    setTimeout(() => reject(new Error('SDK timeout')), 15000);
  });
}

export default function CashfreeDemoPay({
  open, amount = 0, purpose = 'Payment', orderId, customer,
  onSuccess, onClose,
}) {
  const [tab, setTab] = useState('upi');
  const [upiId, setUpiId] = useState('');
  const [card, setCard] = useState({ num: '', name: '', exp: '', cvv: '' });
  const [bank, setBank] = useState(BANKS[0]);
  // init | demo-form | ready | opening | verifying | success | error
  const [phase, setPhase] = useState('init');
  const [error, setError] = useState('');
  const [txnRef, setTxnRef] = useState('');
  const [order, setOrder] = useState(null); // { payment_session_id, order_id, env }
  const startedRef = useRef(false);

  useEffect(() => {
    if (!open || startedRef.current) return;
    startedRef.current = true;
    setPhase('init');
    setError('');
    (async () => {
      try {
        const r = await fetch('/api/cashfree-order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount,
            purpose,
            customer: {
              id: customer?.id || 'guest',
              email: customer?.email || 'noreply@collancer.in',
              phone: customer?.phone || '',
            },
          }),
        });
        const d = await r.json().catch(() => ({}));
        if (d && d.configured && d.payment_session_id) {
          setOrder({ paymentSessionId: d.payment_session_id, orderId: d.order_id, env: d.env || 'test' });
          setPhase('ready');
        } else {
          setPhase('demo-form'); // backend not configured — honest demo simulation
        }
      } catch {
        setPhase('demo-form');
      }
    })();
  }, [open]);

  if (!open) return null;

  const isTestMode = phase !== 'demo-form' && phase !== 'init';
  const demoMode = phase === 'demo-form';

  const validDemo = () => {
    if (tab === 'upi') return /^[^\s@]+@[^\s@]+$/.test(upiId.trim());
    if (tab === 'card') return card.num.replace(/\s/g, '').length >= 12 && card.name.trim().length > 1;
    return !!bank;
  };

  function payDemo() {
    setError('');
    if (!validDemo()) {
      setError(tab === 'upi' ? 'Enter a valid UPI ID (e.g. name@upi).'
        : tab === 'card' ? 'Enter a valid card number and name.'
        : 'Choose your bank.');
      return;
    }
    setPhase('opening');
    setTimeout(() => {
      const ref = demoTxnRef();
      setTxnRef(ref);
      setPhase('success');
    }, 2200);
  }

  async function payReal() {
    setError('');
    setPhase('opening');
    try {
      const Cashfree = await loadSdk();
      const cashfree = Cashfree({ mode: order.env === 'production' ? 'production' : 'sandbox' });
      const result = await cashfree.checkout({
        paymentSessionId: order.paymentSessionId,
        redirectTarget: '_modal',
      });
      if (result && result.error) throw new Error(result.error.message || 'Checkout failed');
      setPhase('verifying');
      const vr = await fetch('/api/cashfree-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: order.orderId }),
      });
      const vd = await vr.json().catch(() => ({}));
      if (vd && vd.order_status === 'PAID') {
        setTxnRef(order.orderId);
        setPhase('success');
      } else {
        setError(
          vd && vd.order_status === 'ACTIVE'
            ? 'Payment is still pending at Cashfree. If money was debited it will reflect after confirmation — check again in a minute.'
            : 'Payment was not completed. No money was charged.',
        );
        setPhase('error');
      }
    } catch (e) {
      setError(e?.message === 'SDK load failed' || e?.message === 'SDK timeout'
        ? 'Could not load the Cashfree checkout. Check your connection and try again.'
        : 'Checkout could not start. Please try again.');
      setPhase('error');
    }
  }

  function done() {
    onSuccess?.(txnRef, { env: order?.env || 'demo' });
  }

  /* frosted-glass info well, sharp edges */
  const well = {
    background: 'linear-gradient(180deg, var(--glass-hi), var(--glass-lo))',
    border: '1px solid var(--glass-border)',
    boxShadow: '0 0 0 1px var(--glass-edge), inset 0 1px 0 var(--glass-inhi), inset 0 -1px 0 var(--glass-inlo)',
    backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
    borderRadius: 8,
  };

  const banner = demoMode || phase === 'init'
    ? { bg: 'rgba(251,191,36,.12)', border: 'rgba(251,191,36,.35)', color: '#fbbf24', text: '#fde68a',
        label: 'DEMO', msg: 'Demo page — no real money moves. Connect Cashfree to accept live payments.' }
    : { bg: 'rgba(34,211,238,.10)', border: 'rgba(34,211,238,.35)', color: '#22d3ee', text: '#a5f3fc',
        label: 'TEST MODE', msg: 'Cashfree sandbox — test payments only, no real money moves.' };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Cashfree payment"
      className="cl-fade"
      style={{
        position: 'fixed', inset: 0, zIndex: 90,
        background: 'rgba(10,14,20,.55)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'stretch', justifyContent: 'center',
      }}
      onClick={(e) => { if (e.target === e.currentTarget && phase !== 'opening' && phase !== 'verifying') onClose?.(); }}
    >
      <div style={{
        width: '100%', maxWidth: 460, background: 'var(--surface)', margin: 0,
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Gateway header — Cashfree PG style */}
        <div style={{ padding: '14px 18px 12px', borderBottom: '1px solid var(--line-soft)', background: '#0b0b0c', color: '#fff' }}>
          <div className="cl-row" style={{ marginBottom: 8 }}>
            <div className="cl-row" style={{ gap: 8 }}>
              <div style={{
                width: 30, height: 30, borderRadius: 8, background: '#fff',
                display: 'grid', placeItems: 'center',
              }}>
                <BadgeIndianRupee style={{ width: 18, height: 18, color: '#0b0b0c' }} />
              </div>
              <div>
                <div style={{ fontWeight: 800, fontSize: 15, letterSpacing: '.2px' }}>Cashfree <span style={{ fontWeight: 400, color: '#9aa3b2' }}>Payments</span></div>
                <div className="cl-small" style={{ color: '#9aa3b2' }}>Secure payment gateway</div>
              </div>
            </div>
            <div className="cl-grow" />
            <span style={{
              fontSize: 11, fontWeight: 800, letterSpacing: 1.2, color: '#0b0b0c',
              background: demoMode || phase === 'init' ? '#fbbf24' : '#22d3ee',
              borderRadius: 999, padding: '4px 10px',
            }}>{banner.label}</span>
            {phase !== 'opening' && phase !== 'verifying' && (
              <button onClick={onClose} aria-label="Close payment" style={{ background: 'none', border: 0, color: '#9aa3b2', cursor: 'pointer', padding: 4 }}>
                <X style={{ width: 20, height: 20 }} />
              </button>
            )}
          </div>
          <div className="cl-row" style={{ gap: 8, background: banner.bg, border: `1px solid ${banner.border}`, borderRadius: 8, padding: '8px 12px' }}>
            <Info style={{ width: 15, height: 15, color: banner.color, flexShrink: 0 }} />
            <p className="cl-small" style={{ color: banner.text, lineHeight: 1.5 }}>{banner.msg}</p>
          </div>
        </div>

        {phase === 'success' ? (
          <div className="cl-fade" style={{ padding: '36px 24px', textAlign: 'center', overflowY: 'auto' }}>
            <div style={{
              width: 76, height: 76, borderRadius: '50%', margin: '0 auto 16px',
              background: 'var(--green-soft)', display: 'grid', placeItems: 'center',
            }}>
              <CheckCircle2 style={{ width: 38, height: 38, color: 'var(--green)' }} />
            </div>
            <h3 style={{ fontSize: 19, marginBottom: 6 }}>Payment successful</h3>
            <p className="cl-small cl-muted" style={{ marginBottom: 18, lineHeight: 1.6 }}>
              {inr(amount)} paid for {purpose} via Cashfree {isTestMode ? 'sandbox' : 'demo checkout'}.
            </p>
            <div style={{
              ...well, padding: '12px 14px',
              display: 'grid', gap: 6, textAlign: 'left', marginBottom: 22,
            }}>
              <div className="cl-kv"><dt>{isTestMode ? 'Order ID' : 'Transaction ref'}</dt><dd style={{ fontFamily: 'monospace', fontSize: 12.5 }}>{txnRef}</dd></div>
              {!isTestMode && orderId && <div className="cl-kv"><dt>Order ID</dt><dd style={{ fontFamily: 'monospace', fontSize: 12.5 }}>{orderId}</dd></div>}
              <div className="cl-kv"><dt>Amount</dt><dd className="cl-money">{inr(amount)}</dd></div>
            </div>
            <Button block size="lg" onClick={done} icon={CheckCircle2}>Done</Button>
          </div>
        ) : phase === 'init' ? (
          <div style={{ padding: '60px 24px', textAlign: 'center' }}>
            <Loader2 style={{ width: 42, height: 42, color: 'var(--cyan-deep)', margin: '0 auto 16px', animation: 'cl-spin 1s linear infinite' }} />
            <h3 style={{ fontSize: 17, marginBottom: 6 }}>Preparing secure checkout…</h3>
            <p className="cl-small cl-muted">Contacting Cashfree.</p>
          </div>
        ) : phase === 'opening' ? (
          <div style={{ padding: '60px 24px', textAlign: 'center' }}>
            <Loader2 style={{ width: 42, height: 42, color: 'var(--cyan-deep)', margin: '0 auto 16px', animation: 'cl-spin 1s linear infinite' }} />
            <h3 style={{ fontSize: 17, marginBottom: 6 }}>{demoMode ? 'Processing payment…' : 'Opening Cashfree checkout…'}</h3>
            <p className="cl-small cl-muted" style={{ lineHeight: 1.6 }}>
              {demoMode ? <>Talking to the Cashfree demo gateway.<br />Do not press back or refresh.</>
                : <>Complete the payment in the Cashfree window.<br />Do not press back or refresh.</>}
            </p>
          </div>
        ) : phase === 'verifying' ? (
          <div style={{ padding: '60px 24px', textAlign: 'center' }}>
            <Loader2 style={{ width: 42, height: 42, color: 'var(--cyan-deep)', margin: '0 auto 16px', animation: 'cl-spin 1s linear infinite' }} />
            <h3 style={{ fontSize: 17, marginBottom: 6 }}>Verifying payment…</h3>
            <p className="cl-small cl-muted">Confirming with Cashfree servers. This is the step that counts.</p>
          </div>
        ) : phase === 'error' ? (
          <div style={{ padding: '48px 24px', textAlign: 'center' }}>
            <AlertTriangle style={{ width: 42, height: 42, color: 'var(--amber)', margin: '0 auto 16px' }} />
            <h3 style={{ fontSize: 17, marginBottom: 8 }}>Payment not completed</h3>
            <p className="cl-small cl-muted" style={{ lineHeight: 1.6, marginBottom: 20 }}>{error}</p>
            <Button block size="lg" onClick={() => setPhase('ready')}>Try again</Button>
            <button
              onClick={onClose}
              style={{ background: 'none', border: 0, color: 'var(--ink-2)', cursor: 'pointer', margin: '14px auto 0', display: 'flex', alignItems: 'center', gap: 4, fontSize: 13 }}
            >
              <ChevronLeft style={{ width: 15, height: 15 }} /> Back to Collancer
            </button>
          </div>
        ) : phase === 'ready' ? (
          /* REAL TEST MODE — Cashfree hosted checkout */
          <div style={{ overflowY: 'auto', padding: '16px 18px 22px' }}>
            <div style={{ ...well, padding: '12px 14px', marginBottom: 16 }}>
              <div className="cl-kv"><dt>Merchant</dt><dd><strong>Collancer</strong></dd></div>
              <div className="cl-kv"><dt>Purpose</dt><dd>{purpose}</dd></div>
              <div className="cl-kv"><dt>Order ID</dt><dd style={{ fontFamily: 'monospace', fontSize: 12 }}>{order.orderId}</dd></div>
              <div className="cl-divider" />
              <div className="cl-kv"><dt><strong>Amount payable</strong></dt><dd className="cl-money" style={{ fontSize: 18 }}>{inr(amount)}</dd></div>
            </div>
            <Button block size="lg" onClick={payReal} icon={ExternalLink}>
              Continue to Cashfree · {inr(amount)}
            </Button>
            <div className="cl-row" style={{ gap: 6, justifyContent: 'center', marginTop: 12 }}>
              <ShieldCheck style={{ width: 14, height: 14, color: 'var(--green)' }} />
              <span className="cl-small cl-muted">UPI · Cards · Netbanking via Cashfree sandbox</span>
            </div>
            <button
              onClick={onClose}
              style={{ background: 'none', border: 0, color: 'var(--ink-2)', cursor: 'pointer', margin: '14px auto 0', display: 'flex', alignItems: 'center', gap: 4, fontSize: 13 }}
            >
              <ChevronLeft style={{ width: 15, height: 15 }} /> Back to Collancer
            </button>
          </div>
        ) : (
          /* DEMO FALLBACK — simulated checkout */
          <div style={{ overflowY: 'auto', padding: '16px 18px 22px' }}>
            <div style={{ ...well, padding: '12px 14px', marginBottom: 16 }}>
              <div className="cl-kv"><dt>Merchant</dt><dd><strong>Collancer</strong></dd></div>
              <div className="cl-kv"><dt>Purpose</dt><dd>{purpose}</dd></div>
              <div className="cl-kv"><dt>Order ID</dt><dd style={{ fontFamily: 'monospace', fontSize: 12 }}>{orderId || '—'}</dd></div>
              <div className="cl-divider" />
              <div className="cl-kv"><dt><strong>Amount payable</strong></dt><dd className="cl-money" style={{ fontSize: 18 }}>{inr(amount)}</dd></div>
            </div>

            <div className="cl-row" style={{ gap: 8, marginBottom: 14 }}>
              {TABS.map((t) => (
                <button
                  key={t.key}
                  onClick={() => { setTab(t.key); setError(''); }}
                  className="cl-card pressable cl-grow"
                  style={{
                    display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center',
                    padding: '12px 6px', cursor: 'pointer',
                    border: tab === t.key ? '2px solid var(--cyan)' : '1px solid var(--line-soft)',
                  }}
                >
                  <t.icon style={{ width: 20, height: 20, color: tab === t.key ? 'var(--cyan-deep)' : 'var(--ink-2)' }} />
                  <strong style={{ fontSize: 12.5 }}>{t.label}</strong>
                </button>
              ))}
            </div>

            {tab === 'upi' && (
              <Field label="Your UPI ID">
                <Input placeholder="name@upi" value={upiId} onChange={(e) => setUpiId(e.target.value)} autoComplete="off" />
              </Field>
            )}
            {tab === 'card' && (
              <>
                <Field label="Card number">
                  <Input inputMode="numeric" placeholder="4111 1111 1111 1111" value={card.num} onChange={(e) => setCard({ ...card, num: e.target.value })} autoComplete="off" />
                </Field>
                <Field label="Name on card">
                  <Input placeholder="Full name" value={card.name} onChange={(e) => setCard({ ...card, name: e.target.value })} autoComplete="off" />
                </Field>
                <div className="cl-row" style={{ alignItems: 'flex-start' }}>
                  <div className="cl-grow"><Field label="Expiry"><Input placeholder="MM/YY" value={card.exp} onChange={(e) => setCard({ ...card, exp: e.target.value })} autoComplete="off" /></Field></div>
                  <div className="cl-grow"><Field label="CVV"><Input inputMode="numeric" type="password" placeholder="•••" value={card.cvv} onChange={(e) => setCard({ ...card, cvv: e.target.value })} autoComplete="off" /></Field></div>
                </div>
              </>
            )}
            {tab === 'nb' && (
              <Field label="Select your bank">
                <Select value={bank} onChange={(e) => setBank(e.target.value)}>
                  {BANKS.map((b) => <option key={b} value={b}>{b}</option>)}
                </Select>
              </Field>
            )}

            {error && <p className="cl-error-text" style={{ marginBottom: 12 }}>{error}</p>}
            <Button block size="lg" onClick={payDemo} icon={Lock}>
              Pay {inr(amount)}
            </Button>
            <div className="cl-row" style={{ gap: 6, justifyContent: 'center', marginTop: 12 }}>
              <ShieldCheck style={{ width: 14, height: 14, color: 'var(--green)' }} />
              <span className="cl-small cl-muted">256-bit encrypted · PCI-DSS ready (demo simulation)</span>
            </div>
            <button
              onClick={onClose}
              style={{ background: 'none', border: 0, color: 'var(--ink-2)', cursor: 'pointer', margin: '14px auto 0', display: 'flex', alignItems: 'center', gap: 4, fontSize: 13 }}
            >
              <ChevronLeft style={{ width: 15, height: 15 }} /> Back to Collancer
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
