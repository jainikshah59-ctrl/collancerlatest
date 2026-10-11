/* Business Wallet — balance, manual UPI top-up flow (amount >= ₹100 -> show
   COLLANCER_UPI_ID -> payer pays externally -> payer UPI ID + 12-digit UTR ->
   walletDeposits/pending; admin credits), deposit request list, and the
   append-only walletTransactions ledger (deposit / booking_deduction / refund). */
import React, { useEffect, useMemo, useState } from 'react';
import {
  Wallet as WalletIcon, Plus, Copy, Check, ArrowDownLeft, ArrowUpRight,
  RotateCcw, Landmark, ChevronRight, AlertCircle, Clock,
} from 'lucide-react';
import { useBiz } from './ctx.jsx';
import {
  ensureFirebase, collection, query, where, orderBy, onSnapshot,
  addDoc, serverTimestamp,
} from '../lib/firebase.js';
import { COLLANCER_UPI_ID, MIN_DEPOSIT } from '../lib/constants.js';
import { inr, timeAgo } from '../lib/format.js';
import {
  Card, Button, Field, Input, Badge, EmptyState, SkeletonCard,
  Sheet, Page, useToast,
} from '../components/ui.jsx';

const UTR_RE = /^\d{12}$/;

function AddMoneySheet({ open, onClose }) {
  const toast = useToast();
  const { user } = useBiz();
  const [step, setStep] = useState(1);
  const [amount, setAmount] = useState('');
  const [payerUpi, setPayerUpi] = useState('');
  const [utr, setUtr] = useState('');
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function reset() {
    setStep(1); setAmount(''); setPayerUpi(''); setUtr('');
    setError(''); setCopied(false);
  }

  function copyUpi() {
    try {
      navigator.clipboard.writeText(COLLANCER_UPI_ID).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      });
    } catch (e) { /* clipboard unavailable */ }
  }

  async function submit() {
    setError('');
    const amt = Math.round(Number(amount));
    if (!amt || amt < MIN_DEPOSIT) { setError(`Minimum top-up is ₹${MIN_DEPOSIT}.`); return; }
    if (!payerUpi.trim()) { setError('Enter the UPI ID you paid from.'); return; }
    if (!UTR_RE.test(utr.trim())) { setError('UTR / reference number must be exactly 12 digits.'); return; }
    setBusy(true);
    try {
      const { db } = await ensureFirebase();
      await addDoc(collection(db, 'walletDeposits'), {
        bizId: user.uid,
        amount: amt,
        method: 'upi',
        upiId: payerUpi.trim(),
        utr: utr.trim(),
        status: 'pending',
        createdAt: serverTimestamp(),
      });
      toast.ok('Deposit request submitted — the admin will verify and credit your wallet.');
      reset();
      onClose();
    } catch (err) {
      console.error('[wallet] deposit', err);
      setError('Could not submit the request. Please try again.');
    } finally { setBusy(false); }
  }

  return (
    <Sheet open={open} onClose={() => { reset(); onClose(); }} labelledBy="Add money">
      <h3 style={{ fontSize: 18, marginBottom: 4 }}>Add money</h3>
      <p className="cl-small cl-muted" style={{ marginBottom: 16, lineHeight: 1.55 }}>
        Manual top-up — you pay from your own UPI app, then share the reference for verification.
      </p>

      {step === 1 && (
        <div className="cl-fade">
          <Field label="Amount (₹)" hint={`Minimum ₹${MIN_DEPOSIT}`}>
            <Input inputMode="numeric" placeholder="e.g. 5000" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            {[1000, 5000, 10000, 25000].map((a) => (
              <button key={a} className="cl-chip" style={{ cursor: 'pointer' }} onClick={() => setAmount(String(a))}>
                ₹{(a / 1000)}K
              </button>
            ))}
          </div>
          {error && <p className="cl-error-text" style={{ marginBottom: 12 }}>{error}</p>}
          <Button block size="lg" onClick={() => {
            const amt = Math.round(Number(amount));
            if (!amt || amt < MIN_DEPOSIT) { setError(`Minimum top-up is ₹${MIN_DEPOSIT}.`); return; }
            setError(''); setStep(2);
          }}>
            Continue <ChevronRight style={{ width: 16, height: 16 }} />
          </Button>
        </div>
      )}

      {step === 2 && (
        <div className="cl-fade">
          <Card style={{ marginBottom: 14, background: 'var(--surface-2)' }}>
            <div className="cl-small cl-muted" style={{ marginBottom: 6 }}>Pay exactly <strong className="cl-money" style={{ color: 'var(--ink)' }}>{inr(Math.round(Number(amount)))}</strong> to</div>
            <div className="cl-row" style={{ gap: 10 }}>
              <code style={{ fontSize: 16, fontWeight: 700, letterSpacing: '.02em' }}>{COLLANCER_UPI_ID}</code>
              <div className="cl-grow" />
              <Button size="sm" variant="light" icon={copied ? Check : Copy} onClick={copyUpi}>
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>
            <p className="cl-small cl-muted" style={{ marginTop: 10, lineHeight: 1.6 }}>
              Open any UPI app (GPay, PhonePe, Paytm), pay the amount above, and note the 12-digit UTR / reference number from the success screen.
            </p>
          </Card>
          <Button block size="lg" onClick={() => setStep(3)}>I've paid — submit reference</Button>
          <div style={{ height: 10 }} />
          <Button variant="ghost" block onClick={() => setStep(1)}>Back</Button>
        </div>
      )}

      {step === 3 && (
        <div className="cl-fade">
          <Field label="UPI ID you paid from">
            <Input placeholder="yourname@upi" value={payerUpi} onChange={(e) => setPayerUpi(e.target.value)} />
          </Field>
          <Field label="12-digit UTR / reference number" hint="Found on your UPI app's payment success screen.">
            <Input inputMode="numeric" maxLength={12} placeholder="e.g. 412987654321" value={utr} onChange={(e) => setUtr(e.target.value.replace(/\D/g, '').slice(0, 12))} />
          </Field>
          {error && <p className="cl-error-text" style={{ marginBottom: 12 }}>{error}</p>}
          <Button block size="lg" loading={busy} onClick={submit}>Submit for verification</Button>
          <div style={{ height: 10 }} />
          <Button variant="ghost" block onClick={() => setStep(2)}>Back</Button>
          <p className="cl-small cl-muted" style={{ textAlign: 'center', marginTop: 12, lineHeight: 1.6 }}>
            Only the Collancer admin can credit your wallet after verifying the payment externally.
          </p>
        </div>
      )}
    </Sheet>
  );
}

const TX_META = {
  deposit: { icon: ArrowDownLeft, color: 'var(--green)', sign: '+' },
  booking_deduction: { icon: ArrowUpRight, color: 'var(--red)', sign: '−' },
  refund: { icon: RotateCcw, color: 'var(--cyan-deep)', sign: '+' },
};
const DEPOSIT_TONE = { pending: 'amber', credited: 'green', rejected: 'red' };

export default function WalletPage() {
  const { user, biz } = useBiz();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [deposits, setDeposits] = useState(null);
  const [txs, setTxs] = useState(null);

  useEffect(() => {
    if (!user) return;
    let u1 = () => {}, u2 = () => {};
    ensureFirebase().then(({ db }) => {
      u1 = onSnapshot(
        query(collection(db, 'walletDeposits'), where('bizId', '==', user.uid), orderBy('createdAt', 'desc')),
        (s) => setDeposits(s.docs.map((d) => ({ id: d.id, ...d.data() }))),
        () => setDeposits([])
      );
      u2 = onSnapshot(
        query(collection(db, 'walletTransactions'), where('bizId', '==', user.uid), orderBy('createdAt', 'desc')),
        (s) => setTxs(s.docs.map((d) => ({ id: d.id, ...d.data() }))),
        () => setTxs([])
      );
    });
    return () => { u1(); u2(); };
  }, [user]);

  const balance = Number(biz?.walletBalance || 0);

  return (
    <Page pageKey="wallet">
      <div className="cl-container" style={{ paddingTop: 16 }}>
        <Card className="cl-fade" style={{
          background: 'linear-gradient(135deg,#0b0b0c 0%,#12333b 100%)',
          border: '1px solid var(--glass-border)', color: '#fff', marginBottom: 14, overflow: 'hidden', position: 'relative',
        }}>
          <div className="cl-row" style={{ gap: 12 }}>
            <div style={{
              width: 46, height: 46, borderRadius: 8, flexShrink: 0,
              background: 'rgba(255,255,255,.1)', border: '1px solid rgba(255,255,255,.18)',
              display: 'grid', placeItems: 'center',
            }}>
              <WalletIcon style={{ width: 22, height: 22, color: '#22d3ee' }} />
            </div>
            <div className="cl-grow">
              <div style={{ fontSize: 12.5, opacity: .7 }}>Wallet balance</div>
              <div className="cl-money" style={{ fontSize: 30, letterSpacing: '-.02em' }}>{inr(balance)}</div>
            </div>
          </div>
          <div style={{ height: 16 }} />
          <Button variant="cyan" block icon={Plus} onClick={() => setSheetOpen(true)}>Add money</Button>
        </Card>

        <div className="cl-section-title"><h3>Deposit requests</h3></div>
        {deposits === null ? <SkeletonCard /> : deposits.length === 0 ? (
          <EmptyState icon={Landmark} title="No deposits yet" body="Top up your wallet to pay creators instantly from your balance." />
        ) : (
          deposits.map((d) => (
            <Card key={d.id} style={{ marginBottom: 10 }}>
              <div className="cl-row">
                <div className="cl-grow">
                  <div className="cl-money" style={{ fontSize: 16 }}>{inr(d.amount)}</div>
                  <div className="cl-small cl-muted" style={{ marginTop: 2 }}>
                    UTR {d.utr || '—'} · {timeAgo(d.createdAt)}
                  </div>
                  {d.status === 'rejected' && d.rejectReason && (
                    <div className="cl-small" style={{ color: 'var(--red)', marginTop: 4 }}>{d.rejectReason}</div>
                  )}
                </div>
                <Badge tone={DEPOSIT_TONE[d.status] || 'grey'} icon={d.status === 'pending' ? Clock : undefined}>
                  {d.status}
                </Badge>
              </div>
            </Card>
          ))
        )}

        <div className="cl-section-title" style={{ marginTop: 20 }}><h3>Transactions</h3></div>
        {txs === null ? <SkeletonCard /> : txs.length === 0 ? (
          <EmptyState icon={AlertCircle} title="No transactions" body="Wallet debits, deposits and refunds will appear here." />
        ) : (
          txs.map((t) => {
            const m = TX_META[t.type] || TX_META.booking_deduction;
            const label = t.type === 'deposit' ? 'Wallet top-up'
              : t.type === 'refund' ? `Refund${t.bookingId ? ` · ${t.bookingId.slice(-6)}` : ''}`
              : `Booking · ${t.creatorName || t.bookingId?.slice(-6) || ''}`;
            return (
              <Card key={t.id} style={{ marginBottom: 10 }}>
                <div className="cl-row" style={{ gap: 12 }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: 8, flexShrink: 0,
                    background: 'var(--surface-2)', display: 'grid', placeItems: 'center', color: m.color,
                  }}>
                    <m.icon style={{ width: 18, height: 18 }} />
                  </div>
                  <div className="cl-grow" style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{label}</div>
                    <div className="cl-small cl-muted">{timeAgo(t.createdAt)}</div>
                  </div>
                  <div className="cl-money" style={{ color: m.color, fontSize: 15 }}>
                    {m.sign}{inr(Math.abs(Number(t.amount) || 0))}
                  </div>
                </div>
              </Card>
            );
          })
        )}
      </div>

      <AddMoneySheet open={sheetOpen} onClose={() => setSheetOpen(false)} />
    </Page>
  );
}
