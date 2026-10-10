/* Business Dashboard — campaign stats + campaign list (bookings are the source of
   truth, bizCampaigns merged as display metadata), booking detail w/ delivery links
   and cancel/reject reasons, post-completion review, profile name/photo edit,
   logout, support/legal entry points. */
import React, { useMemo, useRef, useState } from 'react';
import {
  LayoutDashboard, Wallet as WalletIcon, Gift, Crown, LifeBuoy, FileText,
  ShieldCheck, LogOut, Camera, Pencil, X, ChevronRight, Star, Send,
  ExternalLink, AlertCircle, CheckCircle2, Clock, Flame, CalendarClock,
  MessageCircle,
} from 'lucide-react';
import { useBiz, isBizPro, tsMs } from './ctx.jsx';
import { ensureFirebase, updateDoc, doc, addDoc, collection, getDocs, query, where, serverTimestamp } from '../lib/firebase.js';
import { uploadToGCS, GCS_FOLDERS } from '../lib/cloudinary.js';
import { inr, timeAgo } from '../lib/format.js';
import { BOOKING_STATUS } from '../lib/constants.js';
import BookingChat from '../components/BookingChat.jsx';
import ChatModal, { useChatUnread, UnreadBadge } from '../components/ChatModal.jsx';
import {
  Card, Avatar, Badge, Button, Stat, EmptyState, Sheet, Field, Input,
  TextArea, ConfirmDialog, IconBtn, Page, useToast, DeadlineCountdown,
} from '../components/ui.jsx';

const STATUS_TONE = {
  Pending: 'amber', Active: 'cyan', PendingCompletion: 'cyan',
  Completed: 'green', Cancelled: 'red',
};
const STATUS_ICON = {
  Pending: Clock, Active: Flame, PendingCompletion: CalendarClock,
  Completed: CheckCircle2, Cancelled: X,
};

function statusBadge(status) {
  return <Badge tone={STATUS_TONE[status] || 'grey'} icon={STATUS_ICON[status]}>{status}</Badge>;
}

function BookingDetail({ booking, onClose, onReviewed }) {
  const toast = useToast();
  const { user, biz } = useBiz();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [stars, setStars] = useState(5);
  const [reviewText, setReviewText] = useState('');
  const [sending, setSending] = useState(false);
  const [revisionOpen, setRevisionOpen] = useState(false);
  const [revisionNote, setRevisionNote] = useState('');
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [disputeReason, setDisputeReason] = useState('');
  const [acting, setActing] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const unread = useChatUnread(booking, 'brand');

  async function cancelBooking() {
    if (!cancelReason.trim()) { toast.err('Please give a short reason for cancelling.'); return; }
    setCancelling(true);
    try {
      const { db } = await ensureFirebase();
      await updateDoc(doc(db, 'bookings', booking.id), {
        status: BOOKING_STATUS.CANCELLED,
        cancelledAt: serverTimestamp(),
        cancelledByBiz: true,
        cancelReason: cancelReason.trim(),
        seenByBiz: true,
      });
      toast.ok('Booking cancelled.');
      setCancelOpen(false);
      onClose();
    } catch (err) {
      console.error('[dash] cancel', err);
      toast.err('Could not cancel the booking. Please try again.');
    } finally { setCancelling(false); }
  }

  async function approveDelivery() {
    setActing(true);
    try {
      const { db } = await ensureFirebase();
      await updateDoc(doc(db, 'bookings', booking.id), {
        status: 'Completed',
        approvedAt: serverTimestamp(),
        approvedByBiz: true,
        payoutStatus: 'pending_admin_release',
        updatedAt: serverTimestamp(),
      });
      // Queue payout
      await addDoc(collection(db, 'payoutRequests'), {
        bookingId: booking.id,
        creatorId: booking.creatorId,
        amount: Math.round((booking.creatorPrice || 0) * 0.93),
        status: 'pending',
        createdAt: serverTimestamp(),
        note: 'Brand-approved payout',
      });
      toast.ok('Approved! Payout queued for the creator.');
      onClose();
    } catch (err) {
      toast.err('Could not approve. Please try again.');
    } finally { setActing(false); }
  }

  async function requestRevision() {
    if (!revisionNote.trim()) { toast.err('Please describe what needs to change.'); return; }
    setActing(true);
    try {
      const { db } = await ensureFirebase();
      await updateDoc(doc(db, 'bookings', booking.id), {
        status: 'Active',
        revisionRequested: true,
        revisionNote: revisionNote.trim(),
        revisionCount: (booking.revisionCount || 0) + 1,
        revisionRequestedAt: serverTimestamp(),
        reviewDeadline: null, // reset, will be set on resubmission
        updatedAt: serverTimestamp(),
      });
      toast.ok('Revision requested. The creator has been notified.');
      setRevisionOpen(false);
      setRevisionNote('');
      onClose();
    } catch (err) {
      toast.err('Could not request revision. Please try again.');
    } finally { setActing(false); }
  }

  async function openDispute() {
    if (!disputeReason.trim()) { toast.err('Please describe the issue.'); return; }
    setActing(true);
    try {
      const { db } = await ensureFirebase();
      await updateDoc(doc(db, 'bookings', booking.id), {
        status: 'Disputed',
        disputeReason: disputeReason.trim(),
        disputeOpenedAt: serverTimestamp(),
        disputeOpenedBy: 'brand',
        updatedAt: serverTimestamp(),
      });
      toast.ok('Dispute opened. Our team will review and decide.');
      setDisputeOpen(false);
      setDisputeReason('');
      onClose();
    } catch (err) {
      toast.err('Could not open dispute. Please try again.');
    } finally { setActing(false); }
  }

  async function submitReview() {
    if (!reviewText.trim()) { toast.err('Write a few words about the collaboration.'); return; }
    setSending(true);
    try {
      const { db } = await ensureFirebase();
      await addDoc(collection(db, 'reviews'), {
        creatorId: booking.creatorId,
        stars,
        text: reviewText.trim(),
        bizId: user.uid,
        bizName: biz?.bizName || 'Business',
        bizPfp: biz?.pfp || null,
        createdAt: serverTimestamp(),
      });
      const snap = await getDocs(query(collection(db, 'reviews'), where('creatorId', '==', booking.creatorId)));
      const all = snap.docs.map((d) => d.data());
      const avg = all.reduce((s, r) => s + (Number(r.stars) || 0), 0) / Math.max(1, all.length);
      await updateDoc(doc(db, 'creators', booking.creatorId), { rating: Math.round(avg * 10) / 10 });
      toast.ok('Review published. Thank you.');
      onReviewed?.();
      onClose();
    } catch (err) {
      console.error('[dash] review', err);
      toast.err('Could not publish the review.');
    } finally { setSending(false); }
  }

  const meta = [
    ['Campaign', booking.campaignName], ['Product', booking.productName],
    ['Type', booking.type === 'barter' ? 'Barter' : 'Paid'], ['Package', booking.packageKey],
    ['Platform', booking.platform], ['Deadline', booking.deadline],
    ['Audience', booking.targetAudience], ['Category', booking.category],
    ['Hashtags', booking.hashtags], ['Website', booking.websiteLink],
    ['CTA', booking.cta || booking.couponOrCTA], ['Usage rights', booking.usageRights],
    ['Revisions', booking.revisions], ['Exclusivity', booking.exclusivity],
    ['Contact', booking.contactNumber || booking.contact], ['Shipping', booking.shipping],
  ].filter(([, v]) => v);
  const barterMeta = [
    ['Your offer', booking.barterOffer], ['Offer value', booking.barterOfferValue],
    ['Deliverables', booking.barterDeliverables], ['Product value', booking.productValue],
    ['Barter terms', booking.barterTerms],
  ].filter(([, v]) => v);

  return (
    <Sheet open onClose={onClose} labelledBy="Campaign details">
      <div className="cl-row" style={{ marginBottom: 14 }}>
        <div className="cl-grow">
          <h3 style={{ fontSize: 18 }}>{booking.campaignName || 'Campaign'}</h3>
          <p className="cl-small cl-muted" style={{ marginTop: 2 }}>Booked {timeAgo(booking.createdAt)}</p>
        </div>
        {statusBadge(booking.status)}
      </div>

      <Card style={{ marginBottom: 12 }}>
        <div className="cl-row" style={{ marginBottom: 10 }}>
          <Avatar src={booking.creatorPfp} name={booking.creatorName} size={44} />
          <div className="cl-grow">
            <strong style={{ fontSize: 15 }}>{booking.creatorName}</strong>
            <div className="cl-small cl-muted">@{booking.creatorHandle} · {booking.creatorPlatform}</div>
          </div>
        </div>
        {booking.brief && <p className="cl-small" style={{ lineHeight: 1.65, color: 'var(--ink-2)' }}>{booking.brief}</p>}
        {booking.deliverables && <p className="cl-small cl-muted" style={{ marginTop: 8 }}><strong>Deliverables:</strong> {booking.deliverables}</p>}
        {(booking.mediaFiles || []).length > 0 && (
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            {booking.mediaFiles.map((u, i) => (
              <a key={i} href={u} target="_blank" rel="noreferrer">
                {/\.(mp4|webm|mov)/i.test(u)
                  ? <video src={u} style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 10 }} />
                  : <img src={u} alt="brief media" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 10 }} />}
              </a>
            ))}
          </div>
        )}
      </Card>

      {(booking.driveLink || booking.promotedVideoLink) && (
        <Card style={{ marginBottom: 12, background: 'var(--green-soft)', borderColor: 'transparent' }}>
          <h4 style={{ fontSize: 14, marginBottom: 8, color: 'var(--green)' }}>Delivery received</h4>
          {[booking.driveLink, booking.promotedVideoLink].filter(Boolean).map((l, i) => (
            <a key={i} href={l} target="_blank" rel="noreferrer" className="cl-link cl-row" style={{ gap: 6, marginBottom: 4 }}>
              <ExternalLink style={{ width: 14, height: 14 }} /> {l.slice(0, 48)}{l.length > 48 ? '…' : ''}
            </a>
          ))}
        </Card>
      )}

      {(booking.cancelReason || booking.rejectionReason || booking.adminRejectionReason) && (
        <Card style={{ marginBottom: 12, background: 'var(--red-soft)', borderColor: 'transparent' }}>
          <div className="cl-row" style={{ gap: 8, marginBottom: 6 }}>
            <AlertCircle style={{ width: 16, height: 16, color: 'var(--red)' }} />
            <strong style={{ fontSize: 13.5, color: 'var(--red)' }}>
              {booking.status === 'Cancelled' && booking.rejectedByCreator ? 'Declined by creator' : 'Cancelled'}
            </strong>
          </div>
          <p className="cl-small" style={{ lineHeight: 1.6, color: 'var(--ink-2)' }}>
            {booking.rejectionReason || booking.cancelReason || booking.adminRejectionReason}
          </p>
        </Card>
      )}

      <Card style={{ marginBottom: 12 }}>
        <h4 style={{ fontSize: 14, marginBottom: 8 }}>Details</h4>
        {(booking.type === 'barter' ? barterMeta : meta).map(([k, v]) => (
          <div className="cl-kv" key={k}><dt>{k}</dt><dd>{v}</dd></div>
        ))}
        {booking.requirements && <p className="cl-small cl-muted" style={{ marginTop: 8, lineHeight: 1.6 }}>{booking.requirements}</p>}
      </Card>

      <Card style={{ marginBottom: 16 }}>
        <h4 style={{ fontSize: 14, marginBottom: 8 }}>Payment</h4>
        <div className="cl-kv"><dt>Creator price</dt><dd className="cl-money">{inr(booking.creatorPrice)}</dd></div>
        <div className="cl-kv"><dt>Platform fee</dt><dd className="cl-money">{inr(booking.platformFee)}</dd></div>
        {booking.proDiscount > 0 && <div className="cl-kv"><dt>Pro discount</dt><dd className="cl-money">−{inr(booking.proDiscount)}</dd></div>}
        <div className="cl-kv"><dt><strong>Total</strong></dt><dd className="cl-money">{inr(booking.amount)}</dd></div>
        <div className="cl-kv"><dt>Escrow</dt><dd>{booking.escrowStatus || '—'}</dd></div>
        <div className="cl-kv"><dt>Method</dt><dd style={{ textTransform: 'capitalize' }}>{booking.paymentMethod || '—'}</dd></div>
      </Card>

      <div style={{ position: 'relative', marginBottom: 12 }}>
        <Button block variant="light" icon={MessageCircle} onClick={() => setChatOpen(true)}>
          Chat with Creator
        </Button>
        <UnreadBadge count={unread} />
      </div>
      {chatOpen && (
        <ChatModal
          booking={booking}
          myType="brand"
          peerName={booking.creatorName || 'Creator'}
          peerAvatar={booking.creatorPfp}
          senderName={biz?.bizName || 'Brand'}
          onClose={() => setChatOpen(false)}
        />
      )}

      {booking.status === 'Pending' && (
        <Button variant="danger" block onClick={() => setCancelOpen(true)}>Cancel booking</Button>
      )}

      {booking.status === 'PendingCompletion' && (
        <div style={{ display: 'grid', gap: 10, marginBottom: 12 }}>
          <DeadlineCountdown deadline={booking.reviewDeadline} label="Review window" />
          <Button block size="lg" loading={acting} icon={CheckCircle2} onClick={approveDelivery}
            style={{ background: 'linear-gradient(135deg, #22c55e, #16a34a)', border: 'none' }}>
            Approve & Release Payment
          </Button>
          <div className="cl-row" style={{ gap: 10 }}>
            <div className="cl-grow">
              <Button block variant="light" onClick={() => setRevisionOpen(true)}>Request Revision</Button>
            </div>
            <div className="cl-grow">
              <Button block variant="light" onClick={() => setDisputeOpen(true)}
                style={{ color: 'var(--danger, #dc2626)' }}>Open Dispute</Button>
            </div>
          </div>
          <p className="cl-small cl-muted" style={{ textAlign: 'center', lineHeight: 1.5 }}>
            Auto-approves if you don't act within 72 hours.
          </p>
        </div>
      )}

      {booking.status === 'Completed' && (
        <Card style={{ marginBottom: 12 }}>
          <h4 style={{ fontSize: 14, marginBottom: 10 }}>Rate this collaboration</h4>
          <div className="cl-row" style={{ gap: 4, marginBottom: 10 }}>
            {[1, 2, 3, 4, 5].map((s) => (
              <button key={s} onClick={() => setStars(s)} style={{ background: 'none', border: 0, cursor: 'pointer', padding: 2 }}>
                <Star style={{ width: 24, height: 24, color: s <= stars ? 'var(--amber)' : 'var(--line)', fill: s <= stars ? 'var(--amber)' : 'none' }} />
              </button>
            ))}
          </div>
          <Field><TextArea value={reviewText} onChange={(e) => setReviewText(e.target.value)} placeholder="How was the work, communication and result?" /></Field>
          <Button block loading={sending} icon={Send} onClick={submitReview}>Publish review</Button>
        </Card>
      )}

      <ConfirmDialog
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title="Cancel this booking?"
        body="The creator will be notified. Wallet-paid bookings are refunded to your wallet automatically."
        confirmLabel="Yes, cancel"
        danger
        loading={cancelling}
        onConfirm={cancelBooking}
      />
      <ConfirmDialog
        open={revisionOpen}
        onClose={() => { setRevisionOpen(false); setRevisionNote(''); }}
        title="Request revision"
        body="Describe what needs to change. The creator will be notified and can resubmit."
        confirmLabel="Send revision request"
        loading={acting}
        onConfirm={requestRevision}
      />
      {revisionOpen && (
        <div style={{ marginTop: 12 }}>
          <Field label="What needs to change?">
            <TextArea value={revisionNote} onChange={(e) => setRevisionNote(e.target.value)}
              placeholder="e.g. Please re-shoot the intro, audio is unclear..." />
          </Field>
        </div>
      )}
      <ConfirmDialog
        open={disputeOpen}
        onClose={() => { setDisputeOpen(false); setDisputeReason(''); }}
        title="Open dispute"
        body="Our team will review and make a final decision. This pauses the 72h auto-approve."
        confirmLabel="Open dispute"
        danger
        loading={acting}
        onConfirm={openDispute}
      />
      {disputeOpen && (
        <div style={{ marginTop: 12 }}>
          <Field label="Describe the issue">
            <TextArea value={disputeReason} onChange={(e) => setDisputeReason(e.target.value)}
              placeholder="e.g. Deliverables don't match the brief..." />
          </Field>
        </div>
      )}
      {!cancelOpen && booking.status === 'Pending' && (
        <div style={{ marginTop: 12 }}>
          <Field label="Cancellation reason">
            <Input value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="Brief reason (shown to the creator)" />
          </Field>
        </div>
      )}
    </Sheet>
  );
}

function ProfileCard({ onLogout }) {
  const toast = useToast();
  const { user, biz } = useBiz();
  const [name, setName] = useState(biz?.bizName || '');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);
  const pro = isBizPro(biz);

  async function saveName() {
    if (!name.trim()) { toast.err('Business name cannot be empty.'); return; }
    setSaving(true);
    try {
      const { db } = await ensureFirebase();
      await updateDoc(doc(db, 'businesses', user.uid), { bizName: name.trim(), name: name.trim() });
      setEditing(false);
      toast.ok('Business name updated.');
    } catch (err) {
      console.error('[dash] name', err);
      toast.err('Could not update the name.');
    } finally { setSaving(false); }
  }

  async function onPhoto(e) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setUploading(true);
    try {
      const { url } = await uploadToGCS(f, 'image', GCS_FOLDERS.pfp);
      const { db } = await ensureFirebase();
      await updateDoc(doc(db, 'businesses', user.uid), { pfp: url });
      toast.ok('Profile photo updated.');
    } catch (err) {
      console.error('[dash] pfp', err);
      toast.err('Photo upload failed.');
    } finally { setUploading(false); }
  }

  return (
    <Card style={{ marginBottom: 14 }}>
      <div className="cl-row" style={{ gap: 14 }}>
        <div style={{ position: 'relative' }}>
          <Avatar src={biz?.pfp} name={biz?.bizName} size={64} className="lg" />
          <button
            onClick={() => fileRef.current?.click()}
            aria-label="Change profile photo"
            style={{
              position: 'absolute', right: -2, bottom: -2, width: 26, height: 26, borderRadius: '50%',
              border: '2px solid var(--surface)', background: 'var(--avatar-edit-bg)', color: '#fff', cursor: 'pointer',
              display: 'grid', placeItems: 'center',
            }}
          >
            <Camera style={{ width: 13, height: 13 }} />
          </button>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPhoto} />
        </div>
        <div className="cl-grow" style={{ minWidth: 0 }}>
          {editing ? (
            <div className="cl-row" style={{ gap: 8 }}>
              <Input value={name} onChange={(e) => setName(e.target.value)} style={{ flex: 1 }} />
              <Button size="sm" loading={saving} onClick={saveName}>Save</Button>
              <IconBtn icon={X} label="Cancel edit" onClick={() => { setEditing(false); setName(biz?.bizName || ''); }} />
            </div>
          ) : (
            <div className="cl-row" style={{ gap: 8 }}>
              <strong style={{ fontSize: 16 }}>{biz?.bizName || 'Business'}</strong>
              <IconBtn icon={Pencil} label="Edit name" onClick={() => setEditing(true)} />
            </div>
          )}
          <div className="cl-small cl-muted" style={{ marginTop: 3 }}>{biz?.email}</div>
          <div className="cl-row" style={{ gap: 6, marginTop: 8 }}>
            {pro ? <Badge tone="cyan" icon={Crown}>Pro active</Badge> : <Badge tone="grey">Free plan</Badge>}
            {uploading && <span className="cl-small cl-muted">Uploading photo…</span>}
          </div>
        </div>
      </div>
      <div className="cl-divider" />
      <Button variant="light" block icon={LogOut} onClick={onLogout}>Log out</Button>
    </Card>
  );
}

export default function DashboardPage() {
  const { bookings, bizCampaigns, goPage, onLogout } = useBiz();
  const [openId, setOpenId] = useState(null);
  const [filter, setFilter] = useState('all');

  const merged = useMemo(() => {
    const meta = {};
    (bizCampaigns || []).forEach((c) => { if (c.bookingId) meta[c.bookingId] = c; });
    let list = (bookings || []).map((b) => ({ ...b, ...(meta[b.id] || {}) }));
    list.sort((a, b) => tsMs(b.createdAt) - tsMs(a.createdAt));
    if (filter !== 'all') list = list.filter((b) => b.status === filter);
    return list;
  }, [bookings, bizCampaigns, filter]);

  const stats = useMemo(() => {
    const all = bookings || [];
    const active = all.filter((b) => b.status === 'Active').length;
    const pending = all.filter((b) => b.status === 'Pending').length;
    const completed = all.filter((b) => b.status === 'Completed').length;
    const spend = all.filter((b) => b.status !== 'Cancelled').reduce((s, b) => s + (Number(b.amount) || 0), 0);
    return { active, pending, completed, spend };
  }, [bookings]);

  const detail = openId ? merged.find((b) => b.id === openId) : null;
  const tabs = [
    { key: 'all', label: 'All' },
    { key: 'Pending', label: 'Pending' },
    { key: 'Active', label: 'Active' },
    { key: 'PendingCompletion', label: 'In review' },
    { key: 'Completed', label: 'Done' },
    { key: 'Cancelled', label: 'Cancelled' },
  ];

  return (
    <Page pageKey="dashboard">
      <div className="cl-container" style={{ paddingTop: 16 }}>
        <ProfileCard onLogout={onLogout} />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
          <Stat label="Active campaigns" value={stats.active} icon={Flame} tone="cyan" />
          <Stat label="Pending requests" value={stats.pending} icon={Clock} tone="cyan" />
          <Stat label="Completed" value={stats.completed} icon={CheckCircle2} tone="cyan" />
          <Stat label="Total spend" value={inr(stats.spend)} icon={WalletIcon} tone="cyan" />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
          <Button variant="light" block icon={WalletIcon} onClick={() => goPage('wallet')}>Wallet</Button>
          <Button variant="light" block icon={Gift} onClick={() => goPage('referral')}>Referrals</Button>
          <Button variant="light" block icon={Crown} onClick={() => goPage('pro')}>Pro</Button>
          <Button variant="light" block icon={LifeBuoy} onClick={() => goPage('support')}>Support</Button>
        </div>

        <div className="cl-section-title"><h3>Campaigns</h3></div>
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 12, scrollbarWidth: 'none' }}>
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setFilter(t.key)}
              className={`cl-chip ${filter === t.key ? 'on' : ''}`}
              style={{ cursor: 'pointer', whiteSpace: 'nowrap' }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {merged.length === 0 ? (
          <EmptyState
            icon={LayoutDashboard}
            title={filter === 'all' ? 'No campaigns yet' : `No ${filter} campaigns`}
            body="Discover creators and send your first booking request to get started."
            action={<Button onClick={() => goPage('discover')}>Discover creators</Button>}
          />
        ) : (
          merged.map((b) => (
            <Card key={b.id} pressable onClick={() => setOpenId(b.id)} style={{ marginBottom: 10, position: 'relative' }}>
              {b.lastMessageFrom === 'creator' && (b.lastMessageAt?.toMillis?.() || 0) > (b.brandChatReadAt?.toMillis?.() || 0) && (
                <span style={{
                  position: 'absolute', top: 10, right: 10, width: 12, height: 12, borderRadius: '50%',
                  background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                  border: '2px solid #fff', boxShadow: '0 2px 8px rgba(220,38,38,0.5)',
                  animation: 'cl-pulse-red 1.6s ease-in-out infinite',
                }} />
              )}
              <div className="cl-row" style={{ gap: 12 }}>
                <Avatar src={b.creatorPfp} name={b.creatorName} size={46} />
                <div className="cl-grow" style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {b.campaignName || 'Campaign'}
                  </div>
                  <div className="cl-small cl-muted" style={{ marginTop: 2 }}>
                    {b.creatorName} · {b.type === 'barter' ? 'Barter' : inr(b.amount)}
                    {b.deadline ? ` · due ${b.deadline}` : ''}
                  </div>
                </div>
                {statusBadge(b.status)}
              </div>
            </Card>
          ))
        )}

        <Card style={{ marginTop: 16 }}>
          <div className="cl-row" style={{ gap: 12, cursor: 'pointer' }} onClick={() => goPage('privacy')}>
            <FileText style={{ width: 18, height: 18, color: 'var(--muted)' }} />
            <span className="cl-small" style={{ fontWeight: 600 }}>Privacy Policy</span>
            <div className="cl-grow" />
            <ChevronRight style={{ width: 16, height: 16, color: 'var(--faint)' }} />
          </div>
          <div className="cl-divider" style={{ margin: '12px 0' }} />
          <div className="cl-row" style={{ gap: 12, cursor: 'pointer' }} onClick={() => goPage('terms')}>
            <ShieldCheck style={{ width: 18, height: 18, color: 'var(--muted)' }} />
            <span className="cl-small" style={{ fontWeight: 600 }}>Terms of Service</span>
            <div className="cl-grow" />
            <ChevronRight style={{ width: 16, height: 16, color: 'var(--faint)' }} />
          </div>
        </Card>
      </div>

      {detail && <BookingDetail booking={detail} onClose={() => setOpenId(null)} />}
    </Page>
  );
}
