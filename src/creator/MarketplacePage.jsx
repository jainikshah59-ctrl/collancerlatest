/* Creator Marketplace — open to all creators.
   Browse open/matched brand briefs, submit proposals, and manage proposal status.
   Uses the existing requirementOffers + requirements data model and live listeners. */
import React, { useMemo, useState } from 'react';
import {
  Store, ArrowLeft, Search as SearchIcon, Tag, Clock3, Send, BadgeCheck,
  ChevronRight, ExternalLink, FileText, Sparkles, Wallet, CheckCircle2,
} from 'lucide-react';
import {
  ensureFirebase, db, collection, addDoc, doc, updateDoc, increment, serverTimestamp,
} from '../lib/firebase.js';
import { inr, timeAgo } from '../lib/format.js';
import { promoLabel } from '../lib/constants.js';
import {
  Page, TopBar, IconBtn, Card, Button, Badge, Chip, Field, Input, TextArea,
  SearchInput, EmptyState, useToast, Sheet, Tabs,
} from '../components/ui.jsx';

function offerTone(s) {
  if (s === 'accepted') return 'green';
  if (s === 'rejected') return 'red';
  if (s === 'withdrawn') return 'grey';
  return 'amber';
}

export default function MarketplacePage({ creator, requirements, offers, loading, onBack }) {
  const toast = useToast();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('All');
  const [tab, setTab] = useState('browse');
  const [sel, setSel] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [form, setForm] = useState({ price: '', message: '', timeline: '' });

  const cats = useMemo(() => {
    const s = new Set();
    (requirements || []).forEach((r) => r.category && s.add(r.category));
    return ['All', ...[...s].sort()];
  }, [requirements]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (requirements || [])
      .filter((r) => r.status === 'open' || r.status === 'matched')
      .filter((r) => (cat === 'All' ? true : r.category === cat))
      .filter((r) => !needle || `${r.title || ''} ${r.description || ''} ${r.bizName || ''}`.toLowerCase().includes(needle))
      .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
  }, [requirements, q, cat]);

  const myOffers = useMemo(
    () => [...(offers || [])].sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)),
    [offers],
  );
  const reqById = useMemo(() => {
    const m = {};
    (requirements || []).forEach((r) => { m[r.id] = r; });
    return m;
  }, [requirements]);
  const alreadyOffered = (reqId) => myOffers.some((o) => o.requirementId === reqId && o.status !== 'withdrawn');

  function openReq(r) {
    setSel(r);
    setErr('');
    setForm({ price: '', message: '', timeline: '' });
  }

  async function submitOffer() {
    setErr('');
    if (!sel) return;
    const price = Math.round(Number(form.price));
    if (!price || price <= 0) return setErr('Enter your proposed price.');
    if (form.message.trim().length < 10) return setErr('Write a short pitch (min 10 characters).');
    if (alreadyOffered(sel.id)) return setErr('You already have an active proposal on this brief.');
    setBusy(true);
    try {
      await ensureFirebase();
      await addDoc(collection(db(), 'requirementOffers'), {
        requirementId: sel.id,
        bizId: sel.bizId,
        creatorId: creator.id,
        creatorName: creator.name,
        creatorHandle: creator.handle,
        price,
        message: form.message.trim(),
        timeline: form.timeline.trim(),
        status: 'pending',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await updateDoc(doc(db(), 'requirements', sel.id), { offerCount: increment(1) });
      toast.ok('Proposal sent to the brand.');
      setSel(null);
      setTab('offers');
    } catch (e) {
      setErr('Could not send your proposal. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function withdrawOffer(o) {
    try {
      await ensureFirebase();
      await updateDoc(doc(db(), 'requirementOffers', o.id), { status: 'withdrawn', withdrawnAt: serverTimestamp() });
      toast.ok('Proposal withdrawn.');
    } catch (e) {
      toast.err('Could not withdraw the proposal.');
    }
  }

  return (
    <Page pageKey="creator-marketplace">
      <div className="cl-marketplace">
        <TopBar title="Marketplace" subtitle="Brand briefs looking for creators"
          left={onBack ? <IconBtn icon={ArrowLeft} label="Back" onClick={onBack} /> : <span className="cl-marketplace-mark"><Store /></span>} />
        <div className="cl-container cl-marketplace-content">
          <section className="cl-marketplace-intro cl-glass">
            <div className="cl-marketplace-intro-icon"><Sparkles aria-hidden="true" /></div>
            <div className="cl-marketplace-intro-copy">
              <div className="cl-marketplace-eyebrow">CREATOR OPPORTUNITIES</div>
              <h2>Find your next brand collaboration.</h2>
              <p>Explore briefs, pitch your value, and keep every proposal in one place.</p>
            </div>
            <div className="cl-marketplace-orbit" aria-hidden="true"><span /><span /><span /></div>
          </section>

          <Tabs className="cl-marketplace-tabs" tabs={[
            { key: 'browse', label: `Browse briefs${filtered.length ? ` · ${filtered.length}` : ''}`, icon: SearchIcon },
            { key: 'offers', label: `My proposals${myOffers.length ? ` · ${myOffers.length}` : ''}`, icon: Send },
          ]} value={tab} onChange={setTab} style={{ margin: '16px 0 14px' }} />

          {tab === 'browse' && (
            <div className="cl-marketplace-list cl-fade">
              <SearchInput value={q} onChange={setQ} placeholder="Search brands, briefs or categories…" style={{ marginBottom: 12 }} />
              <div className="cl-marketplace-filters" aria-label="Filter by category">
                {cats.map((c) => <Chip key={c} on={cat === c} cyan={cat === c} onClick={() => setCat(c)}>{c}</Chip>)}
              </div>
              <div className="cl-marketplace-results-head">
                <div><h3>Open opportunities</h3><p>Choose a brief that fits your content.</p></div>
                <span className="cl-marketplace-count">{filtered.length}</span>
              </div>
              {loading ? (
                <Card className="cl-glass cl-marketplace-empty"><div className="cl-marketplace-loading"><span className="cl-marketplace-spinner" />Loading brand briefs…</div></Card>
              ) : filtered.length === 0 ? (
                <EmptyState icon={Store} title={q || cat !== 'All' ? 'No matching briefs' : 'No briefs right now'}
                  body={q || cat !== 'All' ? 'Try another search or category filter.' : 'New brand requirements will appear here. Check back soon.'} />
              ) : (
                <div className="cl-marketplace-cards">
                  {filtered.map((r) => (
                    <Card key={r.id} className="cl-glass cl-marketplace-brief" pressable onClick={() => openReq(r)}>
                      <div className="cl-marketplace-brief-top">
                        <div className="cl-marketplace-brand-icon"><Tag aria-hidden="true" /></div>
                        <div className="cl-marketplace-brief-main">
                          <div className="cl-marketplace-brief-title">{r.title || 'Brand collaboration'}</div>
                          <div className="cl-marketplace-brief-meta">{r.bizName || 'Brand'} <span>·</span> {timeAgo(r.createdAt)} <span>·</span> {r.offerCount || 0} proposals</div>
                        </div>
                        <ChevronRight className="cl-marketplace-chevron" aria-hidden="true" />
                      </div>
                      {r.description && <p className="cl-marketplace-description">{r.description}</p>}
                      <div className="cl-marketplace-brief-bottom">
                        <div className="cl-marketplace-tags">
                          {r.category && <Chip cyan icon={Tag}>{r.category}</Chip>}
                          {r.promoType && <Chip>{promoLabel(r.promoType)}</Chip>}
                          {r.status === 'matched' && <Badge tone="amber">Matched</Badge>}
                          {alreadyOffered(r.id) && <Badge tone="green" icon={BadgeCheck}>Proposed</Badge>}
                        </div>
                        <div className="cl-marketplace-budget"><span>Budget</span><strong>{inr(r.budget)}</strong></div>
                      </div>
                      <div className="cl-marketplace-brief-action"><span>View brief & send proposal</span><Send aria-hidden="true" /></div>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'offers' && (
            <div className="cl-marketplace-cards cl-fade">
              <div className="cl-marketplace-results-head">
                <div><h3>Your proposals</h3><p>Track the pitches you have sent to brands.</p></div>
                <span className="cl-marketplace-count">{myOffers.length}</span>
              </div>
              {myOffers.length === 0 ? (
                <Card className="cl-glass cl-marketplace-empty">
                  <div className="cl-marketplace-empty-icon"><Send /></div>
                  <h3>No proposals yet</h3>
                  <p>Browse open briefs and send your first proposal to a brand.</p>
                  <Button onClick={() => setTab('browse')} icon={SearchIcon}>Browse briefs</Button>
                </Card>
              ) : myOffers.map((o) => {
                const r = reqById[o.requirementId];
                return (
                  <Card key={o.id} className="cl-glass cl-marketplace-offer">
                    <div className="cl-marketplace-offer-head">
                      <div className="cl-marketplace-brand-icon small"><Send aria-hidden="true" /></div>
                      <div className="cl-grow"><h3>{r?.title || 'Brand requirement'}</h3><p>{r?.bizName || 'Brand'} · Sent {timeAgo(o.createdAt)}</p></div>
                      <Badge tone={offerTone(o.status)}>{o.status}</Badge>
                    </div>
                    <div className="cl-marketplace-offer-price"><span>Your proposed price</span><strong>{inr(o.price)}</strong>{o.timeline && <span className="cl-marketplace-timeline"><Clock3 />{o.timeline}</span>}</div>
                    {o.message && <p className="cl-marketplace-pitch">{o.message}</p>}
                    {o.status === 'pending' && <button className="cl-marketplace-withdraw" onClick={() => withdrawOffer(o)}>Withdraw proposal</button>}
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <Sheet open={!!sel} onClose={() => setSel(null)} labelledBy="requirement-detail">
        {sel && (
          <div className="cl-marketplace-sheet">
            <div className="cl-marketplace-sheet-head">
              <div className="cl-marketplace-brand-icon"><Tag aria-hidden="true" /></div>
              <div className="cl-grow"><h2 id="requirement-detail">{sel.title}</h2><p>{sel.bizName || 'Brand'} · Posted {timeAgo(sel.createdAt)}</p></div>
              <div className="cl-marketplace-budget"><span>Budget</span><strong>{inr(sel.budget)}</strong></div>
            </div>
            <div className="cl-marketplace-tags cl-marketplace-sheet-tags">
              {sel.category && <Chip cyan icon={Tag}>{sel.category}</Chip>}
              {sel.promoType && <Chip>{promoLabel(sel.promoType)}</Chip>}
              {sel.status === 'matched' && <Badge tone="amber">Matched</Badge>}
            </div>
            {sel.description && <p className="cl-marketplace-sheet-description">{sel.description}</p>}
            {Array.isArray(sel.mediaFiles) && sel.mediaFiles.length > 0 && (
              <div className="cl-marketplace-media">
                {sel.mediaFiles.slice(0, 4).map((m, i) => <a key={i} href={typeof m === 'string' ? m : m.url} target="_blank" rel="noreferrer"><ExternalLink />Brief media {i + 1}</a>)}
              </div>
            )}
            <div className="cl-marketplace-sheet-divider" />
            <div className="cl-marketplace-form-title"><div><h3>Send proposal</h3><p>Introduce your content and quote your rate.</p></div><span><FileText /></span></div>
            {alreadyOffered(sel.id) ? (
              <Card className="cl-marketplace-already"><CheckCircle2 /><div><strong>Proposal already sent</strong><p>You already have an active proposal for this brief. Track it under My proposals.</p></div></Card>
            ) : (
              <>
                <Field label="Your price (₹)">
                  <Input value={form.price} onChange={(e) => setForm((p) => ({ ...p, price: e.target.value }))} placeholder="e.g. 8000" inputMode="numeric" />
                </Field>
                <Field label="Pitch message" hint="Tell the brand why your content is a good fit (at least 10 characters).">
                  <TextArea value={form.message} onChange={(e) => setForm((p) => ({ ...p, message: e.target.value }))} placeholder="Hi! I create engaging reels for an audience interested in…" />
                </Field>
                <Field label="Timeline (optional)">
                  <div className="cl-marketplace-timeline-input"><Clock3 /><Input value={form.timeline} onChange={(e) => setForm((p) => ({ ...p, timeline: e.target.value }))} placeholder="e.g. 5 days" /></div>
                </Field>
                {err && <div className="cl-error-text" style={{ marginBottom: 12 }}>{err}</div>}
                <Button block size="lg" loading={busy} onClick={submitOffer} icon={Send}>Send proposal</Button>
                <p className="cl-marketplace-note"><Wallet />If the brand accepts, a booking is created and you can review it in your Bookings inbox.</p>
              </>
            )}
          </div>
        )}
      </Sheet>
    </Page>
  );
}
