/* Booking detail modal — creator accept / reject / delivery submission.
   Per audit §7.7 + §10: accept writes Active (+ barter address share), reject writes
   Cancelled (+ transactional exact-escrow wallet refund for wallet-paid, marketplace
   reopen), delivery link -> PendingCompletion, resubmit after admin rejection. */
import React, { useMemo, useState } from 'react';
import {
  CheckCircle2, XCircle, Send, Link2, ExternalLink, MapPin, Wallet,
  ShieldCheck, AlertCircle, RefreshCw, FileText, CalendarClock, Tag,
  MessageCircle, Share2, Truck, Receipt, CreditCard, Package, Box,
} from 'lucide-react';
import {
  ensureFirebase, db, doc, updateDoc, addDoc, collection,
  runTransaction, serverTimestamp, increment,
} from '../lib/firebase.js';
import { inr, fmtDate, fmtDateTime, timeAgo } from '../lib/format.js';
import { creatorShareOf, promoLabel, BOOKING_STATUS } from '../lib/constants.js';
import {
  Modal, Card, Button, Badge, Field, Input, TextArea, useToast,
} from '../components/ui.jsx';
import { statusTone, statusLabel } from './BookingsPage.jsx';
import BookingChat from '../components/BookingChat.jsx';
import ChatModal, { useChatUnread, UnreadBadge } from '../components/ChatModal.jsx';

const urlOk = (u) => /^https?:\/\/.+\..+/.test(String(u || '').trim());

/** Local link preview chip (audit: LinkPreviewChip / detectDeliverableLink logic). */
function LinkPreviewChip({ url }) {
  const u = String(url || '').trim();
  if (!urlOk(u)) return null;
  let domain = '';
  try { domain = new URL(u).hostname.replace(/^www\./, ''); } catch (e) { domain = u; }
  return (
    <a href={u} target="_blank" rel="noreferrer"
      style={{ textDecoration: 'none', display: 'block', marginTop: 10 }}>
      <div className="cl-row cl-fade" style={{
        gap: 10, padding: '10px 12px', borderRadius: 'var(--r-sm)',
        background: 'var(--cyan-soft)',
      }}>
        <Link2 style={{ width: 16, height: 16, color: 'var(--cyan-deep)', flexShrink: 0 }} />
        <div className="cl-grow" style={{ minWidth: 0 }}>
          <div className="cl-small" style={{ fontWeight: 700, color: 'var(--cyan-deep)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {domain}
          </div>
          <div className="cl-small cl-muted" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {u.length > 48 ? u.slice(0, 48) + '…' : u}
          </div>
        </div>
        <ExternalLink style={{ width: 16, height: 16, color: 'var(--cyan-deep)', flexShrink: 0 }} />
      </div>
    </a>
  );
}

function Row({ icon: Icon, label, value, long }) {
  if (long) {
    /* Prose content (brief, deliverables, usage rights): stacked label-above-value,
       not the narrow right-aligned cl-kv treatment meant for short key-values. */
    return (
      <div style={{ padding: '9px 0' }}>
        <div className="cl-row" style={{ gap: 7, marginBottom: 4 }}>
          {Icon && <Icon style={{ width: 14, height: 14, color: 'var(--muted)', flexShrink: 0 }} />}
          <dt style={{ fontSize: 13.5, color: 'var(--muted)', fontWeight: 600 }}>{label}</dt>
        </div>
        <dd style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6, overflowWrap: 'anywhere' }}>{value}</dd>
      </div>
    );
  }
  return (
    <div className="cl-kv">
      <dt><span className="cl-row cl-row-nowrap" style={{ gap: 7 }}>{Icon && <Icon style={{ width: 14, height: 14 }} />}{label}</span></dt>
      <dd style={{ maxWidth: '60%', overflowWrap: 'anywhere' }}>{value}</dd>
    </div>
  );
}

/** Best-effort business notification (non-blocking). */
async function notifyBiz(bizId, type, title, body, bookingId) {
  if (!bizId) return;
  try {
    await addDoc(collection(db(), 'bizNotifs'), {
      bizId, type, title, body, bookingId: bookingId || null,
      read: false, createdAt: serverTimestamp(),
    });
  } catch (e) { /* notifications must never block the core flow */ }
}

export default function BookingDetailModal({ booking, creator, onClose, onChanged }) {
  const toast = useToast();
  const [busy, setBusy] = useState(null); // 'accept' | 'reject' | 'deliver'
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [deliveryUrl, setDeliveryUrl] = useState('');
  const [showDeliver, setShowDeliver] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const unread = useChatUnread(booking, 'creator');

  const b = booking;
  const isBarter = useMemo(
    () => b && (Number(b.amount || 0) === 0 || b.paymentStatus === 'not_required'),
    [b],
  );
  const isWalletPaid = useMemo(
    () => b && (b.paymentMethod === 'wallet' || b.paymentStatus === 'escrow_held') && Number(b.amount || 0) > 0,
    [b],
  );
  const isPersonalAd = useMemo(
    () => b && (b.promotionCategory === 'personalad' || b.packageKey === 'personalad'),
    [b],
  );
  if (!b) return null;

  async function doAccept() {
    if (isBarter && !(creator?.address && creator.address.trim())) {
      toast.err('Add your shipping address in Profile > Account before accepting a barter booking.');
      return;
    }
    setBusy('accept');
    try {
      await ensureFirebase();
      const upd = {
        status: BOOKING_STATUS.ACTIVE,
        acceptedAt: serverTimestamp(),
        acceptedByCreator: true,
        seenByCreator: true,
      };
      if (isBarter) {
        upd.creatorAddress = creator.address.trim();
        upd.addressSharedAt = serverTimestamp();
        upd.addressSharedTo = b.bizId;
      }
      await updateDoc(doc(db(), 'bookings', b.id), upd);
      notifyBiz(b.bizId, 'booking_accepted', 'Booking accepted',
        `${creator?.handle ? '@' + creator.handle : creator?.name} accepted your collaboration request.`, b.id);
      toast.ok(isBarter ? 'Accepted — your shipping address was shared with the brand.' : 'Booking accepted. Time to create.');
      onChanged?.();
    } catch (e) {
      toast.err('Could not accept the booking. Please try again.');
    } finally {
      setBusy(null);
    }
  }

  async function doReject() {
    if (reason.trim().length < 5) {
      toast.err('Please give a short reason for rejecting.');
      return;
    }
    setBusy('reject');
    try {
      await ensureFirebase();
      const escrow = Number(b.escrowAmount ?? b.amount ?? 0);
      if (isWalletPaid && escrow > 0) {
        // Transactional exact-escrow refund (audit §10.4): wallet credit + refund_{bookingId}
        // ledger + booking refund fields, plus marketplace reopen when applicable.
        try {
          await runTransaction(db(), async (tx) => {
            const bRef = doc(db(), 'bookings', b.id);
            const bSnap = await tx.get(bRef);
            if (!bSnap.exists()) throw new Error('missing');
            const bizRef = doc(db(), 'businesses', b.bizId);
            const bizSnap = await tx.get(bizRef);
            if (!bizSnap.exists()) throw new Error('nobiz');
            tx.update(bizRef, { walletBalance: increment(escrow) });
            tx.set(doc(db(), 'walletTransactions', `refund_${b.id}`), {
              type: 'refund', bizId: b.bizId, creatorId: b.creatorId, bookingId: b.id,
              amount: escrow, createdAt: serverTimestamp(),
            });
            if (b.fromMarketplace && b.requirementId) {
              tx.update(doc(db(), 'requirements', b.requirementId), {
                status: 'open', acceptedOfferId: null, matchedAt: null, updatedAt: serverTimestamp(),
              });
            }
            if (b.offerId) {
              tx.update(doc(db(), 'requirementOffers', b.offerId), { status: 'pending', updatedAt: serverTimestamp() });
            }
            tx.update(bRef, {
              status: BOOKING_STATUS.CANCELLED,
              rejectedAt: serverTimestamp(),
              rejectedByCreator: true,
              rejectionReason: reason.trim(),
              refundProcessed: true,
              refundAmount: escrow,
              refundStatus: 'refunded',
              refundedAt: serverTimestamp(),
            });
          });
          toast.ok(`Rejected. ${inr(escrow)} refunded to the brand wallet.`);
        } catch (txErr) {
          // Refund failed — cancel anyway and flag for manual review (audit §6.4).
          await updateDoc(doc(db(), 'bookings', b.id), {
            status: BOOKING_STATUS.CANCELLED,
            rejectedAt: serverTimestamp(),
            rejectedByCreator: true,
            rejectionReason: reason.trim(),
            refundProcessed: false,
            refundStatus: 'manual_review_needed',
          });
          toast.err('Booking cancelled, but the automatic refund failed — flagged for manual review.');
        }
      } else {
        // Non-wallet / barter rejection (with marketplace reopen when applicable).
        if (b.fromMarketplace && (b.requirementId || b.offerId)) {
          try {
            await runTransaction(db(), async (tx) => {
              if (b.requirementId) {
                tx.update(doc(db(), 'requirements', b.requirementId), {
                  status: 'open', acceptedOfferId: null, matchedAt: null, updatedAt: serverTimestamp(),
                });
              }
              if (b.offerId) {
                tx.update(doc(db(), 'requirementOffers', b.offerId), { status: 'pending', updatedAt: serverTimestamp() });
              }
              tx.update(doc(db(), 'bookings', b.id), {
                status: BOOKING_STATUS.CANCELLED,
                rejectedAt: serverTimestamp(),
                rejectedByCreator: true,
                rejectionReason: reason.trim(),
              });
            });
          } catch (e2) {
            await updateDoc(doc(db(), 'bookings', b.id), {
              status: BOOKING_STATUS.CANCELLED,
              rejectedAt: serverTimestamp(),
              rejectedByCreator: true,
              rejectionReason: reason.trim(),
            });
          }
        } else {
          await updateDoc(doc(db(), 'bookings', b.id), {
            status: BOOKING_STATUS.CANCELLED,
            rejectedAt: serverTimestamp(),
            rejectedByCreator: true,
            rejectionReason: reason.trim(),
          });
        }
        toast.ok(b.fromMarketplace ? 'Rejected — the marketplace brief was reopened.' : 'Booking rejected.');
      }
      notifyBiz(b.bizId, 'booking_rejected', 'Booking rejected',
        `${creator?.handle ? '@' + creator.handle : creator?.name} rejected the request. Reason: ${reason.trim()}`, b.id);
      setRejectOpen(false);
      setReason('');
      onChanged?.();
    } catch (e) {
      toast.err('Could not reject the booking. Please try again.');
    } finally {
      setBusy(null);
    }
  }

  async function doDeliver() {
    const url = deliveryUrl.trim();
    if (!urlOk(url)) {
      toast.err('Please paste a valid delivery link (https://…).');
      return;
    }
    setBusy('deliver');
    try {
      await ensureFirebase();
      await updateDoc(doc(db(), 'bookings', b.id), {
        status: BOOKING_STATUS.PENDING_COMPLETION,
        driveLink: url,
        promotedVideoLink: url,
        deliverySubmittedAt: serverTimestamp(),
        completionRequestedAt: serverTimestamp(),
        adminRejected: false,
        adminRejectionReason: null,
        // 72h brand review window (Collabstr model) — auto-approve if lapsed
        reviewDeadline: new Date(Date.now() + 72 * 3600 * 1000),
      });
      notifyBiz(b.bizId, 'drive_link_shared', isPersonalAd ? 'Ad video delivered' : 'Delivery submitted',
        `${creator?.handle ? '@' + creator.handle : creator?.name} submitted the delivery link for review.`, b.id);
      toast.ok(b.adminRejected ? 'Resubmitted for admin review.' : 'Delivery submitted for admin review.');
      setShowDeliver(false);
      setDeliveryUrl('');
      onChanged?.();
    } catch (e) {
      toast.err('Could not submit the delivery link. Please try again.');
    } finally {
      setBusy(null);
    }
  }

  const canAct = b.status === BOOKING_STATUS.PENDING;
  const canDeliver = b.status === BOOKING_STATUS.ACTIVE || (b.status === BOOKING_STATUS.PENDING_COMPLETION && b.adminRejected);

  return (
    <Modal open wide onClose={onClose}>
      <div className="cl-row cl-row-nowrap" style={{ marginBottom: 4 }}>
        <div className="cl-grow" style={{ minWidth: 0 }}>
          <h3 className="cl-card-title" style={{ fontSize: 'var(--fs-xl)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.campaignName || b.productName || 'Collaboration'}</h3>
          <div className="cl-small cl-muted" style={{ marginTop: 3 }}>
            {b.bizName || 'Brand'}{b.fromMarketplace ? ' · via Marketplace' : ''} · requested {timeAgo(b.createdAt)}
          </div>
        </div>
        <Badge tone={statusTone(b.status)}>{statusLabel(b.status)}</Badge>
      </div>

      {/* Campaign brief */}
      <div className="cl-section-title" style={{ marginTop: 16 }}><h3>Brief</h3></div>
      <Card style={{ padding: 12 }}>
        <dl style={{ margin: 0 }}>
          {b.brief && <Row icon={FileText} label="Brief" value={b.brief} long />}
          {b.deliverables && <Row icon={CheckCircle2} label="Deliverables" value={b.deliverables} long />}
          {(b.packageKey || b.promotionCategory) && (
            <Row icon={Box} label="Package" value={promoLabel(b.packageKey || b.promotionCategory)} />
          )}
          {b.platform && <Row icon={Share2} label="Platform" value={b.platform} />}
          {b.deadline && <Row icon={CalendarClock} label="Deadline" value={fmtDate(b.deadline)} />}
          {b.hashtags && <Row icon={Tag} label="Hashtags" value={b.hashtags} long />}
          {b.cta && <Row icon={Link2} label="CTA" value={b.cta} long />}
          {b.usageRights && <Row icon={ShieldCheck} label="Usage rights" value={b.usageRights} long />}
          {b.revisions != null && <Row icon={RefreshCw} label="Revisions" value={String(b.revisions)} />}
          {isBarter && b.barterOffer && <Row icon={Wallet} label="Barter offer" value={`${b.barterOffer}${b.barterOfferValue ? ` (worth ${inr(b.barterOfferValue)})` : ''}`} />}
          {isBarter && b.barterDeliverables && <Row icon={CheckCircle2} label="Barter deliverables" value={b.barterDeliverables} long />}
          {isBarter && b.shipping && <Row icon={Truck} label="Shipping" value={b.shipping} long />}
        </dl>
        {!b.brief && !b.deliverables && (
          <div className="cl-small cl-muted">No written brief was attached to this request.</div>
        )}
        {Array.isArray(b.mediaFiles) && b.mediaFiles.length > 0 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
            {b.mediaFiles.slice(0, 4).map((m, i) => (
              <a key={i} href={typeof m === 'string' ? m : m.url} target="_blank" rel="noreferrer"
                className="cl-chip cyan" style={{ textDecoration: 'none' }}>
                <ExternalLink style={{ width: 13, height: 13 }} /> Reference {i + 1}
              </a>
            ))}
          </div>
        )}
      </Card>

      {/* Payment / escrow */}
      <div className="cl-section-title" style={{ marginTop: 16 }}><h3>Payment & escrow</h3></div>
      <Card style={{ padding: 12 }}>
        <dl style={{ margin: 0 }}>
          {isBarter ? (
            <>
              <Row icon={Package} label="Type" value="Barter — no monetary escrow" />
              {b.productValue ? <Row icon={Tag} label="Product value" value={inr(b.productValue)} /> : null}
            </>
          ) : (
            <>
              <Row icon={Tag} label="Your price" value={inr(b.creatorPrice ?? b.amount)} />
              <Row icon={CheckCircle2} label="You earn (95%)" value={inr(creatorShareOf(b))} />
              <Row icon={ShieldCheck} label="Escrow" value={
                b.escrowStatus === 'released' ? 'Released' : b.escrowStatus === 'held' ? 'Held securely' : (b.escrowStatus || '—')
              } />
              <Row icon={Receipt} label="Payment status" value={
                b.paymentStatus === 'released' ? 'Released to you' : b.paymentStatus === 'escrow_held' ? 'Held in escrow' : (b.paymentStatus || '—')
              } />
              {b.paymentMethod && <Row icon={CreditCard} label="Paid via" value={b.paymentMethod} />}
            </>
          )}
        </dl>
        {b.refundProcessed && (
          <div className="cl-small" style={{ marginTop: 8, color: 'var(--green)', fontWeight: 600 }}>
            Refunded {inr(b.refundAmount)} {b.refundedAt ? `on ${fmtDate(b.refundedAt)}` : ''}
          </div>
        )}
        {b.refundStatus === 'manual_review_needed' && (
          <div className="cl-small" style={{ marginTop: 8, color: 'var(--amber)', fontWeight: 600 }}>
            Refund flagged for manual review by the admin team.
          </div>
        )}
      </Card>

      {/* Address state (barter) */}
      {isBarter && (
        <>
          <div className="cl-section-title" style={{ marginTop: 16 }}><h3>Shipping address</h3></div>
          <Card style={{ padding: 12 }}>
            {b.creatorAddress ? (
              <div className="cl-row" style={{ gap: 10 }}>
                <MapPin style={{ width: 18, height: 18, color: 'var(--green)', flexShrink: 0 }} />
                <div className="cl-small" style={{ lineHeight: 1.6 }}>
                  Shared with the brand{b.addressSharedAt ? ` on ${fmtDateTime(b.addressSharedAt)}` : ''}.
                </div>
              </div>
            ) : (
              <div className="cl-row" style={{ gap: 10 }}>
                <AlertCircle style={{ width: 18, height: 18, color: 'var(--amber)', flexShrink: 0 }} />
                <div className="cl-small cl-muted" style={{ lineHeight: 1.6 }}>
                  {b.status === BOOKING_STATUS.PENDING
                    ? 'Your address will be shared with the brand when you accept.'
                    : 'No address shared yet.'}
                </div>
              </div>
            )}
          </Card>
        </>
      )}

      {/* Admin rejection / resubmit */}
      {b.adminRejected && b.status === BOOKING_STATUS.PENDING_COMPLETION && (
        <Card style={{ marginTop: 14, borderColor: 'var(--amber)', borderWidth: 1.5 }}>
          <div className="cl-row" style={{ gap: 10, marginBottom: 6 }}>
            <AlertCircle style={{ width: 19, height: 19, color: 'var(--amber)', flexShrink: 0 }} />
            <h3 style={{ fontSize: 15 }}>Sent back by admin</h3>
          </div>
          <p className="cl-small" style={{ lineHeight: 1.6 }}>
            <strong>Reason:</strong> {b.adminRejectionReason || 'Please review the deliverables and resubmit.'}
          </p>
        </Card>
      )}

      {/* Delivery state */}
      {(b.driveLink || b.promotedVideoLink) && (
        <>
          <div className="cl-section-title" style={{ marginTop: 16 }}><h3>Delivery</h3></div>
          <Card style={{ padding: 12 }}>
            <div className="cl-small cl-muted" style={{ marginBottom: 2 }}>Submitted link{b.deliverySubmittedAt ? ` · ${fmtDateTime(b.deliverySubmittedAt)}` : ''}</div>
            <LinkPreviewChip url={b.driveLink || b.promotedVideoLink} />
          </Card>
        </>
      )}

      {/* Rejection reason (cancelled) */}
      {b.status === BOOKING_STATUS.CANCELLED && b.rejectionReason && (
        <Card style={{ marginTop: 14 }}>
          <div className="cl-small cl-muted">Rejection reason</div>
          <div className="cl-small" style={{ marginTop: 4, lineHeight: 1.6 }}>{b.rejectionReason}</div>
        </Card>
      )}

      {/* Revision requested by brand */}
      {b.revisionRequested && b.revisionNote && (
        <Card style={{ marginTop: 14, background: 'var(--amber-soft)', borderColor: 'transparent' }}>
          <div className="cl-small" style={{ fontWeight: 700, color: 'var(--amber, #d97706)', marginBottom: 4 }}>
            Revision requested (#{b.revisionCount || 1})
          </div>
          <div className="cl-small" style={{ lineHeight: 1.6 }}>{b.revisionNote}</div>
        </Card>
      )}

      {/* Actions */}
      <div style={{ display: 'grid', gap: 10, marginTop: 18 }}>
        {canAct && !rejectOpen && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Button variant="danger" block onClick={() => setRejectOpen(true)} icon={XCircle}>
              Reject
            </Button>
            <Button block loading={busy === 'accept'} onClick={doAccept} icon={CheckCircle2}>
              Accept{isBarter ? ' barter' : ''}
            </Button>
          </div>
        )}
        {canAct && rejectOpen && (
          <Card className="cl-pop" style={{ padding: 14, borderColor: 'var(--red)', borderWidth: 1.5 }}>
            <h3 style={{ fontSize: 15, marginBottom: 4 }}>Reject this booking?</h3>
            <p className="cl-small cl-muted" style={{ lineHeight: 1.6, marginBottom: 12 }}>
              {isWalletPaid
                ? `The brand's ${inr(Number(b.escrowAmount ?? b.amount ?? 0))} escrow will be refunded to their wallet automatically.`
                : 'The brand will be notified with your reason. This cannot be undone.'}
            </p>
            <Field label="Rejection reason (required)">
              <TextArea value={reason} onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Not aligned with my niche this month…" />
            </Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Button variant="ghost" block onClick={() => { setRejectOpen(false); setReason(''); }}>Keep booking</Button>
              <Button variant="danger" block loading={busy === 'reject'} onClick={doReject} icon={XCircle}>
                Confirm rejection
              </Button>
            </div>
          </Card>
        )}
        {canDeliver && !showDeliver && (
          <Button block onClick={() => { setShowDeliver(true); setDeliveryUrl(b.driveLink || b.promotedVideoLink || ''); }} icon={Send}>
            {b.adminRejected ? 'Fix & resubmit delivery' : 'Submit delivery link'}
          </Button>
        )}
        {canDeliver && showDeliver && (
          <Card className="cl-pop" style={{ padding: 14 }}>
            <Field
              label={isPersonalAd ? 'Google Drive link' : 'Delivery link'}
              hint={isPersonalAd ? 'Paste the Google Drive link of your finished ad video.' : 'Link to your published post / video / drive file.'}
            >
              <Input value={deliveryUrl} onChange={(e) => setDeliveryUrl(e.target.value)}
                placeholder="https://…" inputMode="url" />
              <LinkPreviewChip url={deliveryUrl} />
            </Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Button variant="ghost" block onClick={() => setShowDeliver(false)}>Cancel</Button>
              <Button block loading={busy === 'deliver'} onClick={doDeliver} icon={Send}>
                {b.adminRejected ? 'Resubmit' : 'Submit for review'}
              </Button>
            </div>
          </Card>
        )}
        <div style={{ position: 'relative' }}>
          <Button block icon={MessageCircle} onClick={() => setChatOpen(true)}>
            Chat with Brand
          </Button>
          <UnreadBadge count={unread} />
        </div>
        {chatOpen && (
          <ChatModal
            booking={b}
            myType="creator"
            peerName={b.bizName || 'Brand'}
            peerAvatar={b.bizPfp}
            senderName={creator?.name || 'Creator'}
            onClose={() => setChatOpen(false)}
          />
        )}
        <Button variant="ghost" block onClick={onClose}>Close</Button>
      </div>
    </Modal>
  );
}
