/* Admin deposit queue — walletDeposits where status == pending.
   Admin verifies the UTR externally. Approve → transaction: re-read deposit
   (must still be pending), read business balance, balance+amount, create
   walletTransactions/deposit_{depositId} {type:'deposit', amount, bizId},
   deposit→credited {creditedAt, creditedBy}, bizNotif deposit_credited.
   Reject: reason → rejected + bizNotif deposit_rejected.
   Client can NEVER self-credit — this is the only credit path. */
import { useState } from 'react';
import { Landmark, Check, Ban, Info, Clock3 } from 'lucide-react';
import {
  ensureFirebase, db, auth, doc, collection, where,
  runTransaction, updateDoc, serverTimestamp,
} from '../lib/firebase.js';
import { inr, timeAgo, fmtDateTime } from '../lib/format.js';
import { COLLANCER_UPI_ID } from '../lib/constants.js';
import {
  Button, Card, Badge, Avatar, ConfirmDialog, useToast,
} from '../components/ui.jsx';
import { useQueue, useDoc, QueueShell, ReasonDialog, MetaRows, CountReporter, pushNotif } from './common.jsx';

function DepositCard({ dep }) {
  const toast = useToast();
  const business = useDoc('businesses', dep.bizId);
  const [busy, setBusy] = useState(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [approveOpen, setApproveOpen] = useState(false);

  const adminUid = auth()?.currentUser?.uid;
  const amount = Number(dep.amount || 0);

  const handleApprove = async () => {
    setBusy('approve');
    try {
      await ensureFirebase();
      await runTransaction(db(), async (tx) => {
        const dRef = doc(db(), 'walletDeposits', dep.id);
        const dSnap = await tx.get(dRef);
        if (!dSnap.exists()) throw new Error('Deposit request not found.');
        const d = dSnap.data();
        if (d.status !== 'pending') throw new Error('Deposit was already handled.');
        const bizRef = doc(db(), 'businesses', d.bizId);
        const bizSnap = await tx.get(bizRef);
        if (!bizSnap.exists()) throw new Error('Business not found.');
        const balance = Number(bizSnap.data().walletBalance || 0);
        const amt = Number(d.amount || 0);
        // Single atomic step: credit balance + ledger + mark credited + notify.
        tx.update(bizRef, { walletBalance: balance + amt });
        tx.set(doc(db(), 'walletTransactions', `deposit_${dep.id}`), {
          type: 'deposit',
          amount: amt,
          bizId: d.bizId,
          depositId: dep.id,
          createdAt: serverTimestamp(),
          creditedBy: adminUid || null,
        });
        tx.update(dRef, {
          status: 'credited',
          creditedAt: serverTimestamp(),
          creditedBy: adminUid || null,
        });
        tx.set(doc(collection(db(), 'bizNotifs')), {
          bizId: d.bizId,
          type: 'deposit_credited',
          title: 'Wallet credited',
          body: `Your wallet has been credited with ${inr(amt)}. New balance: ${inr(balance + amt)}.`,
          read: false, createdAt: serverTimestamp(),
        });
      });
      toast.ok(`Credited ${inr(amount)}`);
    } catch (e) { toast.err(e?.message || 'Credit failed'); }
    finally { setBusy(null); setApproveOpen(false); }
  };

  const handleReject = async (reason) => {
    setBusy('reject');
    try {
      await ensureFirebase();
      await updateDoc(doc(db(), 'walletDeposits', dep.id), {
        status: 'rejected',
        rejectReason: reason,
        reviewedAt: serverTimestamp(),
        reviewedBy: adminUid || null,
      });
      await pushNotif('bizNotifs', {
        bizId: dep.bizId,
        type: 'deposit_rejected',
        title: 'Deposit rejected',
        body: `Your deposit request of ${inr(amount)} was rejected. Reason: ${reason}`,
      });
      toast.ok('Deposit rejected');
    } catch (e) { toast.err(e?.message || 'Rejection failed'); }
    finally { setBusy(null); setRejectOpen(false); }
  };

  return (
    <Card>
      <div className="cl-row" style={{ gap: 12, marginBottom: 12 }}>
        <Avatar src={business?.pfp} name={business?.bizName} size={48} />
        <div className="cl-grow" style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700 }}>{business?.bizName || dep.bizName || 'Business'}</div>
          <div className="cl-small cl-muted cl-money" style={{ fontWeight: 700, color: 'var(--ink)' }}>{inr(amount)}</div>
          <div className="cl-small cl-muted cl-row" style={{ gap: 4, marginTop: 2 }}>
            <Clock3 style={{ width: 12, height: 12 }} /> {timeAgo(dep.createdAt)}
          </div>
        </div>
        <Badge tone="amber">pending</Badge>
      </div>

      <MetaRows rows={[
        { label: 'Amount', value: inr(amount) },
        { label: 'Method', value: dep.method || 'UPI' },
        { label: 'Payer UPI ID', value: dep.upiId },
        { label: 'UTR / reference', value: dep.utr },
        { label: 'Current balance', value: inr(business?.walletBalance) },
        { label: 'Requested', value: fmtDateTime(dep.createdAt) },
      ]} />

      <div className="cl-row" style={{ gap: 8, marginTop: 16 }}>
        <Button variant="dark" icon={Check} block loading={busy === 'approve'} onClick={() => setApproveOpen(true)}>
          Approve &amp; Credit
        </Button>
        <Button variant="danger" icon={Ban} block loading={busy === 'reject'} onClick={() => setRejectOpen(true)}>
          Reject
        </Button>
      </div>

      <ConfirmDialog
        open={approveOpen}
        onClose={() => setApproveOpen(false)}
        title="Credit this deposit?"
        body={`This adds ${inr(amount)} to the business wallet in one atomic transaction (balance + deposit ledger + credited flag + notification). Clients can never self-credit — this is the only credit path. Confirm only after you have verified the UTR in your bank/UPI statement.`}
        confirmLabel="Approve & Credit"
        loading={busy === 'approve'}
        onConfirm={handleApprove}
      />
      <ReasonDialog
        open={rejectOpen}
        onClose={() => setRejectOpen(false)}
        title="Reject deposit"
        body="The business will be notified with your reason and can submit a corrected request."
        confirmLabel="Reject deposit"
        loading={busy === 'reject'}
        onSubmit={handleReject}
      />
    </Card>
  );
}

export default function DepositQueue({ onCount }) {
  const { items, loading, error } = useQueue('walletDeposits', where('status', '==', 'pending'));
  const total = items.reduce((s, d) => s + Number(d.amount || 0), 0);

  return (
    <>
      <CountReporter onCount={onCount} n={items.length} />
      <Card style={{ marginBottom: 12, padding: 14, borderColor: 'var(--cyan-line)', background: 'var(--cyan-soft)' }}>
        <div className="cl-row" style={{ gap: 10 }}>
          <Info style={{ width: 18, height: 18, color: 'var(--cyan-deep)', flexShrink: 0 }} />
          <div className="cl-small" style={{ lineHeight: 1.6, color: 'var(--cyan-deep)' }}>
            <b>External verification checklist</b> — before approving: (1) find the UTR in your
            bank/UPI statement, (2) confirm the amount matches exactly, (3) confirm it was paid
            to <b>{COLLANCER_UPI_ID}</b>. Approving is the only path that credits a wallet;
            business clients cannot self-credit.
          </div>
        </div>
      </Card>
      <div className="cl-small cl-muted" style={{ marginBottom: 12 }}>
        {items.length > 0 ? `${items.length} pending · ${inr(total)} awaiting verification` : ''}
      </div>
      <QueueShell
        loading={loading} error={error} items={items}
        emptyIcon={Landmark} emptyTitle="All caught up"
        emptyBody="No pending wallet deposits. New business top-up requests will appear here."
      >
        {items.map((d) => <DepositCard key={d.id} dep={d} />)}
      </QueueShell>
    </>
  );
}
