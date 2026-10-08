/* Booking deadline processor (Collabstr 72h model).
 * Called by cron every hour. Processes:
 * 1. Pending bookings past acceptDeadline → auto-cancel + refund brand
 * 2. PendingCompletion bookings past reviewDeadline → auto-approve + payout creator
 */
import { getAdmin } from '../lib/firebaseAdmin.js';

export default async function handler(req, res) {
  // Auth: when CRON_SECRET is configured on the project, Vercel Cron sends
  // `Authorization: Bearer <CRON_SECRET>` automatically on every scheduled
  // call; direct unauthenticated hits are rejected. If the secret is not
  // configured yet, behavior is unchanged (allow), so nothing breaks until
  // CRON_SECRET is set in the Vercel environment.
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const got = String(req.headers['authorization'] || '');
    if (got !== 'Bearer ' + secret) return res.status(401).json({ ok: false });
  }
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ ok: false });
  }
  try {
    const app = getAdmin();
    const db = app.firestore();
    const now = new Date();
    const results = { cancelled: [], approved: [] };

    // 1. Auto-cancel expired Pending bookings
    const pendingSnap = await db.collection('bookings')
      .where('status', '==', 'Pending')
      .where('acceptDeadline', '<', now)
      .limit(50)
      .get();

    for (const doc of pendingSnap.docs) {
      const b = doc.data();
      if (b.autoCancelled) continue;
      const batch = db.batch();
      // Refund brand wallet
      if (b.bizId && b.paidAmount > 0 && !b.barter) {
        const bizRef = db.collection('businesses').doc(b.bizId);
        const bizSnap = await bizRef.get();
        if (bizSnap.exists) {
          const bal = Number(bizSnap.data().walletBalance || 0);
          batch.update(bizRef, { walletBalance: bal + b.paidAmount });
          // Ledger entry
          const ledgerRef = db.collection('wallet_ledger').doc();
          batch.set(ledgerRef, {
            bizId: b.bizId, bookingId: doc.id, type: 'refund_auto_cancel',
            amount: b.paidAmount, createdAt: now,
            note: 'Auto-refund: creator did not accept within 72h',
          });
        }
      }
      batch.update(doc.ref, {
        status: 'Cancelled', autoCancelled: true,
        cancelReason: 'Creator did not accept within 72 hours (auto-cancelled)',
        updatedAt: now,
      });
      await batch.commit();
      results.cancelled.push(doc.id);
    }

    // 2. Auto-approve expired PendingCompletion bookings
    const reviewSnap = await db.collection('bookings')
      .where('status', '==', 'PendingCompletion')
      .where('reviewDeadline', '<', now)
      .limit(50)
      .get();

    for (const doc of reviewSnap.docs) {
      const b = doc.data();
      if (b.autoApproved) continue;
      const batch = db.batch();
      // Payout to creator (95% of creator price, platform keeps rest)
      // Note: actual payout goes through admin queue; mark as approved
      batch.update(doc.ref, {
        status: 'Completed', autoApproved: true,
        completedAt: now, updatedAt: now,
        payoutStatus: 'pending_admin_release',
        note: 'Auto-approved: brand did not review within 72 hours',
      });
      // Notify admin via payouts queue
      const payoutRef = db.collection('payoutRequests').doc();
      batch.set(payoutRef, {
        bookingId: doc.id, creatorId: b.creatorId,
        amount: Math.round((b.creatorPrice || 0) * 0.93), // 7% creator fee
        status: 'pending', createdAt: now,
        note: 'Auto-approved booking payout',
      });
      await batch.commit();
      results.approved.push(doc.id);
    }

    return res.status(200).json({ ok: true, ...results });
  } catch (e) {
    return res.status(500).json({ ok: false, err: String(e?.message || e).slice(0, 200) });
  }
}
