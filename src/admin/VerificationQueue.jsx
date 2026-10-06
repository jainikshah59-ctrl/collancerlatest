/* Admin verification queue — verificationRequests where status == pending.
   Approve: tx(request→verified, creators/{uid} verified, creatorNotif verification_approved).
   Reject: reason REQUIRED → tx(request→rejected, creator rejected + reason, creatorNotif verification_rejected). */
import { useState } from 'react';
import { ExternalLink, ShieldCheck, BadgeCheck, Ban, Clock3 } from 'lucide-react';import {
  ensureFirebase, db, auth, doc, collection, where,
  runTransaction, serverTimestamp,
} from '../lib/firebase.js';
import { compact, timeAgo } from '../lib/format.js';
import {
  Button, Card, Badge, Avatar, ConfirmDialog, useToast,
} from '../components/ui.jsx';
import { useQueue, useDoc, QueueShell, ReasonDialog, MetaRows, CountReporter } from './common.jsx';

function VerificationCard({ req }) {
  const toast = useToast();
  const creator = useDoc('creators', req.creatorId || req.id);
  const [busy, setBusy] = useState(null); // 'approve' | 'reject'
  const [rejectOpen, setRejectOpen] = useState(false);
  const [approveOpen, setApproveOpen] = useState(false);

  const adminUid = auth()?.currentUser?.uid;
  const creatorId = req.creatorId || req.id;

  const name = creator?.name || req.name || 'Creator';
  const handle = creator?.handle || req.handle || '';

  const txVerify = async (approved, reason) => {
    await ensureFirebase();
    await runTransaction(db(), async (tx) => {
      const reqRef = doc(db(), 'verificationRequests', req.id);
      const reqSnap = await tx.get(reqRef);
      if (!reqSnap.exists()) throw new Error('Request no longer exists.');
      if (reqSnap.data().status !== 'pending') throw new Error('Request was already handled.');
      const creatorRef = doc(db(), 'creators', creatorId);
      const creatorSnap = await tx.get(creatorRef);
      if (!creatorSnap.exists()) throw new Error('Creator profile not found.');
      const base = {
        reviewedAt: serverTimestamp(),
        reviewedBy: adminUid || null,
      };
      if (approved) {
        tx.update(reqRef, { ...base, status: 'verified' });
        tx.update(creatorRef, { verificationStatus: 'verified', verified: true });
        tx.set(doc(collection(db(), 'creatorNotifs')), {
          creatorId, type: 'verification_approved',
          title: 'Verification approved',
          body: `Congratulations ${name} — your Collancer creator profile is now verified.`,
          read: false, createdAt: serverTimestamp(),
        });
      } else {
        tx.update(reqRef, { ...base, status: 'rejected', rejectReason: reason });
        tx.update(creatorRef, { verificationStatus: 'rejected', rejectReason: reason });
        tx.set(doc(collection(db(), 'creatorNotifs')), {
          creatorId, type: 'verification_rejected',
          title: 'Verification rejected',
          body: `Your verification request was rejected. Reason: ${reason}`,
          read: false, createdAt: serverTimestamp(),
        });
      }
    });
  };

  const handleApprove = async () => {
    setBusy('approve');
    try {
      await txVerify(true);
      toast.ok('Creator verified');
    } catch (e) { toast.err(e?.message || 'Approval failed'); }
    finally { setBusy(null); setApproveOpen(false); }
  };

  const handleReject = async (reason) => {
    setBusy('reject');
    try {
      await txVerify(false, reason);
      toast.ok('Request rejected');
    } catch (e) { toast.err(e?.message || 'Rejection failed'); }
    finally { setBusy(null); setRejectOpen(false); }
  };

  const submitted = [
    { label: 'Platform', value: req.platform || creator?.platform },
    { label: 'Followers', value: (req.followers ?? creator?.followers) != null ? compact(req.followers ?? creator?.followers) : undefined },
    { label: 'Niche', value: req.niche || creator?.niche },
    { label: 'City', value: req.city || creator?.city },
    { label: 'Profile URL', value: (req.profileUrl || req.profileURL) ? (
      <a href={req.profileUrl || req.profileURL} target="_blank" rel="noreferrer" className="cl-row" style={{ gap: 4, color: 'var(--cyan-deep)', textDecoration: 'none' }}>
        <ExternalLink style={{ width: 14, height: 14 }} /> Open profile
      </a>) : undefined },
    { label: 'WhatsApp', value: req.whatsapp || creator?.whatsapp },
    { label: 'Submitted', value: timeAgo(req.createdAt) },
  ];

  const extraFields = Object.entries(req)
    .filter(([k, v]) => !['id','creatorId','name','handle','platform','followers','niche','city','profileUrl','profileURL','whatsapp','status','createdAt','reviewedAt','reviewedBy','rejectReason','previousRejectReason'].includes(k))
    .filter(([, v]) => v !== undefined && v !== null && v !== '' && typeof v !== 'object');

  return (
    <Card>
      <div className="cl-row" style={{ gap: 12, marginBottom: 12 }}>
        <Avatar src={creator?.pfp} name={name} size={48} />
        <div className="cl-grow" style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700 }}>{name}</div>
          {handle && <div className="cl-small cl-muted">@{handle}</div>}
          <div className="cl-small cl-muted cl-row" style={{ gap: 4, marginTop: 2 }}>
            <Clock3 style={{ width: 12, height: 12 }} /> {timeAgo(req.createdAt)}
          </div>
        </div>
        <Badge tone="amber">pending</Badge>
      </div>

      {req.previousRejectReason && (
        <div style={{
          border: '1px solid var(--amber-line)', background: 'var(--amber-soft)',
          borderRadius: 8, padding: '10px 12px', marginBottom: 12,
        }}>
          <div className="cl-small" style={{ fontWeight: 700, color: 'var(--amber-deep)', marginBottom: 2 }}>Previously rejected</div>
          <div className="cl-small" style={{ color: 'var(--amber-deep)', lineHeight: 1.5 }}>{req.previousRejectReason}</div>
        </div>
      )}

      <MetaRows rows={submitted} />

      {extraFields.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div className="cl-small cl-muted" style={{ marginBottom: 6, fontWeight: 700 }}>Submitted data</div>
          <MetaRows rows={extraFields.map(([k, v]) => ({ label: k, value: String(v) }))} />
        </div>
      )}

      <div className="cl-row" style={{ gap: 8, marginTop: 16 }}>
        <Button variant="dark" icon={BadgeCheck} block loading={busy === 'approve'} onClick={() => setApproveOpen(true)}>
          Approve
        </Button>
        <Button variant="danger" icon={Ban} block loading={busy === 'reject'} onClick={() => setRejectOpen(true)}>
          Reject
        </Button>
      </div>

      <ConfirmDialog
        open={approveOpen}
        onClose={() => setApproveOpen(false)}
        title="Approve verification?"
        body={`This will mark ${name} as verified on Collancer and notify them. This action is recorded with your admin ID.`}
        confirmLabel="Approve"
        loading={busy === 'approve'}
        onConfirm={handleApprove}
      />
      <ReasonDialog
        open={rejectOpen}
        onClose={() => setRejectOpen(false)}
        title="Reject verification"
        body={`Tell ${name} exactly what to fix before resubmitting. The reason is required and stored on both the request and the creator record.`}
        confirmLabel="Reject request"
        loading={busy === 'reject'}
        onSubmit={handleReject}
      />
    </Card>
  );
}

export default function VerificationQueue({ onCount }) {
  const { items, loading, error } = useQueue('verificationRequests', where('status', '==', 'pending'));

  return (
    <>
      <CountReporter onCount={onCount} n={items.length} />
      <QueueShell
        loading={loading} error={error} items={items}
        emptyIcon={ShieldCheck} emptyTitle="All caught up"
        emptyBody="No pending verification requests. New creator submissions will appear here."
      >
        {items.map((r) => <VerificationCard key={r.id} req={r} />)}
      </QueueShell>
    </>
  );
}
