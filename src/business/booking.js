/* Shared booking creation helpers for the business role.
   Canonical rules (audit §10 / §21):
   - wallet debit is a Firestore transaction reading the LIVE balance inside the tx
   - booking idempotency: doc id collab_{fingerprint32} (wallet bookings)
   - marketplace wallet ledger id: mkt_{bookingId}
   - demo payments are honestly simulated — never presented as gateway-confirmed */
import {
  doc, setDoc, addDoc, collection, updateDoc,
  runTransaction, serverTimestamp, increment,
} from '../lib/firebase.js';
import { bookingFingerprint, uid } from '../lib/format.js';
import { priceBreakup } from '../lib/constants.js';

/** Synthetic payment reference for demo/simulated checkouts. */
export function demoRef() {
  return `DEMO_${Date.now()}_${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

/** Assemble the canonical booking document (audit §4 bookings). */
export function buildBookingDoc({
  biz, creator, type, packageKey, creatorPrice, fee, discount, total,
  details, paymentMethod, paymentReference, demoPayment, cashfreeEnv,
  fromMarketplace, requirementId, offerId, negotiatedPrice, negotiationId,
}) {
  const d = details || {};
  const barter = type === 'barter';
  return {
    // identity
    creatorId: creator.id || creator.uid,
    creatorName: creator.name,
    creatorHandle: creator.handle,
    creatorPlatform: creator.platform,
    creatorNiche: creator.niche,
    creatorCity: creator.city,
    creatorPfp: creator.pfp || null,
    bizId: biz.uid,
    bizName: biz.bizName,
    bizPfp: biz.pfp || null,
    bizIsPro: !!(biz.isPro && biz.proActive),
    // campaign
    type,
    packageKey: packageKey || null,
    campaignName: d.campaignName || '',
    productName: d.productName || '',
    brief: d.brief || '',
    deliverables: d.deliverables || '',
    platform: d.platform || creator.platform || '',
    deadline: d.deadline || '',
    targetAudience: d.targetAudience || '',
    category: d.category || '',
    promotionCategory: d.category || '',
    hashtags: d.hashtags || '',
    websiteLink: d.websiteLink || '',
    cta: d.cta || '',
    couponOrCTA: d.cta || '',
    usageRights: d.usageRights || '',
    revisions: d.revisions || '',
    exclusivity: d.exclusivity || '',
    requirements: d.requirements || '',
    contactNumber: d.contactNumber || '',
    contact: d.contactNumber || '',
    shipping: d.shipping || '',
    mediaFiles: d.mediaFiles || [],
    // barter specifics
    barterOffer: d.barterOffer || '',
    barterOfferValue: d.barterOfferValue || '',
    barterDeliverables: d.barterDeliverables || '',
    productValue: d.productValue || '',
    barterTerms: d.barterTerms || '',
    // pricing / payment
    amount: total,
    creatorPrice,
    negotiatedPrice: Number(negotiatedPrice) > 0 ? Number(negotiatedPrice) : null,
    negotiationId: negotiationId || null,
    escrowAmount: barter ? 0 : total,
    platformFee: fee,
    proDiscount: discount,
    paidAmount: barter ? 0 : total,
    paymentMethod,
    paymentStatus: barter ? 'not_required' : 'escrow_held',
    escrowStatus: barter ? 'not_required' : 'held',
    paymentReference: paymentReference || null,
    demoPayment: !!demoPayment,
    cashfreeEnv: cashfreeEnv || null, // 'test' | 'production' | 'demo' | null
    paymentApproved: false,
    refundProcessed: false,
    // lifecycle
    status: 'Pending',
    seenByCreator: false,
    seenByBiz: true,
    // 72h deadlines (Collabstr model)
    acceptDeadline: new Date(Date.now() + 72 * 3600 * 1000), // creator must accept within 72h
    reviewDeadline: null, // set when creator submits work (72h from submission)
    autoCancelled: false,
    autoApproved: false,
    // marketplace linkage
    fromMarketplace: !!fromMarketplace,
    requirementId: requirementId || null,
    offerId: offerId || null,
    // timestamps
    createdAt: serverTimestamp(),
    paidAt: barter ? null : serverTimestamp(),
  };
}

/**
 * Wallet-paid booking as ONE Firestore transaction:
 *  1. reject duplicate non-cancelled booking with same fingerprint
 *  2. read live business balance inside the tx; require balance >= total
 *  3. decrement balance
 *  4. create booking doc collab_{fingerprint}
 *  5. create wallet ledger entry (booking_{fp} | mkt_{bookingId})
 *  6. optional extra atomic writes (marketplace requirement/offer updates)
 * Returns { bookingId, fingerprint }.
 */
export async function createWalletBooking(db, {
  biz, creator, booking, total, fingerprintParts,
  ledgerPrefix = 'booking', extraTx,
}) {
  const fp = await bookingFingerprint(fingerprintParts);
  const bookingId = `collab_${fp}`;
  const ledgerId = ledgerPrefix === 'mkt' ? `mkt_${bookingId}` : `booking_${fp}`;
  const bizRef = doc(db, 'businesses', biz.uid);
  const bookRef = doc(db, 'bookings', bookingId);
  const ledgerRef = doc(db, 'walletTransactions', ledgerId);

  await runTransaction(db, async (tx) => {
    const existing = await tx.get(bookRef);
    if (existing.exists() && existing.data().status !== 'Cancelled') {
      throw new Error('DUPLICATE_BOOKING');
    }
    const bizSnap = await tx.get(bizRef);
    const balance = Number(bizSnap.data()?.walletBalance || 0);
    if (balance < total) throw new Error('INSUFFICIENT_BALANCE');
    tx.update(bizRef, { walletBalance: increment(-total) });
    tx.set(bookRef, { ...booking, collaborationFingerprint: fp });
    tx.set(ledgerRef, {
      id: ledgerId,
      bizId: biz.uid,
      type: 'booking_deduction',
      amount: -total,
      bookingId,
      creatorId: booking.creatorId,
      creatorName: booking.creatorName,
      createdAt: serverTimestamp(),
    });
    if (extraTx) await extraTx(tx);
  });

  return { bookingId, fingerprint: fp };
}

/** Demo/simulated paid booking (UPI / card / other) — no real money moves. */
export async function createDemoBooking(db, { booking, fingerprintParts }) {
  const fp = await bookingFingerprint(fingerprintParts);
  const bookingId = `collab_${fp}`;
  const ref = doc(db, 'bookings', bookingId);
  await setDoc(ref, { ...booking, collaborationFingerprint: fp }, { merge: true });
  return { bookingId, fingerprint: fp };
}

/** Barter booking — amount 0, no escrow, still idempotent. */
export async function createBarterBooking(db, { booking, fingerprintParts }) {
  return createDemoBooking(db, { booking, fingerprintParts });
}

/** Notify the creator that a booking request arrived. */
export async function notifyCreator(db, { creatorId, type, title, body, bookingId, biz }) {
  await addDoc(collection(db, 'creatorNotifs'), {
    creatorId,
    type,
    title,
    body,
    bookingId: bookingId || null,
    bizId: biz?.uid || null,
    bizName: biz?.bizName || '',
    read: false,
    createdAt: serverTimestamp(),
  });
}

/** Notify the business (used for requirement/offer events on the business side). */
export async function notifyBiz(db, { bizId, type, title, body, refId }) {
  await addDoc(collection(db, 'bizNotifs'), {
    bizId,
    type,
    title,
    body,
    refId: refId || null,
    read: false,
    createdAt: serverTimestamp(),
  });
}

/** Convenience: full price math for a package. */
export function bookingPricing(creatorPrice, isPro) {
  return priceBreakup(creatorPrice, isPro);
}

export { uid };
