/* Creator Marketplace — rebuilt against the supplied Collancer Marketplace HTML reference.
   Keeps the live Firestore briefs/proposals workflow, but uses a dedicated UI instead of legacy shared page cards. */
import React, { useMemo, useState } from 'react';
import {
  Store, Search, Bell, MoreHorizontal, Tag, Clock3, Send, BadgeCheck,
  ChevronRight, ExternalLink, FileText, Wallet, CheckCircle2, X, ArrowRight,
} from 'lucide-react';
import { ensureFirebase, db, collection, addDoc, doc, updateDoc, increment, serverTimestamp } from '../lib/firebase.js';
import { inr, timeAgo } from '../lib/format.js';
import { promoLabel } from '../lib/constants.js';
import { Page, useToast } from '../components/ui.jsx';

function statusTone(status) {
  if (status === 'accepted') return 'accepted';
  if (status === 'rejected') return 'rejected';
  if (status === 'withdrawn') return 'withdrawn';
  return 'pending';
}

export default function MarketplacePage({ creator, requirements, offers, loading }) {
  const toast = useToast();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('All');
  const [tab, setTab] = useState('browse');
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ price: '', message: '', timeline: '' });

  const categories = useMemo(() => {
    const values = new Set();
    (requirements || []).forEach((r) => r.category && values.add(r.category));
    return ['All', ...[...values].sort()];
  }, [requirements]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (requirements || [])
      .filter((r) => r.status === 'open' || r.status === 'matched')
      .filter((r) => cat === 'All' || r.category === cat)
      .filter((r) => !needle || `${r.title || ''} ${r.description || ''} ${r.bizName || ''}`.toLowerCase().includes(needle))
      .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
  }, [requirements, q, cat]);

  const myOffers = useMemo(() => [...(offers || [])].sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)), [offers]);
  const requirementById = useMemo(() => {
    const map = {};
    (requirements || []).forEach((r) => { map[r.id] = r; });
    return map;
  }, [requirements]);
  const hasOffer = (id) => myOffers.some((o) => o.requirementId === id && o.status !== 'withdrawn');

  function openBrief(brief) {
    setSelected(brief);
    setError('');
    setForm({ price: '', message: '', timeline: '' });
  }

  async function sendProposal() {
    setError('');
    if (!selected) return;
    const price = Math.round(Number(form.price));
    if (!price || price <= 0) return setError('Enter your proposed price.');
    if (form.message.trim().length < 10) return setError('Write a short pitch (at least 10 characters).');
    if (hasOffer(selected.id)) return setError('You already have an active proposal on this brief.');
    setBusy(true);
    try {
      await ensureFirebase();
      await addDoc(collection(db(), 'requirementOffers'), {
        requirementId: selected.id, bizId: selected.bizId, creatorId: creator.id,
        creatorName: creator.name, creatorHandle: creator.handle, price,
        message: form.message.trim(), timeline: form.timeline.trim(), status: 'pending',
        createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      });
      await updateDoc(doc(db(), 'requirements', selected.id), { offerCount: increment(1) });
      toast.ok('Proposal sent to the brand.');
      setSelected(null);
      setTab('offers');
    } catch (e) {
      setError('Could not send your proposal. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function withdrawProposal(offer) {
    try {
      await ensureFirebase();
      await updateDoc(doc(db(), 'requirementOffers', offer.id), { status: 'withdrawn', withdrawnAt: serverTimestamp() });
      toast.ok('Proposal withdrawn.');
    } catch (e) {
      toast.err('Could not withdraw the proposal.');
    }
  }

  return (
    <Page pageKey="creator-marketplace">
      <main className="cm-page">
        <header className="cm-head">
          <div className="cm-heading">
            <span className="cm-kicker"><span /> CREATOR MARKETPLACE</span>
            <h1>Marketplace</h1>
            <p>Brand briefs looking for creators</p>
          </div>
          <div className="cm-head-actions">
            <button className="cm-icon-button" type="button" aria-label="Notifications" onClick={() => toast.info('You can find your creator notifications from Home.')}><Bell /></button>
            <button className="cm-icon-button" type="button" aria-label="Marketplace options" onClick={() => toast.info('Marketplace options')}><MoreHorizontal /></button>
          </div>
        </header>

        <div className="cm-content">
          <div className="cm-segment" role="tablist" aria-label="Marketplace views">
            <button type="button" role="tab" aria-selected={tab === 'browse'} className={tab === 'browse' ? 'is-active' : ''} onClick={() => setTab('browse')}><Search />Browse{filtered.length ? <span>{filtered.length}</span> : null}</button>
            <button type="button" role="tab" aria-selected={tab === 'offers'} className={tab === 'offers' ? 'is-active' : ''} onClick={() => setTab('offers')}><Send />My proposals{myOffers.length ? <span>{myOffers.length}</span> : null}</button>
          </div>

          {tab === 'browse' ? (
            <section className="cm-view" key="browse">
              <label className="cm-search"><Search /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search briefs..." aria-label="Search briefs" />{q && <button type="button" aria-label="Clear search" onClick={() => setQ('')}><X /></button>}</label>
              <div className="cm-filter-row" aria-label="Filter by category">
                {categories.map((category) => <button type="button" key={category} className={cat === category ? 'cm-filter is-active' : 'cm-filter'} onClick={() => setCat(category)}>{category}</button>)}
              </div>
              <div className="cm-section-heading"><div><h2>Open opportunities</h2><p>Find a brief that fits your content.</p></div><span className="cm-count">{filtered.length}</span></div>

              {loading ? <div className="cm-empty"><span className="cm-spinner" /><h3>Loading brand briefs…</h3><p>Finding opportunities for you.</p></div> :
                filtered.length === 0 ? <div className="cm-empty"><span className="cm-empty-icon"><Store /></span><h3>{q || cat !== 'All' ? 'No matching briefs' : 'No briefs right now'}</h3><p>{q || cat !== 'All' ? 'Try another search or category filter.' : 'New brand requirements will appear here. Check back soon.'}</p>{(q || cat !== 'All') && <button className="cm-button cm-button-light" onClick={() => { setQ(''); setCat('All'); }} type="button">Clear filters</button>}</div> :
                <div className="cm-brief-list">
                  {filtered.map((brief) => (
                    <article className="cm-brief" key={brief.id} onClick={() => openBrief(brief)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openBrief(brief); } }} tabIndex={0} role="button" aria-label={`Open brief: ${brief.title || 'Brand collaboration'}`}>
                      <div className="cm-brief-top">
                        <span className="cm-brief-icon"><Tag /></span>
                        <div className="cm-brief-main"><h3>{brief.title || 'Brand collaboration'}</h3><p>{brief.bizName || 'Brand'} <span>·</span> {timeAgo(brief.createdAt)} <span>·</span> {brief.offerCount || 0} proposals</p></div>
                        <div className="cm-budget"><span>Budget</span><strong>{inr(brief.budget)}</strong></div>
                      </div>
                      {brief.description && <p className="cm-description">{brief.description}</p>}
                      <div className="cm-tags">{brief.category && <span className="cm-tag is-teal">{brief.category}</span>}{brief.promoType && <span className="cm-tag">{promoLabel(brief.promoType)}</span>}{brief.status === 'matched' && <span className="cm-tag is-amber">Matched</span>}{hasOffer(brief.id) && <span className="cm-tag is-green"><BadgeCheck /> Proposed</span>}</div>
                      <button className="cm-brief-cta" type="button" onClick={(e) => { e.stopPropagation(); openBrief(brief); }}>View brief &amp; send proposal <ArrowRight /></button>
                    </article>
                  ))}
                </div>}
            </section>
          ) : (
            <section className="cm-view" key="offers">
              <div className="cm-section-heading"><div><h2>My proposals</h2><p>Track the pitches you’ve sent to brands.</p></div><span className="cm-count">{myOffers.length}</span></div>
              {myOffers.length === 0 ? <div className="cm-empty"><span className="cm-empty-icon"><Send /></span><h3>No proposals yet</h3><p>Browse briefs and send your first proposal.</p><button type="button" className="cm-button cm-button-dark" onClick={() => setTab('browse')}>Browse briefs <ArrowRight /></button></div> :
                <div className="cm-brief-list">{myOffers.map((offer) => {
                  const brief = requirementById[offer.requirementId];
                  return <article className="cm-brief cm-offer" key={offer.id}>
                    <div className="cm-brief-top"><span className="cm-brief-icon"><Send /></span><div className="cm-brief-main"><h3>{brief?.title || 'Brand requirement'}</h3><p>{brief?.bizName || 'Brand'} <span>·</span> Sent {timeAgo(offer.createdAt)}</p></div><span className={`cm-status cm-status-${statusTone(offer.status)}`}>{offer.status || 'pending'}</span></div>
                    <div className="cm-offer-price"><span>Your proposed price</span><strong>{inr(offer.price)}</strong>{offer.timeline && <span className="cm-timeline"><Clock3 />{offer.timeline}</span>}</div>
                    {offer.message && <p className="cm-pitch">{offer.message}</p>}
                    {offer.status === 'pending' && <button className="cm-withdraw" type="button" onClick={() => withdrawProposal(offer)}>Withdraw proposal</button>}
                  </article>;
                })}</div>}
            </section>
          )}
        </div>
      </main>

      {selected && <div className="cm-overlay" role="presentation" onClick={() => setSelected(null)}>
        <section className="cm-sheet" role="dialog" aria-modal="true" aria-labelledby="cm-dialog-title" onClick={(e) => e.stopPropagation()}>
          <div className="cm-sheet-grab" />
          <button className="cm-sheet-close" type="button" aria-label="Close brief" onClick={() => setSelected(null)}><X /></button>
          <div className="cm-sheet-head"><span className="cm-brief-icon"><Tag /></span><div className="cm-sheet-title"><h2 id="cm-dialog-title">{selected.title || 'Brand collaboration'}</h2><p>{selected.bizName || 'Brand'} · Posted {timeAgo(selected.createdAt)}</p></div><div className="cm-budget"><span>Budget</span><strong>{inr(selected.budget)}</strong></div></div>
          <div className="cm-tags cm-sheet-tags">{selected.category && <span className="cm-tag is-teal">{selected.category}</span>}{selected.promoType && <span className="cm-tag">{promoLabel(selected.promoType)}</span>}{selected.status === 'matched' && <span className="cm-tag is-amber">Matched</span>}</div>
          {selected.description && <p className="cm-sheet-description">{selected.description}</p>}
          {Array.isArray(selected.mediaFiles) && selected.mediaFiles.length > 0 && <div className="cm-media-links">{selected.mediaFiles.slice(0, 4).map((media, i) => <a key={i} href={typeof media === 'string' ? media : media.url} target="_blank" rel="noreferrer"><ExternalLink />Brief media {i + 1}</a>)}</div>}
          <div className="cm-divider" />
          <div className="cm-form-title"><div><h3>Send proposal</h3><p>Introduce your content and quote your rate.</p></div><FileText /></div>
          {hasOffer(selected.id) ? <div className="cm-already"><CheckCircle2 /><div><strong>Proposal already sent</strong><p>Track your existing proposal under My proposals.</p></div></div> : <>
            <label className="cm-field"><span>Your price (₹)</span><input inputMode="numeric" type="number" min="1" value={form.price} onChange={(e) => setForm((prev) => ({ ...prev, price: e.target.value }))} placeholder="e.g. 8000" /></label>
            <label className="cm-field"><span>Pitch message</span><textarea value={form.message} onChange={(e) => setForm((prev) => ({ ...prev, message: e.target.value }))} placeholder="Hi! I create engaging reels for an audience interested in…" rows={4} /><small>Why are you the right creator for this brief?</small></label>
            <label className="cm-field"><span>Timeline (optional)</span><div className="cm-input-icon"><Clock3 /><input value={form.timeline} onChange={(e) => setForm((prev) => ({ ...prev, timeline: e.target.value }))} placeholder="e.g. 5 days" /></div></label>
            {error && <p className="cm-error">{error}</p>}
            <button className="cm-button cm-button-dark cm-submit" type="button" onClick={sendProposal} disabled={busy}>{busy ? <span className="cm-spinner cm-spinner-small" /> : <Send />} {busy ? 'Sending proposal…' : 'Send proposal'}</button>
            <p className="cm-note"><Wallet />If the brand accepts, a booking is created and you can review it in your Bookings inbox.</p>
          </>}
        </section>
      </div>}
    </Page>
  );
}
