/* BookModal — 6-stage booking flow: Type → Package → Details → Review → Payment → Sent.
   Paid: creator package price is LOCKED (audit §21.1). total = price + 12% fee − 5% Pro discount.
   Wallet = real Firestore transaction (live balance read inside tx, idempotent
   collab_{fingerprint}); Cashfree = honestly-labeled demo payment page.
   Barter: amount 0, paymentStatus not_required. */
import React, { useMemo, useState } from 'react';
import {
  X, ChevronLeft, IndianRupee, Repeat, CalendarCheck, Lock, Upload,
  Wallet as WalletIcon, CreditCard,
  CheckCircle2, AlertCircle, Trash2, ShieldCheck, Info,
} from 'lucide-react';
import { useBiz, isBizPro } from './ctx.jsx';
import { ensureFirebase } from '../lib/firebase.js';
import { uploadToCloudinary, CLOUDINARY_FOLDERS } from '../lib/cloudinary.js';
import { PROMO_TYPES, promoLabel, PLATFORMS, CATEGORIES } from '../lib/constants.js';
import { inr } from '../lib/format.js';
import {
  buildBookingDoc, createWalletBooking, createDemoBooking, createBarterBooking,
  notifyCreator, bookingPricing,
} from './booking.js';
import {
  Sheet, Button, Field, Input, TextArea, Select, Badge, Card,
  Avatar, EmptyState, useToast, ProgressBar,
} from '../components/ui.jsx';
import CashfreeDemoPay from '../components/CashfreeDemoPay.jsx';

const STAGES = ['Type', 'Package', 'Details', 'Review', 'Payment', 'Sent'];

function priceFor(creator, key) {
  if (creator.prices && Number(creator.prices[key]) > 0) return Number(creator.prices[key]);
  return Number(creator.price) || 0;
}

function MediaPicker({ files, setFiles }) {
  const toast = useToast();
  const [uploading, setUploading] = useState(false);

  async function onPick(e) {
    const picked = [...e.target.files].slice(0, 4 - files.length);
    e.target.value = '';
    if (!picked.length) return;
    setUploading(true);
    try {
      for (const f of picked) {
        const kind = f.type.startsWith('video') ? 'video' : 'image';
        const { url } = await uploadToCloudinary(f, kind, CLOUDINARY_FOLDERS.briefs);
        setFiles((arr) => [...arr, url].slice(0, 4));
      }
      toast.ok('Brief media uploaded.');
    } catch (err) {
      console.error('[book] media', err);
      toast.err('Media upload failed. You can continue without it.');
    } finally { setUploading(false); }
  }

  return (
    <Field label={`Brief media (${files.length}/4)`} hint="Images or video — stored with your campaign brief.">
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        {files.map((url, i) => (
          <div key={url + i} style={{ position: 'relative', width: 72, height: 72, borderRadius: 8, overflow: 'hidden', background: 'var(--surface-2)' }}>
            {/\.(mp4|webm|mov)/i.test(url)
              ? <video src={url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <img src={url} alt="brief" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
            <button
              onClick={() => setFiles((a) => a.filter((_, j) => j !== i))}
              style={{ position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: '50%', border: 0, background: 'rgba(0,0,0,.6)', color: '#fff', cursor: 'pointer', display: 'grid', placeItems: 'center' }}
              aria-label="Remove media"
            >
              <Trash2 style={{ width: 12, height: 12 }} />
            </button>
          </div>
        ))}
        {files.length < 4 && (
          <label style={{
            width: 72, height: 72, borderRadius: 8, border: '1.5px dashed var(--line)',
            display: 'grid', placeItems: 'center', cursor: 'pointer', color: 'var(--faint)',
          }}>
            {uploading
              ? <span className="cl-small">…</span>
              : <><Upload style={{ width: 20, height: 20 }} /><input type="file" accept="image/*,video/*" multiple hidden onChange={onPick} /></>}
          </label>
        )}
      </div>
    </Field>
  );
}

export default function BookModal({ creator, onClose, initialPackageKey = null, negotiatedPrice = null, negotiationId = null }) {
  const toast = useToast();
  const { user, biz, goPage } = useBiz();
  const pro = isBizPro(biz);
  const [stage, setStage] = useState(1);
  const [type, setType] = useState('paid');
  const [packageKey, setPackageKey] = useState(initialPackageKey || '');
  const [mediaFiles, setMediaFiles] = useState([]);
  const [d, setD] = useState({
    campaignName: '', productName: '', brief: '', deliverables: '', platform: creator.platform || 'Instagram',
    deadline: '', targetAudience: '', category: creator.niche || '', hashtags: '', websiteLink: '',
    cta: '', usageRights: '', revisions: '', exclusivity: '', requirements: '',
    contactNumber: '', shipping: '',
    barterOffer: '', barterOfferValue: '', barterDeliverables: '', productValue: '', barterTerms: '',
  });
  const [payMethod, setPayMethod] = useState('wallet');
  const [cfOpen, setCfOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const set = (k) => (e) => setD((prev) => ({ ...prev, [k]: e.target.value }));
  const creatorPrice = type === 'paid' && packageKey
    ? (Number(negotiatedPrice) > 0 ? Number(negotiatedPrice) : priceFor(creator, packageKey))
    : 0;
  const pricing = useMemo(() => bookingPricing(creatorPrice, pro), [creatorPrice, pro]);
  const balance = Number(biz?.walletBalance || 0);

  const packages = useMemo(() => {
    const rows = PROMO_TYPES
      .map((p) => ({ ...p, price: priceFor(creator, p.key) }))
      .filter((r) => r.price > 0 && (creator.packages?.[r.key]?.enabled !== false));
    if (rows.length === 0 && Number(creator.price) > 0) {
      rows.push({ key: 'standard', label: 'Standard collaboration', desc: 'As listed by the creator', price: Number(creator.price) });
    }
    return rows;
  }, [creator]);

  function validateDetails() {
    if (!d.campaignName.trim()) return 'Give your campaign a name.';
    if (!d.brief.trim()) return 'Add a campaign brief for the creator.';
    if (type === 'barter' && !d.barterOffer.trim()) return 'Describe what you are offering in exchange.';
    if (type === 'paid' && !packageKey) return 'Choose a package first.';
    return '';
  }

  function fingerprintParts() {
    return {
      bizId: user.uid,
      creatorId: creator.id,
      packageKey: type === 'paid' ? packageKey : 'barter',
      negotiatedPrice: Number(negotiatedPrice) > 0 ? Number(negotiatedPrice) : null,
      negotiationId: negotiationId || null,
      campaignName: d.campaignName.trim(),
      deadline: d.deadline || '',
    };
  }

  function baseBooking(paymentMethod, paymentReference, demoPayment, cashfreeEnv) {
    return buildBookingDoc({
      biz, creator, type, packageKey: type === 'paid' ? packageKey : null,
      creatorPrice, fee: pricing.fee, discount: pricing.discount, total: pricing.total,
      details: { ...d, mediaFiles },
      paymentMethod, paymentReference, demoPayment, cashfreeEnv,
    });
  }

  async function payWithWallet() {
    const { db } = await ensureFirebase();
    if (balance < pricing.total) throw new Error('INSUFFICIENT_BALANCE');
    const booking = baseBooking('wallet', null, false);
    return createWalletBooking(db, {
      biz, creator, booking, total: pricing.total,
      fingerprintParts: fingerprintParts(),
    });
  }

  async function payWithCashfree(ref, cashfreeEnv) {
    const { db } = await ensureFirebase();
    const booking = baseBooking('cashfree', ref, true, cashfreeEnv);
    return createDemoBooking(db, { booking, fingerprintParts: fingerprintParts() });
  }

  async function completeCashfreePayment(ref, meta) {
    setCfOpen(false);
    setBusy(true);
    try {
      const { db } = await ensureFirebase();
      const out = await payWithCashfree(ref, meta?.env);
      await notifyCreator(db, {
        creatorId: creator.id, type: 'booking_received',
        title: 'New collaboration request',
        body: `${biz.bizName} booked ${promoLabel(packageKey)} — ${d.campaignName}`,
        bookingId: out.bookingId, biz,
      });
      setResult({ bookingId: out.bookingId, method: 'cashfree' });
      setStage(6);
      toast.ok('Booking request sent to the creator.');
    } catch (err) {
      console.error('[book] cashfree', err);
      setError(err.message === 'DUPLICATE_BOOKING'
        ? 'You already have an active request like this with the creator.'
        : 'Could not create the booking. Please try again.');
    } finally { setBusy(false); }
  }

  async function sendBarter() {
    const { db } = await ensureFirebase();
    const booking = baseBooking('barter', null, false);
    return createBarterBooking(db, { booking, fingerprintParts: fingerprintParts() });
  }

  async function confirmPayment() {
    setError('');
    if (type === 'barter') {
      setBusy(true);
      try {
        const { db } = await ensureFirebase();
        const { bookingId } = await sendBarter();
        await notifyCreator(db, {
          creatorId: creator.id, type: 'booking_received',
          title: 'New barter collaboration request',
          body: `${biz.bizName} sent a barter request: ${d.campaignName}`,
          bookingId, biz,
        });
        setResult({ bookingId, method: 'barter' });
        setStage(6);
      } catch (err) {
        console.error('[book] barter', err);
        setError(err.message === 'DUPLICATE_BOOKING'
          ? 'You already have an active request like this with the creator.'
          : 'Could not send the request. Please try again.');
      } finally { setBusy(false); }
      return;
    }
    if (payMethod !== 'wallet' && payMethod !== 'cashfree') {
      setError('Choose a payment method.'); return;
    }
    if (payMethod === 'cashfree') { setCfOpen(true); return; }
    setBusy(true);
    try {
      const { db } = await ensureFirebase();
      const out = await payWithWallet();
      await notifyCreator(db, {
        creatorId: creator.id, type: 'booking_received',
        title: 'New collaboration request',
        body: `${biz.bizName} booked ${promoLabel(packageKey)} — ${d.campaignName}`,
        bookingId: out.bookingId, biz,
      });
      setResult({ bookingId: out.bookingId, method: payMethod });
      setStage(6);
      toast.ok('Booking request sent to the creator.');
    } catch (err) {
      console.error('[book] pay', err);
      setError(err.message === 'DUPLICATE_BOOKING'
        ? 'You already have an active booking like this with the creator.'
        : err.message === 'INSUFFICIENT_BALANCE'
          ? 'Insufficient wallet balance. Add money to your wallet first.'
          : 'Payment failed. Please try again.');
    } finally { setBusy(false); }
  }

  const methods = [
    { key: 'wallet', label: 'Collancer Wallet', desc: `${inr(balance)} available`, icon: WalletIcon },
    { key: 'cashfree', label: 'Cashfree', desc: 'UPI · Cards · Netbanking — demo page', icon: CreditCard },
  ];

  return (
    <Sheet open onClose={onClose} labelledBy="Book creator">
      <div style={{ paddingBottom: 8 }}>
        <div className="cl-row" style={{ marginBottom: 6 }}>
          <div className="cl-grow">
            <h3 style={{ fontSize: 18 }}>Book {creator.name}</h3>
            <p className="cl-small cl-muted" style={{ marginTop: 2 }}>Step {Math.min(stage, 6)} of 6 · {STAGES[Math.min(stage, 6) - 1]}</p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close"><X style={{ width: 18, height: 18 }} /></Button>
        </div>
        <ProgressBar value={(Math.min(stage, 6) / 6) * 100} />
      </div>

      <div style={{ marginTop: 18 }} className="cl-fade" key={stage}>
        {/* STAGE 1 — type */}
        {stage === 1 && (
          <>
            <div style={{ display: 'grid', gap: 10 }}>
              {[
                { key: 'paid', icon: IndianRupee, title: 'Paid collaboration', desc: 'Pay the creator package price. Funds stay in escrow until the work is approved.' },
                { key: 'barter', icon: Repeat, title: 'Barter collaboration', desc: 'Exchange products or services. No money moves — amount is zero.' },
              ].map((t) => (
                <button
                  key={t.key}
                  onClick={() => setType(t.key)}
                  className="cl-card pressable"
                  style={{
                    display: 'flex', gap: 12, textAlign: 'left', cursor: 'pointer', width: '100%',
                    border: type === t.key ? '2px solid var(--cyan)' : '1px solid var(--line-soft)',
                  }}
                >
                  <div style={{
                    width: 44, height: 44, borderRadius: 8, flexShrink: 0, display: 'grid', placeItems: 'center',
                    background: 'var(--cyan-soft)',
                    color: 'var(--cyan-deep)',
                  }}>
                    <t.icon style={{ width: 20, height: 20 }} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{t.title}</div>
                    <div className="cl-small cl-muted" style={{ marginTop: 3, lineHeight: 1.55 }}>{t.desc}</div>
                  </div>
                </button>
              ))}
            </div>
            <div style={{ height: 18 }} />
            <Button block size="lg" onClick={() => setStage(type === 'paid' ? 2 : 3)}>Continue</Button>
          </>
        )}

        {/* STAGE 2 — package */}
        {stage === 2 && (
          <>
            {packages.length === 0 ? (
              <EmptyState icon={AlertCircle} title="No packages listed" body="This creator hasn't published package pricing yet." />
            ) : (
              <div style={{ display: 'grid', gap: 10 }}>
                {packages.map((p) => (
                  <button
                    key={p.key}
                    onClick={() => setPackageKey(p.key)}
                    className="cl-card pressable"
                    style={{
                      display: 'flex', gap: 12, textAlign: 'left', cursor: 'pointer', width: '100%', alignItems: 'center',
                      border: packageKey === p.key ? '2px solid var(--cyan)' : '1px solid var(--line-soft)',
                    }}
                  >
                    <div className="cl-grow">
                      <div style={{ fontWeight: 700, fontSize: 15 }}>{p.label}</div>
                      <div className="cl-small cl-muted" style={{ marginTop: 2 }}>{p.desc}</div>
                      <div className="cl-small" style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6, color: 'var(--muted)' }}>
                        <Lock style={{ width: 12, height: 12 }} /> Price set by creator — locked
                      </div>
                    </div>
                    <div className="cl-money" style={{ fontSize: 17 }}>{inr(p.price)}</div>
                  </button>
                ))}
              </div>
            )}
            <div className="cl-row" style={{ marginTop: 18 }}>
              <Button variant="ghost" icon={ChevronLeft} onClick={() => setStage(1)}>Back</Button>
              <div className="cl-grow" />
              <Button onClick={() => packageKey && setStage(3)} disabled={!packageKey}>Continue</Button>
            </div>
          </>
        )}

        {/* STAGE 3 — details */}
        {stage === 3 && (
          <>
            <Field label="Campaign name" error={undefined}>
              <Input placeholder="e.g. Diwali Launch 2026" value={d.campaignName} onChange={set('campaignName')} />
            </Field>
            <Field label="Product / service name">
              <Input placeholder="What is being promoted?" value={d.productName} onChange={set('productName')} />
            </Field>
            <Field label="Campaign brief">
              <TextArea placeholder="Goals, talking points, do's and don'ts…" value={d.brief} onChange={set('brief')} />
            </Field>
            {type === 'paid' ? (
              <>
                <Field label="Deliverables">
                  <Input placeholder="e.g. 1 reel + 2 stories" value={d.deliverables} onChange={set('deliverables')} />
                </Field>
                <div className="cl-row" style={{ alignItems: 'flex-start' }}>
                  <div className="cl-grow"><Field label="Platform">
                    <Select value={d.platform} onChange={set('platform')}>
                      {PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
                    </Select>
                  </Field></div>
                  <div className="cl-grow"><Field label="Deadline">
                    <Input type="date" value={d.deadline} onChange={set('deadline')} />
                  </Field></div>
                </div>
                <Field label="Target audience"><Input placeholder="e.g. Women 22–34, metro cities" value={d.targetAudience} onChange={set('targetAudience')} /></Field>
                <Field label="Category">
                  <Select value={d.category} onChange={set('category')}>
                    <option value="">Select…</option>
                    {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </Select>
                </Field>
                <div className="cl-row" style={{ alignItems: 'flex-start' }}>
                  <div className="cl-grow"><Field label="Hashtags"><Input placeholder="#brand #collab" value={d.hashtags} onChange={set('hashtags')} /></Field></div>
                  <div className="cl-grow"><Field label="Website link"><Input placeholder="https://" value={d.websiteLink} onChange={set('websiteLink')} /></Field></div>
                </div>
                <Field label="Call to action"><Input placeholder="e.g. Use code DIWALI20" value={d.cta} onChange={set('cta')} /></Field>
                <div className="cl-row" style={{ alignItems: 'flex-start' }}>
                  <div className="cl-grow"><Field label="Usage rights"><Input placeholder="e.g. 90 days organic" value={d.usageRights} onChange={set('usageRights')} /></Field></div>
                  <div className="cl-grow"><Field label="Revisions"><Input placeholder="e.g. 2 included" value={d.revisions} onChange={set('revisions')} /></Field></div>
                </div>
                <Field label="Exclusivity"><Input placeholder="e.g. No competitor posts for 30 days" value={d.exclusivity} onChange={set('exclusivity')} /></Field>
                <Field label="Other requirements"><TextArea value={d.requirements} onChange={set('requirements')} placeholder="Anything else the creator should know" /></Field>
                <div className="cl-row" style={{ alignItems: 'flex-start' }}>
                  <div className="cl-grow"><Field label="Contact number"><Input placeholder="+91 …" value={d.contactNumber} onChange={set('contactNumber')} /></Field></div>
                  <div className="cl-grow"><Field label="Shipping (if needed)"><Input placeholder="Courier / pickup…" value={d.shipping} onChange={set('shipping')} /></Field></div>
                </div>
                <MediaPicker files={mediaFiles} setFiles={setMediaFiles} />
              </>
            ) : (
              <>
                <Field label="What you offer (barter)">
                  <TextArea placeholder="Products / services you will provide in exchange…" value={d.barterOffer} onChange={set('barterOffer')} />
                </Field>
                <div className="cl-row" style={{ alignItems: 'flex-start' }}>
                  <div className="cl-grow"><Field label="Offer value (₹)"><Input inputMode="numeric" placeholder="e.g. 5000" value={d.barterOfferValue} onChange={set('barterOfferValue')} /></Field></div>
                  <div className="cl-grow"><Field label="Product value (₹)"><Input inputMode="numeric" placeholder="e.g. 5000" value={d.productValue} onChange={set('productValue')} /></Field></div>
                </div>
                <Field label="Barter deliverables"><Input placeholder="e.g. 1 reel + 1 story" value={d.barterDeliverables} onChange={set('barterDeliverables')} /></Field>
                <Field label="Barter terms"><TextArea placeholder="Timelines, shipping of products, content approval…" value={d.barterTerms} onChange={set('barterTerms')} /></Field>
                <div className="cl-row" style={{ alignItems: 'flex-start' }}>
                  <div className="cl-grow"><Field label="Deadline"><Input type="date" value={d.deadline} onChange={set('deadline')} /></Field></div>
                  <div className="cl-grow"><Field label="Contact number"><Input placeholder="+91 …" value={d.contactNumber} onChange={set('contactNumber')} /></Field></div>
                </div>
                <Field label="Shipping terms"><Input placeholder="Who ships what, by when" value={d.shipping} onChange={set('shipping')} /></Field>
                <MediaPicker files={mediaFiles} setFiles={setMediaFiles} />
              </>
            )}
            {error && <p className="cl-error-text" style={{ marginBottom: 12 }}>{error}</p>}
            <div className="cl-row" style={{ marginTop: 6 }}>
              <Button variant="ghost" icon={ChevronLeft} onClick={() => { setError(''); setStage(type === 'paid' ? 2 : 1); }}>Back</Button>
              <div className="cl-grow" />
              <Button onClick={() => {
                const v = validateDetails();
                if (v) { setError(v); return; }
                setError(''); setStage(4);
              }}>Review</Button>
            </div>
          </>
        )}

        {/* STAGE 4 — review */}
        {stage === 4 && (
          <>
            <Card style={{ marginBottom: 12 }}>
              <div className="cl-row" style={{ marginBottom: 10 }}>
                <Avatar src={creator.pfp} name={creator.name} size={44} />
                <div className="cl-grow">
                  <strong style={{ fontSize: 15 }}>{creator.name}</strong>
                  <div className="cl-small cl-muted">@{creator.handle} · {type === 'paid' ? promoLabel(packageKey) : 'Barter collaboration'}</div>
                </div>
              </div>
              <div className="cl-kv"><dt>Campaign</dt><dd>{d.campaignName}</dd></div>
              {d.deadline && <div className="cl-kv"><dt>Deadline</dt><dd>{d.deadline}</dd></div>}
              {d.platform && <div className="cl-kv"><dt>Platform</dt><dd>{d.platform}</dd></div>}
              {type === 'barter' && d.barterOffer && <div className="cl-kv"><dt>Your offer</dt><dd>{d.barterOffer.slice(0, 60)}</dd></div>}
            </Card>
            <Card>
              <h4 style={{ fontSize: 14, marginBottom: 8 }}>Order summary</h4>
              {type === 'paid' ? (
                <>
                  <div className="cl-kv"><dt>Creator price (locked)</dt><dd className="cl-money">{inr(pricing.creatorPrice)}</dd></div>
                  <div className="cl-kv"><dt>Platform fee (12%)</dt><dd className="cl-money">+{inr(pricing.fee)}</dd></div>
                  {pro && <div className="cl-kv"><dt>Pro discount (5%)</dt><dd className="cl-money" style={{ color: 'var(--green)' }}>−{inr(pricing.discount)}</dd></div>}
                  <div className="cl-divider" />
                  <div className="cl-kv"><dt><strong>Total</strong></dt><dd className="cl-money" style={{ fontSize: 17 }}>{inr(pricing.total)}</dd></div>
                  <p className="cl-small cl-muted" style={{ marginTop: 8, lineHeight: 1.55, display: 'flex', gap: 6 }}>
                    <ShieldCheck style={{ width: 14, height: 14, flexShrink: 0, marginTop: 2 }} />
                    Held in escrow — released to the creator only after admin approves the delivered work.
                  </p>
                </>
              ) : (
                <>
                  <div className="cl-kv"><dt>Amount</dt><dd className="cl-money">{inr(0)}</dd></div>
                  <p className="cl-small cl-muted" style={{ marginTop: 8, lineHeight: 1.55 }}>
                    Barter collaboration — no payment, no escrow. The creator's shipping address is shared only after they accept.
                  </p>
                </>
              )}
            </Card>
            <div className="cl-row" style={{ marginTop: 18 }}>
              <Button variant="ghost" icon={ChevronLeft} onClick={() => setStage(3)}>Back</Button>
              <div className="cl-grow" />
              <Button onClick={() => setStage(5)}>Continue to payment</Button>
            </div>
          </>
        )}

        {/* STAGE 5 — payment */}
        {stage === 5 && (
          <>
            {type === 'barter' ? (
              <Card style={{ textAlign: 'center', padding: '28px 20px' }}>
                <Repeat style={{ width: 34, height: 34, color: 'var(--cyan-deep)', margin: '0 auto 12px' }} />
                <h4 style={{ fontSize: 16, marginBottom: 8 }}>No payment needed</h4>
                <p className="cl-small cl-muted" style={{ lineHeight: 1.6, marginBottom: 18 }}>
                  This is a barter collaboration. Sending the request notifies the creator — they accept or decline from their inbox.
                </p>
                {error && <p className="cl-error-text" style={{ marginBottom: 12 }}>{error}</p>}
                <Button block size="lg" loading={busy} icon={CalendarCheck} onClick={confirmPayment}>Send collaboration request</Button>
              </Card>
            ) : (
              <>
                <div style={{ display: 'grid', gap: 10, marginBottom: 14 }}>
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

                {payMethod === 'wallet' && balance < pricing.total && (
                  <Card style={{ marginBottom: 12, background: 'var(--amber-soft)', borderColor: 'transparent' }}>
                    <p className="cl-small" style={{ color: 'var(--amber)', fontWeight: 600, lineHeight: 1.55 }}>
                      Wallet balance {inr(balance)} is short of {inr(pricing.total)}. Add money from the Wallet tab, or use a demo checkout below.
                    </p>
                  </Card>
                )}

                {payMethod === 'cashfree' && (
                  <Card style={{ marginBottom: 12, background: 'var(--cyan-soft)', borderColor: 'transparent' }}>
                    <div className="cl-row" style={{ gap: 8, marginBottom: 6 }}>
                      <Info style={{ width: 16, height: 16, color: 'var(--cyan-deep)' }} />
                      <strong style={{ fontSize: 13.5, color: 'var(--cyan-deep)' }}>Cashfree demo page — no real money moves</strong>
                    </div>
                    <p className="cl-small cl-muted" style={{ lineHeight: 1.55 }}>
                      Continue to a Cashfree-style payment page (UPI, cards, netbanking). It is simulated for demo — connect a Cashfree account to accept live payments.
                    </p>
                  </Card>
                )}

                {error && <p className="cl-error-text" style={{ marginBottom: 12 }}>{error}</p>}
                <div className="cl-row" style={{ marginTop: 6 }}>
                  <Button variant="ghost" icon={ChevronLeft} onClick={() => { setError(''); setStage(4); }} disabled={busy}>Back</Button>
                  <div className="cl-grow" />
                  <Button
                    loading={busy}
                    disabled={payMethod === 'wallet' && balance < pricing.total}
                    onClick={confirmPayment}
                    icon={Lock}
                  >
                    Pay {inr(pricing.total)}
                  </Button>
                </div>
                <p className="cl-small cl-muted" style={{ textAlign: 'center', marginTop: 12, lineHeight: 1.55 }}>
                  {payMethod === 'wallet'
                    ? 'Wallet debit runs as a secure transaction against your live balance.'
                    : 'Cashfree demo page — simulated payment. Use the wallet for real escrow accounting.'}
                </p>
              </>
            )}
          </>
        )}

        {/* STAGE 6 — sent */}
        {stage === 6 && (
          <div className="cl-fade" style={{ textAlign: 'center', padding: '18px 0 8px' }}>
            <div style={{
              width: 72, height: 72, borderRadius: '50%', margin: '0 auto 16px',
              background: 'var(--green-soft)', display: 'grid', placeItems: 'center',
            }}>
              <CheckCircle2 style={{ width: 36, height: 36, color: 'var(--green)' }} />
            </div>
            <h3 style={{ fontSize: 19, marginBottom: 8 }}>Request sent</h3>
            <p className="cl-small cl-muted" style={{ lineHeight: 1.65, marginBottom: 6 }}>
              {creator.name} has been notified and will accept or decline your request.
              You'll get a notification the moment they respond.
            </p>
            {result?.method && result.method !== 'barter' && (
              <p className="cl-small cl-muted" style={{ marginBottom: 18 }}>
                {result.method === 'wallet' ? 'Paid from your Collancer wallet.' : 'Recorded via demo checkout — no real money moved.'}
              </p>
            )}
            <div style={{ height: 10 }} />
            <Button block size="lg" onClick={() => { onClose(); goPage('dashboard'); }}>View in Dashboard</Button>
            <div style={{ height: 10 }} />
            <Button variant="ghost" block onClick={onClose}>Back to browsing</Button>
          </div>
        )}
      </div>
      <CashfreeDemoPay
        open={cfOpen}
        amount={pricing.total}
        purpose={`Booking — ${creator.name}`}
        customer={{ id: user?.uid, email: biz?.email || user?.email, phone: biz?.whatsapp }}
        onClose={() => setCfOpen(false)}
        onSuccess={completeCashfreePayment}
      />
    </Sheet>
  );
}
