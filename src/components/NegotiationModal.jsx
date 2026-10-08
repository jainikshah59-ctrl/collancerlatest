import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, X, MessageSquare, IndianRupee, ArrowLeftRight, ShieldCheck } from 'lucide-react';
import {
  ensureFirebase, db, doc, getDoc, addDoc, collection, updateDoc, serverTimestamp,
} from '../lib/firebase.js';
import { inr } from '../lib/format.js';
import { Button, Card, Field, Input, TextArea, Modal, Badge, useToast } from './ui.jsx';

export default function NegotiationModal({
  mode = 'business',
  creator,
  biz,
  user,
  negotiationId,
  packageKey,
  onClose,
  onBook,
}) {
  const toast = useToast();
  const [neg, setNeg] = useState(null);
  const [offer, setOffer] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(!!negotiationId);

  useEffect(() => {
    if (!negotiationId) return;
    let cancelled = false;
    ensureFirebase().then(async () => {
      try {
        const snap = await getDoc(doc(db(), 'negotiations', negotiationId));
        if (!cancelled && snap.exists()) {
          const d = { id: snap.id, ...snap.data() };
          setNeg(d);
          setOffer(String(d.currentOffer || d.creatorPrice || ''));
          setMessage('');
        }
      } finally { if (!cancelled) setLoading(false); }
    });
    return () => { cancelled = true; };
  }, [negotiationId]);

  const creatorPrice = Number(creator?.prices?.[packageKey] || creator?.price || 0);
  const current = Number(neg?.currentOffer || creatorPrice || 0);
  const canAct = !!neg && ['pending_creator', 'countered'].includes(neg.status);
  const isBusinessTurn = mode === 'business'
    ? neg?.status === 'countered'
    : neg?.status === 'pending_creator';

  async function notify(targetId, type, title, body, negotiationIdValue) {
    try {
      await addDoc(collection(db(), targetId === creator?.id ? 'creatorNotifs' : 'bizNotifs'), {
        [targetId === creator?.id ? 'creatorId' : 'bizId']: targetId,
        type, title, body, negotiationId: negotiationIdValue,
        read: false, createdAt: serverTimestamp(),
      });
    } catch {}
  }

  async function start() {
    const amount = Math.round(Number(offer));
    if (!amount || amount < 1) return toast.err('Enter a valid offer amount.');
    if (amount > creatorPrice * 3) return toast.err('Offer is too high. Please enter a reasonable amount.');
    setBusy(true);
    try {
      const ref = await addDoc(collection(db(), 'negotiations'), {
        bizId: user.uid,
        creatorId: creator.id,
        bizName: biz?.bizName || 'Business',
        creatorName: creator.name || 'Creator',
        packageKey,
        packageLabel: packageKey || 'Collaboration',
        creatorPrice,
        currentOffer: amount,
        proposedBy: 'business',
        message: message.trim().slice(0, 1000),
        status: 'pending_creator',
        history: [{ amount, by: 'business', message: message.trim().slice(0, 1000), createdAt: new Date().toISOString() }],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await notify(creator.id, 'negotiation_received', 'New price negotiation',
        `${biz?.bizName || 'A brand'} offered ${inr(amount)} for your package.`, ref.id);
      setNeg({ id: ref.id, bizId: user.uid, creatorId: creator.id, currentOffer: amount, status: 'pending_creator', packageKey, creatorPrice });
      toast.ok('Offer sent to the creator.');
    } catch (e) {
      toast.err('Could not send the offer. Please try again.');
    } finally { setBusy(false); }
  }

  async function respond(action) {
    const amount = Math.round(Number(offer));
    if (action === 'counter' && (!amount || amount < 1)) return toast.err('Enter a valid counter-offer.');
    setBusy(true);
    try {
      const nextStatus = action === 'accept' ? 'accepted' : action === 'reject' ? 'rejected' : (mode === 'creator' ? 'countered' : 'pending_creator');
      const nextAmount = action === 'counter' ? amount : current;
      const history = Array.isArray(neg.history) ? [...neg.history] : [];
      history.push({
        amount: nextAmount,
        by: mode,
        message: message.trim().slice(0, 1000),
        action,
        createdAt: new Date().toISOString(),
      });
      await updateDoc(doc(db(), 'negotiations', neg.id), {
        currentOffer: nextAmount,
        proposedBy: mode,
        status: nextStatus,
        message: message.trim().slice(0, 1000),
        history,
        updatedAt: serverTimestamp(),
        ...(action === 'accept' ? { acceptedAt: serverTimestamp(), acceptedBy: mode } : {}),
        ...(action === 'reject' ? { rejectedAt: serverTimestamp(), rejectedBy: mode } : {}),
      });
      const targetId = mode === 'creator' ? neg.bizId : neg.creatorId;
      const label = action === 'accept' ? 'accepted' : action === 'reject' ? 'rejected' : 'countered';
      await notify(targetId, `negotiation_${action}`, `Negotiation ${label}`,
        `${mode === 'creator' ? neg.creatorName : neg.bizName} ${label} at ${inr(nextAmount)}.`, neg.id);
      setNeg((p) => ({ ...p, currentOffer: nextAmount, status: nextStatus, proposedBy: mode, history }));
      setMessage('');
      toast.ok(action === 'accept' ? 'Deal accepted.' : action === 'reject' ? 'Negotiation rejected.' : 'Counter-offer sent.');
    } catch (e) {
      toast.err('Could not update the negotiation.');
    } finally { setBusy(false); }
  }

  if (loading) return <Modal open onClose={onClose}><p className="cl-small cl-muted">Loading negotiation…</p></Modal>;

  const packageLabel = creator?.packages?.[packageKey]?.description || packageKey || 'Creator package';

  return (
    <Modal open wide onClose={onClose}>
      <div className="cl-row" style={{ marginBottom: 14 }}>
        <div className="cl-grow">
          <h3 style={{ fontSize: 18 }}>Negotiate price</h3>
          <p className="cl-small cl-muted" style={{ marginTop: 3 }}>
            {creator?.name || neg?.creatorName || 'Creator'} · {packageLabel}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose} icon={X} aria-label="Close" />
      </div>

      {neg ? (
        <>
          <Card style={{ marginBottom: 12 }}>
            <div className="cl-row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div className="cl-small cl-muted">Current offer</div>
                <div className="cl-money" style={{ fontSize: 24 }}>{inr(current)}</div>
              </div>
              <Badge tone={neg.status === 'accepted' ? 'cyan' : neg.status === 'rejected' ? 'grey' : 'gold'}>
                {neg.status.replace('_', ' ')}
              </Badge>
            </div>
            {neg.message && <p className="cl-small" style={{ marginTop: 10, lineHeight: 1.55 }}>{neg.message}</p>}
          </Card>

          {neg.status === 'accepted' ? (
            <Card style={{ textAlign: 'center', padding: 24 }}>
              <CheckCircle2 style={{ width: 38, height: 38, color: 'var(--green)', margin: '0 auto 10px' }} />
              <h4 style={{ fontSize: 16, marginBottom: 6 }}>Deal accepted at {inr(current)}</h4>
              <p className="cl-small cl-muted" style={{ marginBottom: 16 }}>Payments remain protected through Collancer escrow.</p>
              {mode === 'business' && onBook && (
                <Button block icon={ShieldCheck} onClick={() => onBook({ amount: current, negotiationId: neg.id })}>
                  Book at {inr(current)}
                </Button>
              )}
            </Card>
          ) : neg.status === 'rejected' ? (
            <Card style={{ textAlign: 'center', padding: 24 }}>
              <h4 style={{ fontSize: 16 }}>Negotiation closed</h4>
              <p className="cl-small cl-muted" style={{ marginTop: 6 }}>You can start a new negotiation from the creator profile.</p>
            </Card>
          ) : isBusinessTurn ? (
            <div style={{ display: 'grid', gap: 10 }}>
              <Field label="Your counter-offer (₹)">
                <Input value={offer} onChange={(e) => setOffer(e.target.value)} inputMode="numeric" />
              </Field>
              <Field label="Message">
                <TextArea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Explain the budget or scope…" />
              </Field>
              <div className="cl-row" style={{ gap: 8 }}>
                <Button variant="danger" onClick={() => respond('reject')} loading={busy}>Reject</Button>
                <div className="cl-grow" />
                <Button variant="secondary" icon={ArrowLeftRight} onClick={() => respond('counter')} loading={busy}>Counter</Button>
                <Button icon={CheckCircle2} onClick={() => respond('accept')} loading={busy}>Accept</Button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              <Field label="Offer amount (₹)">
                <Input value={offer} onChange={(e) => setOffer(e.target.value)} inputMode="numeric" placeholder={String(creatorPrice || '')} />
              </Field>
              <Field label="Message">
                <TextArea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Tell the creator about your budget or campaign scope…" />
              </Field>
              <Button block icon={IndianRupee} onClick={start} loading={busy}>Send offer</Button>
            </div>
          )}
        </>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          <Card>
            <div className="cl-kv"><dt>Listed price</dt><dd className="cl-money">{inr(creatorPrice)}</dd></div>
            <p className="cl-small cl-muted" style={{ marginTop: 8 }}>Agree on a custom price with the creator before booking.</p>
          </Card>
          <Field label="Your offer (₹)">
            <Input value={offer} onChange={(e) => setOffer(e.target.value)} inputMode="numeric" placeholder={String(creatorPrice || '')} />
          </Field>
          <Field label="Message">
            <TextArea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Explain your budget or campaign scope…" />
          </Field>
          <Button block icon={MessageSquare} onClick={start} loading={busy}>Send negotiation</Button>
        </div>
      )}
    </Modal>
  );
}
