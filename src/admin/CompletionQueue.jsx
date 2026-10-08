/* Admin completion/QC queue — bookings where status == PendingCompletion.
   "Approve & Release": ONE idempotent transaction — re-read booking, abort if
   already released, compute creatorShare = 95% of creatorPrice, set Completed +
   paymentApproved + paymentStatus/escrowStatus 'released' + completedAt,
   create adminRevenue/rev_{bookingId}, creatorNotif payment_approved,
   bizNotif completion_approved.
   "Send Back": status→Active, adminRejected:true, adminRejectionReason, creatorNotif completion_rejected. */
import { useState } from 'react';
import { ExternalLink, PackageCheck, Undo2, LockKeyhole, Clock3 } from 'lucide-react';
import {
  ensureFirebase, db, auth, doc, collection, where,
  runTransaction, serverTimestamp, updateDoc, increment,
} from '../lib/firebase.js';
import { inr, timeAgo } from '../lib/format.js';
import { creatorShareOf } from '../lib/constants.js';
import {
  Button, Card, Badge, Avatar, ConfirmDialog, useToast, Stat,
} from '../components/ui.jsx';
import { useQueue, useDoc, QueueShell, ReasonDialog, MetaRows, CountReporter, pushNotif } from './common.jsx';

function CompletionCard({ booking }) {
  const toast = useToast();
  const creator = useDoc('creators', booking.creatorId);
  const business = useDoc('businesses', booking.bizId);
  const [busy, setBusy] = useState(null);
  const [approveOpen, setApproveOpen] = useState(false);
  const [sendBackOpen, setSendBackOpen] = useState(false);

  const adminUid = auth()?.currentUser?.uid;
  const share = creatorShareOf(booking);
  const gross = Number(booking.amount ?? 0);
  const platformRevenue = gross - share;
  const deliveryLink = booking.promotedVideoLink || booking.driveLink;
  const deliveryNote = booking.deliveryNote || booking.completionNote;

  const handleApprove = async () => {
    setBusy('approve');
    try {
      await ensureFirebase();
      await runTransaction(db(), async (tx) => {
        const bRef = doc(db(), 'bookings', booking.id);
        const snap = await tx.get(bRef);
        if (!snap.exists()) throw new Error('Booking no longer exists.');
        const b = snap.data();
        // Idempotency: already released → no-op.
        if (b.status === 'Completed' || b.paymentApproved) return;
        if (b.status !== 'PendingCompletion') throw new Error('Booking is no longer awaiting completion.');
        const creatorShare = creatorShareOf(b);
        const grossAmount = Number(b.amount ?? 0);
        tx.update(doc(db(), 'creators', b.creatorId), { completedOrders: increment(1), updatedAt: serverTimestamp() });
        tx.update(bRef, {
          status: 'Completed',
          paymentApproved: true,
          paymentStatus: 'released',
          escrowStatus: 'released',
          completedAt: serverTimestamp(),
        });
        tx.set(doc(db(), 'adminRevenue', `rev_${booking.id}`), {
          bookingId: booking.id,
          creatorId: b.creatorId,
          bizId: b.bizId,
          grossAmount,
          creatorShare,
          platformRevenue: grossAmount - creatorShare,
          createdAt: serverTimestamp(),
        });
        tx.set(doc(collection(db(), 'creatorNotifs')), {
          creatorId: b.creatorId,
          bookingId: booking.id,
          type: 'payment_approved',
          title: 'Payment released',
          body: `Your payment of ${inr(creatorShare)} for "${b.campaignName || 'your campaign'}" has been approved and released.`,
          read: false, createdAt: serverTimestamp(),
        });
        tx.set(doc(collection(db(), 'bizNotifs')), {
          bizId: b.bizId,
          bookingId: booking.id,
          type: 'completion_approved',
          title: 'Completion approved',
          body: `The delivery for "${b.campaignName || 'your campaign'}" passed QC and the campaign is now complete.`,
          read: false, createdAt: serverTimestamp(),
        });
      });
      toast.ok('Released — booking completed');
    } catch (e) { toast.err(e?.message || 'Release failed'); }
    finally { setBusy(null); setApproveOpen(false); }
  };

  const handleSendBack = async (reason) => {
    setBusy('sendback');
    try {
      await ensureFirebase();
      await updateDoc(doc(db(), 'bookings', booking.id), {
        status: 'Active',
        adminRejected: true,
        adminRejectionReason: reason,
      });
      await pushNotif('creatorNotifs', {
        creatorId: booking.creatorId,
        bookingId: booking.id,
        type: 'completion_rejected',
        title: 'Delivery sent back',
        body: `Your delivery for "${booking.campaignName || 'your campaign'}" needs changes. Reason: ${reason}`,
      });
      toast.ok('Sent back to creator');
    } catch (e) { toast.err(e?.message || 'Send-back failed'); }
    finally { setBusy(null); setSendBackOpen(false); }
  };

  return (
    <Card>
      <div className="cl-row" style={{ gap: 12, marginBottom: 12 }}>
        <Avatar src={creator?.pfp} name={booking.creatorName || creator?.name} size={48} />
        <div className="cl-grow" style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700 }}>{booking.creatorName || creator?.name || 'Creator'}</div>
          <div className="cl-small cl-muted">
            {(booking.creatorHandle || creator?.handle) ? `@${booking.creatorHandle || creator?.handle} · ` : ''}
            {business?.bizName || booking.bizName || 'Business'}
          </div>
          <div className="cl-small cl-muted cl-row" style={{ gap: 4, marginTop: 2 }}>
            <Clock3 style={{ width: 12, height: 12 }} /> {timeAgo(booking.deliverySubmittedAt || booking.completionRequestedAt || booking.createdAt)}
          </div>
        </div>
        <Badge tone="amber">PendingCompletion</Badge>
      </div>

      <MetaRows rows={[
        { label: 'Campaign', value: booking.campaignName || '—' },
        { label: 'Amount', value: inr(gross) },
        { label: 'Creator share', value: `${inr(share)} (95%)` },
        { label: 'Platform share', value: inr(platformRevenue) },
        { label: 'Platform', value: booking.platform || booking.creatorPlatform },
        { label: 'Delivery link', value: deliveryLink ? (
          <a href={deliveryLink} target="_blank" rel="noreferrer" className="cl-row" style={{ gap: 4, color: 'var(--cyan-deep)', textDecoration: 'none' }}>
            <ExternalLink style={{ width: 14, height: 14 }} /> Open delivery
          </a>) : undefined },
        { label: 'Delivery note', value: deliveryNote },
      ]} />

      <div className="cl-row" style={{ gap: 8, marginTop: 16 }}>
        <Button variant="dark" icon={LockKeyhole} block loading={busy === 'approve'} onClick={() => setApproveOpen(true)}>
          Approve &amp; Release
        </Button>
        <Button variant="ghost" icon={Undo2} block loading={busy === 'sendback'} onClick={() => setSendBackOpen(true)}>
          Send Back
        </Button>
      </div>

      <ConfirmDialog
        open={approveOpen}
        onClose={() => setApproveOpen(false)}
        title="Approve & release payment?"
        body={`This releases ${inr(share)} to the creator (platform keeps ${inr(platformRevenue)}), marks the booking Completed, and writes an idempotent adminRevenue/rev_${booking.id} ledger entry. A booking already released is safely ignored.`}
        confirmLabel="Approve & Release"
        loading={busy === 'approve'}
        onConfirm={handleApprove}
      />
      <ReasonDialog
        open={sendBackOpen}
        onClose={() => setSendBackOpen(false)}
        title="Send delivery back"
        body="The booking returns to Active with adminRejected set. The creator is notified and must resubmit."
        confirmLabel="Send Back"
        loading={busy === 'sendback'}
        onSubmit={handleSendBack}
      />
    </Card>
  );
}

export default function CompletionQueue({ onCount }) {
  const { items, loading, error } = useQueue('bookings', where('status', '==', 'PendingCompletion'));
  const total = items.reduce((s, b) => s + Number(b.amount || 0), 0);
  const payout = items.reduce((s, b) => s + creatorShareOf(b), 0);

  return (
    <>
      <CountReporter onCount={onCount} n={items.length} />
      <div className="cl-row" style={{ gap: 12, marginBottom: 12 }}>
        <div className="cl-grow"><Stat label="Awaiting QC" value={items.length} icon={PackageCheck} tone="cyan" /></div>
        <div className="cl-grow"><Stat label="Creator payouts due" value={inr(payout)} icon={LockKeyhole} /></div>
        <div className="cl-grow"><Stat label="Gross in escrow" value={inr(total)} icon={PackageCheck} /></div>
      </div>
      <QueueShell
        loading={loading} error={error} items={items}
        emptyIcon={PackageCheck} emptyTitle="All caught up"
        emptyBody="No deliveries are waiting for QC. Completed submissions will appear here."
      >
        {items.map((b) => <CompletionCard key={b.id} booking={b} />)}
      </QueueShell>
    </>
  );
}
