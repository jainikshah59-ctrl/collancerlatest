/* Creator earnings — buckets per audit §7.9 + payout requests (§10.6).
   withdrawable = released − requested(non-rejected). Min ₹100, one pending/approved
   at a time, UPI / bank+IFSC validation. */
import React, { useMemo, useState } from 'react';
import { Wallet, ArrowLeft, Landmark, Smartphone, Clock3, CheckCircle2, XCircle, BadgeCheck } from 'lucide-react';
import { ensureFirebase, db, collection, addDoc, serverTimestamp } from '../lib/firebase.js';
import { creatorShareOf, MIN_PAYOUT, BOOKING_STATUS } from '../lib/constants.js';
import { inr, fmtDateTime, timeAgo } from '../lib/format.js';
import {
  Page, TopBar, IconBtn, Card, Button, Badge, Field, Input, Tabs, EmptyState, useToast, Stat,
} from '../components/ui.jsx';

const upiOk = (u) => /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/.test(String(u || '').trim());
const ifscOk = (s) => /^[A-Z]{4}0[A-Z0-9]{6}$/.test(String(s || '').trim().toUpperCase());
const acctOk = (s) => /^\d{9,18}$/.test(String(s || '').trim());

function payoutTone(s) {
  if (s === 'paid') return 'green';
  if (s === 'approved') return 'cyan';
  if (s === 'rejected') return 'red';
  return 'amber';
}

export default function EarningsPage({ creator, bookings, payouts, loading, onBack }) {
  const toast = useToast();
  const [tab, setTab] = useState('overview');
  const [busy, setBusy] = useState(false);
  const [method, setMethod] = useState('upi');
  const [amount, setAmount] = useState('');
  const [upi, setUpi] = useState('');
  const [bank, setBank] = useState('');
  const [ifsc, setIfsc] = useState('');
  const [account, setAccount] = useState('');
  const [err, setErr] = useState('');

  const buckets = useMemo(() => {
    const b = { inProgress: 0, pendingCompletion: 0, locked: 0, released: 0 };
    (bookings || []).forEach((bk) => {
      if (Number(bk.amount || 0) === 0 && bk.paymentStatus === 'not_required') return; // barter
      const share = creatorShareOf(bk);
      if (bk.status === BOOKING_STATUS.ACTIVE) b.inProgress += share;
      else if (bk.status === BOOKING_STATUS.PENDING_COMPLETION) b.pendingCompletion += share;
      else if (bk.status === BOOKING_STATUS.COMPLETED) {
        if (bk.paymentApproved) b.released += share;
        else b.locked += share;
      }
    });
    const requested = (payouts || [])
      .filter((p) => p.status !== 'rejected')
      .reduce((a, p) => a + Number(p.amount || 0), 0);
    return { ...b, requested, withdrawable: Math.max(0, b.released - requested) };
  }, [bookings, payouts]);

  const activeRequest = useMemo(
    () => (payouts || []).find((p) => p.status === 'pending' || p.status === 'approved'),
    [payouts],
  );

  const history = useMemo(
    () => [...(payouts || [])].sort((a, b2) => {
      const x = a.createdAt?.seconds ? a.createdAt.seconds : 0;
      const y = b2.createdAt?.seconds ? b2.createdAt.seconds : 0;
      return y - x;
    }),
    [payouts],
  );

  async function requestPayout(e) {
    e?.preventDefault();
    setErr('');
    const amt = Math.round(Number(amount));
    if (!amt || amt < MIN_PAYOUT) return setErr(`Minimum withdrawal is ${inr(MIN_PAYOUT)}.`);
    if (amt > buckets.withdrawable) return setErr(`You can withdraw up to ${inr(buckets.withdrawable)} right now.`);
    if (activeRequest) return setErr('You already have a payout request in progress.');
    if (method === 'upi' && !upiOk(upi)) return setErr('Enter a valid UPI ID (e.g. name@okhdfcbank).');
    if (method === 'bank') {
      if (!bank.trim()) return setErr('Enter the bank name.');
      if (!acctOk(account)) return setErr('Account number must be 9–18 digits.');
      if (!ifscOk(ifsc)) return setErr('Enter a valid IFSC (e.g. HDFC0001234).');
    }
    setBusy(true);
    try {
      await ensureFirebase();
      await addDoc(collection(db(), 'payoutRequests'), {
        creatorId: creator.id,
        amount: amt,
        method,
        upi: method === 'upi' ? upi.trim() : null,
        bank: method === 'bank' ? bank.trim() : null,
        ifsc: method === 'bank' ? ifsc.trim().toUpperCase() : null,
        account: method === 'bank' ? account.trim() : null,
        status: 'pending',
        createdAt: serverTimestamp(),
      });
      toast.ok('Payout requested. The admin team will process it shortly.');
      setAmount(''); setUpi(''); setBank(''); setIfsc(''); setAccount('');
      setTab('overview');
    } catch (e2) {
      setErr('Could not submit the payout request. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page pageKey="creator-earnings">
      <TopBar title="Earnings" subtitle="95% of every paid booking is yours"
        left={onBack ? <IconBtn icon={ArrowLeft} label="Back" onClick={onBack} /> : null} />
      <div className="cl-container" style={{ paddingTop: 14, paddingBottom: 24, display: 'grid', gap: 14 }}>
        {/* Withdrawable hero */}
        <Card className="cl-glass" style={{ textAlign: 'center', padding: 22 }}>
          <div className="cl-small cl-muted" style={{ fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase' }}>
            Withdrawable balance
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 38, fontWeight: 800, margin: '8px 0 4px' }}>
            {inr(buckets.withdrawable)}
          </div>
          <div className="cl-small cl-muted">
            {inr(buckets.released)} released{buckets.requested > 0 && <> − {inr(buckets.requested)} requested</>}
          </div>
          <Button size="lg" style={{ marginTop: 14 }} disabled={buckets.withdrawable < MIN_PAYOUT || !!activeRequest}
            onClick={() => setTab('withdraw')} icon={Wallet}>
            {activeRequest ? 'Request in progress' : 'Withdraw'}
          </Button>
          {buckets.withdrawable < MIN_PAYOUT && !activeRequest && (
            <div className="cl-small cl-muted" style={{ marginTop: 8 }}>Minimum withdrawal {inr(MIN_PAYOUT)}</div>
          )}
        </Card>

        <Tabs
          tabs={[
            { key: 'overview', label: 'Overview' },
            { key: 'withdraw', label: 'Withdraw' },
            { key: 'history', label: `History${history.length ? ` (${history.length})` : ''}` },
          ]}
          value={tab} onChange={setTab}
        />

        {tab === 'overview' && (
          <div className="cl-fade" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Stat label="In progress" value={inr(buckets.inProgress)} icon={Clock3} tone="cyan" />
            <Stat label="Pending completion" value={inr(buckets.pendingCompletion)} icon={Clock3} />
            <Stat label="Completed — locked" value={inr(buckets.locked)} icon={BadgeCheck} />
            <Stat label="Released" value={inr(buckets.released)} icon={CheckCircle2} tone="cyan" />
            <Card style={{ gridColumn: '1 / -1' }}>
              <div className="cl-small cl-muted" style={{ lineHeight: 1.65 }}>
                Earnings move: <strong>Active</strong> → <strong>Pending completion</strong> (admin review) →
                {' '}<strong>Completed</strong>. Admin approval releases escrow into your withdrawable balance.
                Amounts already requested via payout are subtracted until they are rejected.
              </div>
            </Card>
          </div>
        )}

        {tab === 'withdraw' && (
          <Card className="cl-fade">
            <h3 style={{ fontSize: 16, marginBottom: 4 }}>Request payout</h3>
            <p className="cl-small cl-muted" style={{ marginBottom: 14, lineHeight: 1.6 }}>
              Available: <strong className="cl-money" style={{ color: 'var(--cyan-deep)' }}>{inr(buckets.withdrawable)}</strong>
              {activeRequest && (
                <> · <Badge tone={payoutTone(activeRequest.status)}>{activeRequest.status}</Badge> request of {inr(activeRequest.amount)} is being processed.</>
              )}
            </p>
            <form onSubmit={requestPayout}>
              <Field label={`Amount (min ${inr(MIN_PAYOUT)})`}>
                <Input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="500" inputMode="numeric" />
              </Field>
              <div className="cl-tabs" style={{ marginBottom: 14 }}>
                <button type="button" className={`cl-tab ${method === 'upi' ? 'on' : ''}`} onClick={() => setMethod('upi')}>
                  <Smartphone style={{ width: 14, height: 14 }} /> UPI
                </button>
                <button type="button" className={`cl-tab ${method === 'bank' ? 'on' : ''}`} onClick={() => setMethod('bank')}>
                  <Landmark style={{ width: 14, height: 14 }} /> Bank
                </button>
              </div>
              {method === 'upi' ? (
                <Field label="UPI ID" hint="e.g. yourname@okhdfcbank">
                  <Input value={upi} onChange={(e) => setUpi(e.target.value)} placeholder="name@okhdfcbank" />
                </Field>
              ) : (
                <>
                  <Field label="Bank name"><Input value={bank} onChange={(e) => setBank(e.target.value)} placeholder="HDFC Bank" /></Field>
                  <Field label="Account number"><Input value={account} onChange={(e) => setAccount(e.target.value)} placeholder="9–18 digits" inputMode="numeric" /></Field>
                  <Field label="IFSC" hint="e.g. HDFC0001234">
                    <Input value={ifsc} onChange={(e) => setIfsc(e.target.value.toUpperCase())} placeholder="HDFC0001234" style={{ textTransform: 'uppercase' }} />
                  </Field>
                </>
              )}
              {err && <div className="cl-error-text" style={{ marginBottom: 12 }}>{err}</div>}
              <Button block size="lg" loading={busy} type="submit"
                disabled={buckets.withdrawable < MIN_PAYOUT || !!activeRequest} icon={Wallet}>
                Request {amount && Number(amount) >= MIN_PAYOUT ? inr(Number(amount)) : 'payout'}
              </Button>
            </form>
          </Card>
        )}

        {tab === 'history' && (
          <div className="cl-fade" style={{ display: 'grid', gap: 10 }}>
            {loading ? (
              <Card><div className="cl-small cl-muted">Loading payout history…</div></Card>
            ) : history.length === 0 ? (
              <EmptyState icon={Wallet} title="No payouts yet"
                body="Your withdrawal requests and their status will appear here." />
            ) : history.map((p) => (
              <Card key={p.id} style={{ padding: 14 }}>
                <div className="cl-row" style={{ gap: 10 }}>
                  <div className="cl-grow">
                    <div className="cl-money" style={{ fontSize: 16 }}>{inr(p.amount)}</div>
                    <div className="cl-small cl-muted" style={{ marginTop: 3 }}>
                      {p.method === 'upi' ? `UPI · ${p.upi}` : `Bank · ${p.bank} · ${p.ifsc}`} · {timeAgo(p.createdAt)}
                    </div>
                    {p.status === 'rejected' && p.rejectReason && (
                      <div className="cl-small" style={{ marginTop: 6, color: 'var(--red)' }}>Reason: {p.rejectReason}</div>
                    )}
                    {p.status === 'paid' && p.paidAt && (
                      <div className="cl-small" style={{ marginTop: 6, color: 'var(--green)' }}>Paid {fmtDateTime(p.paidAt)}</div>
                    )}
                  </div>
                  <Badge tone={payoutTone(p.status)}>{p.status}</Badge>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </Page>
  );
}
