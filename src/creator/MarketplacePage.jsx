/* Creator Requirements Marketplace — browse open/matched briefs, submit proposals.
   Per audit §9.2: offer -> requirementOffers/{autoId} + increment requirements.offerCount.
   Marketplace access is a Creator Pro feature (audit §7.13) — gated with upsell. */
import React, { useMemo, useState } from 'react';
import {
  Store, ArrowLeft, Search as SearchIcon, Tag, Wallet, Clock3, Send,
  BadgeCheck, Crown, ChevronRight, ExternalLink, FileText,
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

export default function MarketplacePage({ creator, requirements, offers, loading, onBack, onGoPro }) {
  const toast = useToast();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('All');
  const [tab, setTab] = useState('browse');
  const [sel, setSel] = useState(null); // selected requirement
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [form, setForm] = useState({ price: '', message: '', timeline: '' });

  const isPro = !!creator?.creatorIsPro;

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
      .filter((r) => !needle || `${r.title} ${r.description} ${r.bizName}`.toLowerCase().includes(needle))
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
      <TopBar title="Marketplace" subtitle="Brand briefs looking for creators"
        left={onBack ? <IconBtn icon={ArrowLeft} label="Back" onClick={onBack} /> : null} />
      <div className="cl-container" style={{ paddingTop: 14, paddingBottom: 24 }}>
        {!isPro ? (
          <Card className="cl-glass" style={{ textAlign: 'center', padding: 28, borderColor: 'var(--cyan)' }}>
            <Crown style={{ width: 40, height: 40, color: 'var(--cyan-deep)', margin: '0 auto 12px' }} />
            <h3 style={{ fontSize: 18, marginBottom: 6 }}>Marketplace is a Pro feature</h3>
            <p className="cl-small cl-muted" style={{ lineHeight: 1.65, marginBottom: 16 }}>
              Upgrade to Creator Pro to browse brand requirements, pitch proposals directly,
              unlock Personal Ad shoots and show discounted pricing.
            </p>
            <Button size="lg" onClick={onGoPro} icon={Crown}>View Creator Pro</Button>
          </Card>
        ) : (
          <>
            <Tabs
              tabs={[
                { key: 'browse', label: `Browse${filtered.length ? ` (${filtered.length})` : ''}` },
                { key: 'offers', label: `My proposals${myOffers.length ? ` (${myOffers.length})` : ''}` },
              ]}
              value={tab} onChange={setTab} style={{ marginBottom: 14 }}
            />
            {tab === 'browse' && (
              <div className="cl-fade">
                <SearchInput value={q} onChange={setQ} placeholder="Search briefs…" style={{ marginBottom: 10 }} />
                <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4, marginBottom: 12, scrollbarWidth: 'none' }}>
                  {cats.map((c) => (
                    <Chip key={c} on={cat === c} cyan={cat === c} onClick={() => setCat(c)}>{c}</Chip>
                  ))}
                </div>
                {loading ? (
                  <Card><div className="cl-small cl-muted">Loading briefs…</div></Card>
                ) : filtered.length === 0 ? (
                  <EmptyState icon={Store} title="No briefs right now"
                    body="New brand requirements appear here. Check back soon." />
                ) : (
                  <div style={{ display: 'grid', gap: 10 }}>
                    {filtered.map((r) => (
                      <Card key={r.id} pressable onClick={() => openReq(r)} style={{ padding: 14 }}>
                        <div className="cl-row" style={{ gap: 10, alignItems: 'flex-start' }}>
                          <div className="cl-grow" style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 700, fontSize: 14.5 }}>{r.title}</div>
                            <div className="cl-small cl-muted" style={{ marginTop: 3 }}>
                              {r.bizName || 'Brand'} · {timeAgo(r.createdAt)} · {r.offerCount || 0} proposals
                            </div>
                            <div className="cl-row" style={{ gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                              {r.category && <Chip cyan icon={Tag}>{r.category}</Chip>}
                              {r.promoType && <Chip>{promoLabel(r.promoType)}</Chip>}
                              {r.status === 'matched' && <Badge tone="amber">Matched</Badge>}
                              {alreadyOffered(r.id) && <Badge tone="green" icon={BadgeCheck}>Proposed</Badge>}
                            </div>
                          </div>
                          <div style={{ textAlign: 'right', flexShrink: 0 }}>
                            <div className="cl-small cl-muted">Budget</div>
                            <div className="cl-money" style={{ color: 'var(--cyan-deep)', fontSize: 15 }}>{inr(r.budget)}</div>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            )}
            {tab === 'offers' && (
              <div className="cl-fade" style={{ display: 'grid', gap: 10 }}>
                {myOffers.length === 0 ? (
                  <EmptyState icon={Send} title="No proposals yet"
                    body="Browse briefs and send your first proposal." />
                ) : myOffers.map((o) => {
                  const r = reqById[o.requirementId];
                  return (
                    <Card key={o.id} style={{ padding: 14 }}>
                      <div className="cl-row" style={{ gap: 10, alignItems: 'flex-start' }}>
                        <div className="cl-grow" style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: 14 }}>{r?.title || 'Requirement'}</div>
                          <div className="cl-small cl-muted" style={{ marginTop: 3 }}>
                            Proposed {inr(o.price)}{o.timeline ? ` · ${o.timeline}` : ''} · {timeAgo(o.createdAt)}
                          </div>
                          {o.message && (
                            <p className="cl-small" style={{ marginTop: 8, lineHeight: 1.6 }}>{o.message}</p>
                          )}
                          {o.status === 'pending' && (
                            <button className="cl-link" style={{ border: 0, background: 'none', cursor: 'pointer', marginTop: 8, padding: 0 }}
                              onClick={() => withdrawOffer(o)}>
                              Withdraw proposal
                            </button>
                          )}
                        </div>
                        <Badge tone={offerTone(o.status)}>{o.status}</Badge>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      {/* Requirement detail + proposal sheet */}
      <Sheet open={!!sel} onClose={() => setSel(null)} labelledBy="requirement-detail">
        {sel && (
          <div>
            <div className="cl-row" style={{ gap: 10, alignItems: 'flex-start', marginBottom: 10 }}>
              <div className="cl-grow">
                <h3 style={{ fontSize: 18 }}>{sel.title}</h3>
                <div className="cl-small cl-muted" style={{ marginTop: 4 }}>
                  {sel.bizName || 'Brand'} · posted {timeAgo(sel.createdAt)}
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div className="cl-small cl-muted">Budget</div>
                <div className="cl-money" style={{ fontSize: 18, color: 'var(--cyan-deep)' }}>{inr(sel.budget)}</div>
              </div>
            </div>
            <div className="cl-row" style={{ gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
              {sel.category && <Chip cyan icon={Tag}>{sel.category}</Chip>}
              {sel.promoType && <Chip>{promoLabel(sel.promoType)}</Chip>}
              {sel.status === 'matched' && <Badge tone="amber">Matched</Badge>}
            </div>
            {sel.description && (
              <p className="cl-small" style={{ lineHeight: 1.7, marginBottom: 12 }}>{sel.description}</p>
            )}
            {Array.isArray(sel.mediaFiles) && sel.mediaFiles.length > 0 && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                {sel.mediaFiles.slice(0, 4).map((m, i) => (
                  <a key={i} href={typeof m === 'string' ? m : m.url} target="_blank" rel="noreferrer"
                    className="cl-chip cyan" style={{ textDecoration: 'none' }}>
                    <ExternalLink style={{ width: 13, height: 13 }} /> Brief media {i + 1}
                  </a>
                ))}
              </div>
            )}
            <div className="cl-divider" />
            <h3 style={{ fontSize: 15, marginBottom: 10 }}>Send proposal</h3>
            {alreadyOffered(sel.id) ? (
              <Card style={{ background: 'var(--surface-2)' }}>
                <div className="cl-row" style={{ gap: 10 }}>
                  <BadgeCheck style={{ width: 20, height: 20, color: 'var(--green)', flexShrink: 0 }} />
                  <div className="cl-small" style={{ lineHeight: 1.6 }}>
                    You already have an active proposal on this brief. Track it under My proposals.
                  </div>
                </div>
              </Card>
            ) : (
              <>
                <Field label="Your price">
                  <Input value={form.price} onChange={(e) => setForm((p) => ({ ...p, price: e.target.value }))}
                    placeholder="e.g. 8000" inputMode="numeric" />
                </Field>
                <Field label="Pitch message" hint="Why are you the right creator for this brief?">
                  <TextArea value={form.message} onChange={(e) => setForm((p) => ({ ...p, message: e.target.value }))}
                    placeholder="Hi! I create fashion reels for 40K followers…" />
                </Field>
                <Field label="Timeline (optional)">
                  <div style={{ position: 'relative' }}>
                    <Clock3 style={{ position: 'absolute', left: 13, top: 14, width: 16, height: 16, color: 'var(--faint)' }} />
                    <Input value={form.timeline} onChange={(e) => setForm((p) => ({ ...p, timeline: e.target.value }))}
                      placeholder="e.g. 5 days" style={{ paddingLeft: 38 }} />
                  </div>
                </Field>
                {err && <div className="cl-error-text" style={{ marginBottom: 12 }}>{err}</div>}
                <Button block size="lg" loading={busy} onClick={submitOffer} icon={Send}>
                  Send proposal
                </Button>
                <p className="cl-small cl-muted" style={{ textAlign: 'center', marginTop: 10, lineHeight: 1.6 }}>
                  <FileText style={{ width: 13, height: 13, verticalAlign: -2 }} /> If the brand accepts, a booking is
                  created and you accept it from your Bookings inbox.
                </p>
              </>
            )}
          </div>
        )}
      </Sheet>
    </Page>
  );
}
