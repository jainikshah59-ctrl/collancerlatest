/* Admin payout queue — payoutRequests where status in [pending, approved].
   Approve: pending→approved + creatorNotif payout_approved.
   Reject: reason REQUIRED → rejected + creatorNotif payout_rejected.
   Mark Paid: approved→paid + paidAt/paidBy + creatorNotif payout_paid. */
import { useState } from 'react';
import { IndianRupee, Check, Ban, BadgeCheck, Clock3 } from 'lucide-react';
import {
  ensureFirebase, db, auth, doc, where,
  updateDoc, serverTimestamp,
} from '../lib/firebase.js';
import { inr, timeAgo, fmtDateTime } from '../lib/format.js';
import {
  Button, Card, Badge, Avatar, ConfirmDialog, useToast,
} from '../components/ui.jsx';
import { useQueue, useDoc, QueueShell, ReasonDialog, MetaRows, CountReporter, pushNotif } from './common.jsx';

const TONE = { pending: 'amber', approved: 'cyan', paid: 'green', rejected: 'red' };

function PayoutCard({ req }) {
  const toast = useToast();
  const creator = useDoc('creators', req.creatorId);
  const [busy, setBusy] = useState(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [paidOpen, setPaidOpen] = useState(false);

  const adminUid = auth()?.currentUser?.uid;
  const status = req.status || 'pending';

  const baseRef = () => doc(db(), 'payoutRequests', req.id);

  const handleApprove = async () => {
    setBusy('approve');
    try {
      await ensureFirebase();
      await updateDoc(baseRef(), {
        status: 'approved', reviewedAt: serverTimestamp(), reviewedBy: adminUid || null,
      });
      await pushNotif('creatorNotifs', {
        creatorId: req.creatorId, type: 'payout_approved',
        title: 'Payout approved',
        body: `Your payout request of ${inr(req.amount)} has been approved. Payment will be processed shortly.`,
      });
      toast.ok('Payout approved');
    } catch (e) { toast.err(e?.message || 'Approval failed'); }
    finally { setBusy(null); }
  };

  const handleReject = async (reason) => {
    setBusy('reject');
    try {
      await ensureFirebase();
      await updateDoc(baseRef(), {
        status: 'rejected', rejectReason: reason,
        reviewedAt: serverTimestamp(), reviewedBy: adminUid || null,
      });
      await pushNotif('creatorNotifs', {
        creatorId: req.creatorId, type: 'payout_rejected',
        title: 'Payout rejected',
        body: `Your payout request of ${inr(req.amount)} was rejected. Reason: ${reason}`,
      });
      toast.ok('Payout rejected');
    } catch (e) { toast.err(e?.message || 'Rejection failed'); }
    finally { setBusy(null); setRejectOpen(false); }
  };

  const handleMarkPaid = async () => {
    setBusy('paid');
    try {
      await ensureFirebase();
      await updateDoc(baseRef(), {
        status: 'paid', paidAt: serverTimestamp(), paidBy: adminUid || null,
      });
      await pushNotif('creatorNotifs', {
        creatorId: req.creatorId, type: 'payout_paid',
        title: 'Payout paid',
        body: `Your payout of ${inr(req.amount)} has been sent. Please check your ${req.method === 'bank' ? 'bank account' : 'UPI'}.`,
      });
      toast.ok('Marked as paid');
    } catch (e) { toast.err(e?.message || 'Update failed'); }
    finally { setBusy(null); setPaidOpen(false); }
  };

  const method = String(req.method || 'upi').toLowerCase();

  return (
    <Card>
      <div className="cl-row" style={{ gap: 12, marginBottom: 12 }}>
        <Avatar src={creator?.pfp} name={creator?.name} size={48} />
        <div className="cl-grow" style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700 }}>{creator?.name || 'Creator'}</div>
          <div className="cl-small cl-muted">{creator?.handle ? `@${creator.handle} · ` : ''}{inr(req.amount)}</div>
          <div className="cl-small cl-muted cl-row" style={{ gap: 4, marginTop: 2 }}>
            <Clock3 style={{ width: 12, height: 12 }} /> {timeAgo(req.createdAt)}
          </div>
        </div>
        <Badge tone={TONE[status] || 'grey'}>{status}</Badge>
      </div>

      <MetaRows rows={[
        { label: 'Amount', value: inr(req.amount) },
        { label: 'Method', value: method === 'bank' ? 'Bank transfer' : 'UPI' },
        method === 'bank' ? { label: 'Account', value: req.account } : { label: 'UPI ID', value: req.upi },
        method === 'bank' ? { label: 'IFSC', value: req.ifsc } : null,
        method === 'bank' ? { label: 'Bank', value: req.bank } : null,
        { label: 'Requested', value: fmtDateTime(req.createdAt) },
        req.reviewedAt ? { label: 'Reviewed', value: fmtDateTime(req.reviewedAt) } : null,
        req.paidAt ? { label: 'Paid at', value: fmtDateTime(req.paidAt) } : null,
        req.rejectReason ? { label: 'Reject reason', value: req.rejectReason } : null,
      ]} />

      {status === 'pending' && (
        <div className="cl-row" style={{ gap: 8, marginTop: 16 }}>
          <Button variant="dark" icon={Check} block loading={busy === 'approve'} onClick={handleApprove}>
            Approve
          </Button>
          <Button variant="danger" icon={Ban} block loading={busy === 'reject'} onClick={() => setRejectOpen(true)}>
            Reject
          </Button>
        </div>
      )}
      {status === 'approved' && (
        <div style={{ marginTop: 16 }}>
          <div className="cl-small cl-muted" style={{ marginBottom: 8, lineHeight: 1.5 }}>
            Pay {inr(req.amount)} externally to {method === 'bank' ? `${creator?.name || 'the creator'}'s bank account` : (req.upi || 'the creator\'s UPI ID')}, then mark it paid below.
          </div>
          <Button variant="dark" icon={BadgeCheck} block loading={busy === 'paid'} onClick={() => setPaidOpen(true)}>
            Mark Paid
          </Button>
        </div>
      )}

      <ReasonDialog
        open={rejectOpen}
        onClose={() => setRejectOpen(false)}
        title="Reject payout"
        body={`The creator will be notified and can submit a corrected request. A reason is required.`}
        confirmLabel="Reject payout"
        loading={busy === 'reject'}
        onSubmit={handleReject}
      />
      <ConfirmDialog
        open={paidOpen}
        onClose={() => setPaidOpen(false)}
        title="Mark as paid?"
        body={`Confirm you have sent ${inr(req.amount)} to the creator outside Collancer. This cannot be undone.`}
        confirmLabel="Mark Paid"
        loading={busy === 'paid'}
        onConfirm={handleMarkPaid}
      />
    </Card>
  );
}

export default function PayoutQueue({ onCount }) {
  const { items, loading, error } = useQueue(
    'payoutRequests', where('status', 'in', ['pending', 'approved']),
  );

  return (
    <>
      <CountReporter onCount={onCount} n={items.length} />
      <QueueShell
        loading={loading} error={error} items={items}
        emptyIcon={IndianRupee} emptyTitle="All caught up"
        emptyBody="No pending or approved payout requests. Creator withdrawals will appear here."
      >
        {items.map((r) => <PayoutCard key={r.id} req={r} />)}
      </QueueShell>
    </>
  );
}
