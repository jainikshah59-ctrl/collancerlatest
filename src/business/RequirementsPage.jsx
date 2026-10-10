/* Requirements Marketplace (business side) — browse all requirements, create a
   requirement (up to 4 media -> Cloudinary collancer_market_briefs), view own
   posts + offers, accept (BookFromOfferModal) / reject (creatorNotif
   offer_rejected), delete own requirement, open creator profiles. */
import React, { useEffect, useMemo, useState } from 'react';
import {
  Store, Plus, X, Upload, Trash2, ChevronRight, Check, Image as ImageIcon,
  MessageSquare, Clock, BadgeCheck, IndianRupee,
} from 'lucide-react';
import { useBiz, isBizPro, tsMs } from './ctx.jsx';
import {
  ensureFirebase, collection, query, where, orderBy, onSnapshot,
  addDoc, updateDoc, deleteDoc, doc, serverTimestamp,
} from '../lib/firebase.js';
import { uploadToGCS, GCS_FOLDERS } from '../lib/cloudinary.js';
import { CATEGORIES, PROMO_TYPES } from '../lib/constants.js';
import { inr, timeAgo } from '../lib/format.js';
import { notifyCreator } from './booking.js';
import BookFromOfferModal from './BookFromOfferModal.jsx';
import {
  Card, Avatar, Badge, Button, Field, Input, TextArea, Select,
  EmptyState, SkeletonCard, Sheet, Tabs, ConfirmDialog, Page, useToast,
  VerifiedTick,
} from '../components/ui.jsx';

function CreateSheet({ open, onClose }) {
  const toast = useToast();
  const { user, biz } = useBiz();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [budget, setBudget] = useState('');
  const [category, setCategory] = useState('');
  const [promoType, setPromoType] = useState('');
  const [media, setMedia] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function reset() {
    setTitle(''); setDescription(''); setBudget(''); setCategory('');
    setPromoType(''); setMedia([]); setError('');
  }

  async function onPick(e) {
    const picked = [...e.target.files].slice(0, 4 - media.length);
    e.target.value = '';
    if (!picked.length) return;
    setUploading(true);
    try {
      for (const f of picked) {
        const kind = f.type.startsWith('video') ? 'video' : 'image';
        const { url } = await uploadToGCS(f, kind, GCS_FOLDERS.marketBriefs);
        setMedia((a) => [...a, url].slice(0, 4));
      }
    } catch (err) {
      console.error('[market] upload', err);
      toast.err('Media upload failed — try again.');
    } finally { setUploading(false); }
  }

  async function publish() {
    setError('');
    if (!title.trim()) { setError('Give your requirement a title.'); return; }
    if (!description.trim()) { setError('Describe what you need from creators.'); return; }
    const b = Math.round(Number(budget));
    if (!b || b <= 0) { setError('Enter a valid budget.'); return; }
    setBusy(true);
    try {
      const { db } = await ensureFirebase();
      await addDoc(collection(db, 'requirements'), {
        bizId: user.uid,
        bizName: biz?.bizName || 'Business',
        bizPfp: biz?.pfp || null,
        bizIsPro: isBizPro(biz),
        title: title.trim(),
        description: description.trim(),
        budget: b,
        category, promoType,
        mediaFiles: media,
        status: 'open',
        offerCount: 0,
        acceptedOfferId: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      toast.ok('Requirement published to the marketplace.');
      reset();
      onClose();
    } catch (err) {
      console.error('[market] publish', err);
      setError('Could not publish. Please try again.');
    } finally { setBusy(false); }
  }

  return (
    <Sheet open={open} onClose={() => { reset(); onClose(); }} labelledBy="Post requirement">
      <h3 style={{ fontSize: 18, marginBottom: 14 }}>Post a requirement</h3>
      <div className="cl-fade">
        <Field label="Title"><Input placeholder="e.g. Need 3 food reels for launch" value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
        <Field label="Description"><TextArea placeholder="What should creators deliver? Audience, tone, timelines…" value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
        <div className="cl-row" style={{ alignItems: 'flex-start' }}>
          <div className="cl-grow"><Field label="Budget (₹)"><Input inputMode="numeric" placeholder="e.g. 15000" value={budget} onChange={(e) => setBudget(e.target.value)} /></Field></div>
          <div className="cl-grow"><Field label="Category">
            <Select value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">Select…</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          </Field></div>
        </div>
        <Field label="Promotion type">
          <Select value={promoType} onChange={(e) => setPromoType(e.target.value)}>
            <option value="">Select…</option>
            {PROMO_TYPES.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
          </Select>
        </Field>
        <Field label={`Media (${media.length}/4)`} hint="Images or video that help creators understand the brief.">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {media.map((u, i) => (
              <div key={u + i} style={{ position: 'relative', width: 72, height: 72, borderRadius: 8, overflow: 'hidden', background: 'var(--surface-2)' }}>
                {/\.(mp4|webm|mov)/i.test(u)
                  ? <video src={u} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <img src={u} alt="brief" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                <button onClick={() => setMedia((a) => a.filter((_, j) => j !== i))}
                  style={{ position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: '50%', border: 0, background: 'rgba(0,0,0,.6)', color: '#fff', cursor: 'pointer', display: 'grid', placeItems: 'center' }}
                  aria-label="Remove media">
                  <Trash2 style={{ width: 12, height: 12 }} />
                </button>
              </div>
            ))}
            {media.length < 4 && (
              <label style={{ width: 72, height: 72, borderRadius: 8, border: '1.5px dashed var(--line)', display: 'grid', placeItems: 'center', cursor: 'pointer', color: 'var(--faint)' }}>
                {uploading ? <span className="cl-small">…</span> : <><Upload style={{ width: 20, height: 20 }} /><input type="file" accept="image/*,video/*" multiple hidden onChange={onPick} /></>}
              </label>
            )}
          </div>
        </Field>
        {error && <p className="cl-error-text" style={{ marginBottom: 12 }}>{error}</p>}
        <Button block size="lg" loading={busy || uploading} onClick={publish}>Publish requirement</Button>
      </div>
    </Sheet>
  );
}

function RequirementCard({ req, mine, onOpen }) {
  return (
    <Card pressable onClick={onOpen} style={{ marginBottom: 10 }}>
      <div className="cl-row" style={{ marginBottom: 8 }}>
        <Avatar src={req.bizPfp} name={req.bizName} size={38} />
        <div className="cl-grow" style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 13 }}>{req.bizName}</div>
          <div className="cl-small cl-muted">{timeAgo(req.createdAt)}</div>
        </div>
        <Badge tone={req.status === 'open' ? 'green' : 'cyan'}>{req.status}</Badge>
      </div>
      <strong style={{ fontSize: 15 }}>{req.title}</strong>
      <p className="cl-small cl-muted" style={{ marginTop: 4, lineHeight: 1.55, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
        {req.description}
      </p>
      <div className="cl-row" style={{ marginTop: 10, gap: 8, flexWrap: 'wrap' }}>
        <span className="cl-money" style={{ fontSize: 15, color: 'var(--cyan-deep)' }}>{inr(req.budget)}</span>
        {req.category && <Badge tone="grey">{req.category}</Badge>}
        {(req.offerCount || 0) > 0 && (
          <span className="cl-small cl-muted" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <MessageSquare style={{ width: 13, height: 13 }} /> {req.offerCount} offer{req.offerCount === 1 ? '' : 's'}
          </span>
        )}
        <div className="cl-grow" />
        <ChevronRight style={{ width: 16, height: 16, color: 'var(--faint)' }} />
      </div>
    </Card>
  );
}

function RequirementDetail({ req, onClose, onBookOffer }) {
  const toast = useToast();
  const { user, openCreator } = useBiz();
  const [offers, setOffers] = useState(null);
  const [rejectId, setRejectId] = useState(null);
  const [rejecting, setRejecting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const mine = req.bizId === user.uid;

  useEffect(() => {
    let unsub = () => {};
    ensureFirebase().then(({ db }) => {
      unsub = onSnapshot(
        query(collection(db, 'requirementOffers'), where('requirementId', '==', req.id)),
        (s) => {
          const list = s.docs.map((d) => ({ id: d.id, ...d.data() }));
          list.sort((a, b) => tsMs(b.createdAt) - tsMs(a.createdAt));
          setOffers(list);
        },
        () => setOffers([])
      );
    });
    return () => unsub();
  }, [req.id]);

  async function rejectOffer(offer) {
    setRejecting(true);
    try {
      const { db } = await ensureFirebase();
      await updateDoc(doc(db, 'requirementOffers', offer.id), { status: 'rejected', updatedAt: serverTimestamp() });
      await notifyCreator(db, {
        creatorId: offer.creatorId, type: 'offer_rejected',
        title: 'Offer not selected',
        body: `Your offer on "${req.title}" was not selected this time.`,
        bookingId: null, biz: { uid: req.bizId, bizName: req.bizName },
      });
      toast.ok('Offer rejected.');
      setRejectId(null);
    } catch (err) {
      console.error('[market] reject', err);
      toast.err('Could not reject the offer.');
    } finally { setRejecting(false); }
  }

  async function deleteReq() {
    setDeleting(true);
    try {
      const { db } = await ensureFirebase();
      await deleteDoc(doc(db, 'requirements', req.id));
      toast.ok('Requirement deleted.');
      onClose();
    } catch (err) {
      console.error('[market] delete', err);
      toast.err('Could not delete the requirement.');
    } finally { setDeleting(false); setDeleteOpen(false); }
  }

  const pendingOffers = (offers || []).filter((o) => o.status === 'pending');

  return (
    <Sheet open onClose={onClose} labelledBy="Requirement details">
      <div className="cl-row" style={{ marginBottom: 10 }}>
        <div className="cl-grow">
          <h3 style={{ fontSize: 18 }}>{req.title}</h3>
          <p className="cl-small cl-muted" style={{ marginTop: 2 }}>{req.bizName} · {timeAgo(req.createdAt)}</p>
        </div>
        <Badge tone={req.status === 'open' ? 'green' : 'cyan'}>{req.status}</Badge>
      </div>

      <Card style={{ marginBottom: 12 }}>
        <p className="cl-small" style={{ lineHeight: 1.65 }}>{req.description}</p>
        <div className="cl-divider" />
        <div className="cl-kv"><dt>Budget</dt><dd className="cl-money" style={{ color: 'var(--cyan-deep)' }}>{inr(req.budget)}</dd></div>
        {req.category && <div className="cl-kv"><dt>Category</dt><dd>{req.category}</dd></div>}
        {req.promoType && <div className="cl-kv"><dt>Promotion type</dt><dd>{req.promoType}</dd></div>}
        {(req.mediaFiles || []).length > 0 && (
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            {req.mediaFiles.map((u, i) => (
              <a key={i} href={u} target="_blank" rel="noreferrer">
                {/\.(mp4|webm|mov)/i.test(u)
                  ? <video src={u} style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 10 }} />
                  : <img src={u} alt="brief media" style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 10 }} />}
              </a>
            ))}
          </div>
        )}
      </Card>

      {mine && (
        <>
          <div className="cl-section-title"><h3>Offers ({pendingOffers.length} pending)</h3></div>
          {offers === null ? <SkeletonCard /> : pendingOffers.length === 0 ? (
            <EmptyState icon={MessageSquare} title="No offers yet" body="Creators will see your requirement and send proposals here." />
          ) : (
            pendingOffers.map((o) => (
              <Card key={o.id} style={{ marginBottom: 10 }}>
                <div className="cl-row" style={{ marginBottom: 8, cursor: 'pointer' }} onClick={() => { onClose(); openCreator(o.creatorId); }}>
                  <Avatar src={o.creatorPfp} name={o.creatorName} size={42} />
                  <div className="cl-grow">
                    <div className="cl-row" style={{ gap: 5 }}>
                      <strong style={{ fontSize: 14 }}>{o.creatorName}</strong>
                      {o.creatorVerified && <VerifiedTick size={14} />}
                    </div>
                    <div className="cl-small cl-muted">@{o.creatorHandle} · {timeAgo(o.createdAt)}</div>
                  </div>
                  <div className="cl-money" style={{ fontSize: 16 }}>{inr(o.price)}</div>
                </div>
                {o.message && <p className="cl-small" style={{ lineHeight: 1.6, marginBottom: 4 }}>{o.message}</p>}
                {o.timeline && <p className="cl-small cl-muted" style={{ marginBottom: 10, display: 'flex', gap: 5, alignItems: 'center' }}><Clock style={{ width: 13, height: 13 }} /> {o.timeline}</p>}
                {rejectId === o.id ? (
                  <div className="cl-row">
                    <span className="cl-small cl-muted cl-grow">Reject this offer?</span>
                    <Button size="sm" variant="ghost" onClick={() => setRejectId(null)}>Keep</Button>
                    <Button size="sm" variant="danger" loading={rejecting} onClick={() => rejectOffer(o)}>Reject</Button>
                  </div>
                ) : (
                  <div className="cl-row">
                    <Button size="sm" variant="light" onClick={() => setRejectId(o.id)}>Reject</Button>
                    <div className="cl-grow" />
                    <Button size="sm" icon={Check} onClick={() => onBookOffer(o, req)} disabled={req.status !== 'open'}>
                      Accept & book
                    </Button>
                  </div>
                )}
              </Card>
            ))
          )}
          {(offers || []).some((o) => o.status === 'accepted') && (
            <p className="cl-small cl-muted" style={{ marginTop: 8 }}>This requirement is matched — the booking is with the creator.</p>
          )}
          <div style={{ height: 14 }} />
          <Button variant="light" block icon={Trash2} onClick={() => setDeleteOpen(true)}>Delete requirement</Button>
        </>
      )}

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete requirement?"
        body="This removes the post from the marketplace. Pending offers will no longer be visible."
        confirmLabel="Delete"
        danger loading={deleting}
        onConfirm={deleteReq}
      />
    </Sheet>
  );
}

export default function RequirementsPage() {
  const { user } = useBiz();
  const [tab, setTab] = useState('browse');
  const [reqs, setReqs] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [openReq, setOpenReq] = useState(null);
  const [offerBooking, setOfferBooking] = useState(null);

  useEffect(() => {
    let unsub = () => {};
    ensureFirebase().then(({ db }) => {
      unsub = onSnapshot(
        query(collection(db, 'requirements'), orderBy('createdAt', 'desc')),
        (s) => setReqs(s.docs.map((d) => ({ id: d.id, ...d.data() }))),
        () => setReqs([])
      );
    });
    return () => unsub();
  }, []);

  const mine = useMemo(() => (reqs || []).filter((r) => r.bizId === user.uid), [reqs, user]);
  const list = tab === 'browse' ? (reqs || []) : mine;

  return (
    <Page pageKey="marketplace">
      <div className="cl-container" style={{ paddingTop: 16 }}>
        <div className="cl-row" style={{ marginBottom: 14 }}>
          <div className="cl-grow">
            <h2 style={{ fontSize: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Store style={{ width: 20, height: 20, color: 'var(--cyan-deep)' }} /> Marketplace
            </h2>
            <p className="cl-small cl-muted" style={{ marginTop: 3 }}>Post requirements — creators send you offers.</p>
          </div>
          <Button size="sm" icon={Plus} onClick={() => setCreateOpen(true)}>Post</Button>
        </div>

        <Tabs
          tabs={[{ key: 'browse', label: 'Browse all' }, { key: 'mine', label: `My posts (${mine.length})` }]}
          value={tab} onChange={setTab} style={{ marginBottom: 14 }}
        />

        {reqs === null ? <><SkeletonCard /><SkeletonCard /></> : list.length === 0 ? (
          <EmptyState
            icon={Store}
            title={tab === 'mine' ? 'No posts yet' : 'No requirements yet'}
            body={tab === 'mine'
              ? 'Post your first requirement and let creators come to you.'
              : 'Be the first to post a requirement for creators.'}
            action={<Button icon={Plus} onClick={() => setCreateOpen(true)}>Post requirement</Button>}
          />
        ) : (
          list.map((r) => (
            <RequirementCard key={r.id} req={r} mine={r.bizId === user.uid} onOpen={() => setOpenReq(r)} />
          ))
        )}
      </div>

      <CreateSheet open={createOpen} onClose={() => setCreateOpen(false)} />
      {openReq && (
        <RequirementDetail
          req={openReq}
          onClose={() => setOpenReq(null)}
          onBookOffer={(offer, req) => { setOpenReq(null); setOfferBooking({ offer, requirement: req }); }}
        />
      )}
      {offerBooking && (
        <BookFromOfferModal
          offer={offerBooking.offer}
          requirement={offerBooking.requirement}
          onClose={() => setOfferBooking(null)}
        />
      )}
    </Page>
  );
}
