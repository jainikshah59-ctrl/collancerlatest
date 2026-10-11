/* BookFromOfferModal — convert an accepted marketplace offer into a booking.
   creatorPrice = offer.price; +12% fee − Pro 5%. Wallet payment runs one transaction
   covering: balance check + debit, booking creation, requirement -> matched,
   offer -> accepted, ledger mkt_{bookingId}. Cashfree demo page honestly labeled. */
import React, { useMemo, useState } from 'react';
import {
  X, ChevronLeft, Wallet as WalletIcon, CreditCard,
  CheckCircle2, Lock, Info, Store,
} from 'lucide-react';
import { useBiz, isBizPro } from './ctx.jsx';
import { ensureFirebase, doc, updateDoc, serverTimestamp } from '../lib/firebase.js';
import { inr } from '../lib/format.js';
import {
  buildBookingDoc, createWalletBooking, createDemoBooking,
  notifyCreator, bookingPricing,
} from './booking.js';
import {
  Sheet, Button, Card, Avatar, ProgressBar, useToast,
} from '../components/ui.jsx';
import CashfreeDemoPay from '../components/CashfreeDemoPay.jsx';

export default function BookFromOfferModal({ offer, requirement, onClose }) {
  const toast = useToast();
  const { user, biz, creators, goPage } = useBiz();
  const pro = isBizPro(biz);
  const [stage, setStage] = useState(1); // 1 review+method, 2 done
  const [payMethod, setPayMethod] = useState('wallet');
  const [cfOpen, setCfOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const creator = useMemo(
    () => (creators || []).find((c) => c.id === offer.creatorId) || {
      id: offer.creatorId, name: offer.creatorName, handle: offer.creatorHandle,
      platform: offer.creatorPlatform, pfp: offer.creatorPfp,
    },
    [creators, offer]
  );
  const pricing = useMemo(() => bookingPricing(Number(offer.price) || 0, pro), [offer.price, pro]);
  const balance = Number(biz?.walletBalance || 0);

  function fingerprintParts() {
    return {
      bizId: user.uid,
      creatorId: offer.creatorId,
      packageKey: offer.promoType || 'marketplace',
      campaignName: requirement.title || '',
      deadline: '',
    };
  }

  function baseBooking(paymentMethod, paymentReference, demoPayment, cashfreeEnv) {
    return buildBookingDoc({
      biz, creator, type: 'paid', packageKey: offer.promoType || 'marketplace',
      creatorPrice: pricing.creatorPrice, fee: pricing.fee, discount: pricing.discount, total: pricing.total,
      details: {
        campaignName: requirement.title || '',
        brief: requirement.description || '',
        deliverables: offer.message || '',
        platform: creator.platform || '',
        category: requirement.category || '',
        mediaFiles: requirement.mediaFiles || [],
        requirements: `Timeline: ${offer.timeline || 'as discussed'}`,
      },
      paymentMethod, paymentReference, demoPayment, cashfreeEnv,
      fromMarketplace: true, requirementId: requirement.id, offerId: offer.id,
    });
  }

  async function confirm() {
    setError('');
    if (payMethod === 'cashfree') { setCfOpen(true); return; }
    setBusy(true);
    try {
      const { db } = await ensureFirebase();
      let bookingId;
      if (payMethod === 'wallet') {
        if (balance < pricing.total) throw new Error('INSUFFICIENT_BALANCE');
        const booking = baseBooking('wallet', null, false);
        const out = await createWalletBooking(db, {
          biz, creator, booking, total: pricing.total,
          fingerprintParts: fingerprintParts(),
          ledgerPrefix: 'mkt',
          extraTx: async (tx) => {
            tx.update(doc(db, 'requirements', requirement.id), {
              status: 'matched', acceptedOfferId: offer.id, matchedAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
            tx.update(doc(db, 'requirementOffers', offer.id), {
              status: 'accepted', updatedAt: serverTimestamp(),
            });
          },
        });
        bookingId = out.bookingId;
      } else {
        throw new Error('UNKNOWN_METHOD');
      }
      await notifyCreator(db, {
        creatorId: offer.creatorId, type: 'booking_received',
        title: 'Marketplace booking received',
        body: `${biz.bizName} accepted your offer on "${requirement.title}"`,
        bookingId, biz,
      });
      setStage(2);
      toast.ok('Offer accepted — booking sent to the creator.');
    } catch (err) {
      console.error('[book-offer]', err);
      setError(err.message === 'DUPLICATE_BOOKING'
        ? 'A booking already exists for this offer.'
        : err.message === 'INSUFFICIENT_BALANCE'
          ? 'Insufficient wallet balance. Add money first or use Cashfree demo.'
          : 'Could not create the booking. Please try again.');
    } finally { setBusy(false); }
  }

  async function completeCashfreePayment(ref, meta) {
    setCfOpen(false);
    setError('');
    setBusy(true);
    try {
      const { db } = await ensureFirebase();
      const booking = baseBooking('cashfree', ref, true, meta?.env);
      const out = await createDemoBooking(db, { booking, fingerprintParts: fingerprintParts() });
      // non-wallet marketplace path: still mark requirement/offer (outside tx)
      await updateDoc(doc(db, 'requirements', requirement.id), {
        status: 'matched', acceptedOfferId: offer.id, matchedAt: serverTimestamp(), updatedAt: serverTimestamp(),
      });
      await updateDoc(doc(db, 'requirementOffers', offer.id), { status: 'accepted', updatedAt: serverTimestamp() });
      await notifyCreator(db, {
        creatorId: offer.creatorId, type: 'booking_received',
        title: 'Marketplace booking received',
        body: `${biz.bizName} accepted your offer on "${requirement.title}"`,
        bookingId: out.bookingId, biz,
      });
      setStage(2);
      toast.ok('Offer accepted — booking sent to the creator.');
    } catch (err) {
      console.error('[book-offer] cashfree', err);
      setError(err.message === 'DUPLICATE_BOOKING'
        ? 'A booking already exists for this offer.'
        : 'Could not create the booking. Please try again.');
    } finally { setBusy(false); }
  }

  const methods = [
    { key: 'wallet', label: 'Collancer Wallet', desc: `${inr(balance)} available`, icon: WalletIcon },
    { key: 'cashfree', label: 'Cashfree (demo)', desc: 'UPI · Cards · Netbanking', icon: CreditCard },
  ];

  return (
    <Sheet open onClose={onClose} labelledBy="Book from offer">
      <div className="cl-row" style={{ marginBottom: 6 }}>
        <div className="cl-grow">
          <h3 style={{ fontSize: 18 }}>Accept offer</h3>
          <p className="cl-small cl-muted" style={{ marginTop: 2 }}>
            <Store style={{ width: 12, height: 12, display: 'inline', verticalAlign: -1 }} /> Marketplace requirement
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close"><X style={{ width: 18, height: 18 }} /></Button>
      </div>

      {stage === 1 && (
        <div className="cl-fade" style={{ marginTop: 14 }}>
          <Card style={{ marginBottom: 12 }}>
            <div className="cl-row" style={{ marginBottom: 10 }}>
              <Avatar src={creator.pfp} name={creator.name} size={44} />
              <div className="cl-grow">
                <strong style={{ fontSize: 15 }}>{offer.creatorName}</strong>
                <div className="cl-small cl-muted">@{offer.creatorHandle}</div>
              </div>
            </div>
            <div className="cl-kv"><dt>Requirement</dt><dd>{requirement.title}</dd></div>
            {offer.message && <div className="cl-kv"><dt>Proposal</dt><dd>{offer.message.slice(0, 80)}</dd></div>}
            {offer.timeline && <div className="cl-kv"><dt>Timeline</dt><dd>{offer.timeline}</dd></div>}
          </Card>

          <Card style={{ marginBottom: 12 }}>
            <h4 style={{ fontSize: 14, marginBottom: 8 }}>Order summary</h4>
            <div className="cl-kv"><dt>Offer price</dt><dd className="cl-money">{inr(pricing.creatorPrice)}</dd></div>
            <div className="cl-kv"><dt>Platform + secure payment fee (12%)</dt><dd className="cl-money">+{inr(pricing.fee)}</dd></div>
            {pro && <div className="cl-kv"><dt>Pro saving (5%)</dt><dd className="cl-money" style={{ color: 'var(--green)' }}>−{inr(pricing.discount)}</dd></div>}
            <div className="cl-divider" />
            <div className="cl-kv"><dt><strong>Total</strong></dt><dd className="cl-money" style={{ fontSize: 17 }}>{inr(pricing.total)}</dd></div>
          </Card>

          <div style={{ display: 'grid', gap: 10, marginBottom: 12 }}>
            {methods.map((m) => (
              <button
                key={m.key}
                onClick={() => setPayMethod(m.key)}
                className="cl-card pressable"
                style={{
                  display: 'flex', gap: 12, alignItems: 'center', textAlign: 'left', cursor: 'pointer', width: '100%',
                  border: payMethod === m.key ? '2px solid var(--cyan)' : '1px solid var(--line-soft)',
                }}
              >
                <m.icon style={{ width: 20, height: 20, color: payMethod === m.key ? 'var(--cyan-deep)' : 'var(--ink-2)' }} />
                <div className="cl-grow">
                  <div style={{ fontWeight: 700, fontSize: 14.5 }}>{m.label}</div>
                  <div className="cl-small cl-muted">{m.desc}</div>
                </div>
                <div className="cl-money">{inr(pricing.total)}</div>
              </button>
            ))}
          </div>

          {payMethod !== 'wallet' && (
            <Card style={{ marginBottom: 12, background: 'var(--cyan-soft)', borderColor: 'transparent' }}>
              <div className="cl-row" style={{ gap: 8 }}>
                <Info style={{ width: 16, height: 16, color: 'var(--cyan-deep)', flexShrink: 0 }} />
                <strong style={{ fontSize: 13, color: 'var(--cyan-deep)' }}>Cashfree demo page — no real money moves</strong>
              </div>
            </Card>
          )}

          {error && <p className="cl-error-text" style={{ marginBottom: 12 }}>{error}</p>}
          <div className="cl-row">
            <Button variant="ghost" icon={ChevronLeft} onClick={onClose} disabled={busy}>Back</Button>
            <div className="cl-grow" />
            <Button loading={busy} icon={Lock} disabled={payMethod === 'wallet' && balance < pricing.total} onClick={confirm}>
              Accept & pay {inr(pricing.total)}
            </Button>
          </div>
        </div>
      )}

      {stage === 2 && (
        <div className="cl-fade" style={{ textAlign: 'center', padding: '22px 0 8px' }}>
          <div style={{ width: 72, height: 72, borderRadius: '50%', margin: '0 auto 16px', background: 'var(--green-soft)', display: 'grid', placeItems: 'center' }}>
            <CheckCircle2 style={{ width: 36, height: 36, color: 'var(--green)' }} />
          </div>
          <h3 style={{ fontSize: 19, marginBottom: 8 }}>Offer accepted</h3>
          <p className="cl-small cl-muted" style={{ lineHeight: 1.65, marginBottom: 20 }}>
            The requirement is now matched and {offer.creatorName} has been notified.
            They'll accept the booking from their inbox to start the collaboration.
          </p>
          <Button block size="lg" onClick={() => { onClose(); goPage('dashboard'); }}>View in Dashboard</Button>
          <div style={{ height: 10 }} />
          <Button variant="ghost" block onClick={onClose}>Done</Button>
        </div>
      )}
      <CashfreeDemoPay
        open={cfOpen}
        amount={pricing.total}
        purpose={`Marketplace offer — ${requirement.title || 'requirement'}`}
        customer={{ id: user?.uid, email: biz?.email || user?.email, phone: biz?.whatsapp }}
        onClose={() => setCfOpen(false)}
        onSuccess={completeCashfreePayment}
      />
    </Sheet>
  );
}
