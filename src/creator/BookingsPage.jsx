/* Creator bookings inbox — filters + real-time list, newest first.
   Per audit §7.6: unseen Pending bookings are marked seenByCreator on open. */
import React, { useEffect, useMemo, useState } from 'react';
import { CalendarCheck, Hourglass, ArrowLeft } from 'lucide-react';
import { ensureFirebase, db, doc, updateDoc } from '../lib/firebase.js';
import { Page, TopBar, IconBtn, Card, Tabs, EmptyState, Badge, SkeletonCard } from '../components/ui.jsx';
import { inr, timeAgo, fmtDate } from '../lib/format.js';
import { creatorShareOf, BOOKING_STATUS } from '../lib/constants.js';

const FILTERS = [
  { key: 'All', label: 'All' },
  { key: BOOKING_STATUS.PENDING, label: 'Pending' },
  { key: BOOKING_STATUS.ACTIVE, label: 'Active' },
  { key: BOOKING_STATUS.PENDING_COMPLETION, label: 'In review' },
  { key: BOOKING_STATUS.COMPLETED, label: 'Completed' },
  { key: BOOKING_STATUS.CANCELLED, label: 'Cancelled' },
];

function statusTone(s) {
  if (s === BOOKING_STATUS.PENDING) return 'amber';
  if (s === BOOKING_STATUS.ACTIVE) return 'cyan';
  if (s === BOOKING_STATUS.PENDING_COMPLETION) return 'violet';
  if (s === BOOKING_STATUS.COMPLETED) return 'green';
  return 'red';
}

function statusLabel(s) {
  if (s === BOOKING_STATUS.PENDING_COMPLETION) return 'In review';
  return s;
}

function tsMs(ts) {
  if (!ts) return 0;
  return ts.seconds ? ts.seconds * 1000 : Number(ts) || 0;
}

export default function BookingsPage({ bookings, loading, onBack, onOpen }) {
  const [filter, setFilter] = useState('All');

  // Mark unseen Pending bookings as seen when the inbox opens (audit §7.6).
  // Runs once bookings have loaded so late-arriving snapshots are still caught.
  const markedRef = React.useRef(false);
  useEffect(() => {
    if (markedRef.current || !(bookings || []).length) return;
    markedRef.current = true;
    let cancelled = false;
    (async () => {
      try {
        await ensureFirebase();
        const unseen = (bookings || []).filter((b) => b.status === BOOKING_STATUS.PENDING && !b.seenByCreator);
        if (!unseen.length || cancelled) return;
        await Promise.allSettled(unseen.map((b) => updateDoc(doc(db(), 'bookings', b.id), { seenByCreator: true })));
      } catch (e) { /* best-effort */ }
    })();
    return () => { cancelled = true; };
  }, [bookings]);

  const list = useMemo(() => {
    const arr = [...(bookings || [])].sort((a, b) => tsMs(b.createdAt) - tsMs(a.createdAt));
    return filter === 'All' ? arr : arr.filter((b) => b.status === filter);
  }, [bookings, filter]);

  const counts = useMemo(() => {
    const c = { All: (bookings || []).length };
    FILTERS.slice(1).forEach((f) => { c[f.key] = (bookings || []).filter((b) => b.status === f.key).length; });
    return c;
  }, [bookings]);

  return (
    <Page pageKey="creator-bookings">
      <TopBar title="Bookings" subtitle={`${counts.All} total`} left={onBack ? <IconBtn icon={ArrowLeft} label="Back" onClick={onBack} /> : null} />
      <div className="cl-container" style={{ paddingTop: 14, paddingBottom: 24 }}>
        <Tabs
          tabs={FILTERS.map((f) => ({ key: f.key, label: counts[f.key] ? `${f.label} (${counts[f.key]})` : f.label }))}
          value={filter}
          onChange={setFilter}
          style={{ marginBottom: 14 }}
        />
        {loading ? (
          <div style={{ display: 'grid', gap: 10 }}><SkeletonCard /><SkeletonCard /></div>
        ) : list.length === 0 ? (
          <EmptyState
            icon={filter === BOOKING_STATUS.PENDING ? Hourglass : CalendarCheck}
            title={filter === 'All' ? 'No bookings yet' : `No ${statusLabel(filter).toLowerCase()} bookings`}
            body={filter === 'All'
              ? 'When a brand sends you a collaboration request, it will appear here.'
              : 'Nothing in this state right now.'}
          />
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {list.map((b) => {
              const isBarter = Number(b.amount || 0) === 0 || b.paymentStatus === 'not_required';
              return (
                <Card key={b.id} pressable onClick={() => onOpen(b.id)} style={{ padding: 14, position: 'relative' }}>
                  {b.lastMessageFrom === 'brand' && (b.lastMessageAt?.toMillis?.() || 0) > (b.creatorChatReadAt?.toMillis?.() || 0) && (
                    <span style={{
                      position: 'absolute', top: 12, right: 12, width: 12, height: 12, borderRadius: '50%',
                      background: 'linear-gradient(135deg, var(--red), var(--danger))',
                      border: '2px solid var(--surface)', boxShadow: '0 2px 8px var(--red-soft)',
                      animation: 'cl-pulse-red 1.6s ease-in-out infinite',
                    }} aria-hidden="true" />
                  )}
                  <div className="cl-row" style={{ gap: 12, alignItems: 'flex-start' }}>
                    <div className="cl-grow" style={{ minWidth: 0 }}>
                      <div className="cl-row" style={{ gap: 8 }}>
                        <div style={{ fontWeight: 700, fontSize: 14.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {b.campaignName || b.productName || 'Collaboration'}
                        </div>
                        {b.status === BOOKING_STATUS.PENDING && !b.seenByCreator && (
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--cyan)', flexShrink: 0 }} />
                        )}
                      </div>
                      <div className="cl-small cl-muted" style={{ marginTop: 4, lineHeight: 1.5 }}>
                        {b.bizName || 'Brand'}
                        {b.fromMarketplace ? ' · via Marketplace' : ''}
                        {' · '}{timeAgo(b.createdAt)}
                      </div>
                      <div className="cl-row" style={{ gap: 8, marginTop: 8 }}>
                        <Badge tone={statusTone(b.status)}>{statusLabel(b.status)}</Badge>
                        {isBarter
                          ? <Badge tone="grey">Barter</Badge>
                          : <span className="cl-small cl-money">{inr(b.creatorPrice ?? b.amount)}</span>}
                      </div>
                    </div>
                    <div className="cl-small cl-muted" style={{ flexShrink: 0, textAlign: 'right' }}>
                      <div>You earn</div>
                      <div className="cl-money" style={{ color: 'var(--cyan-deep)', fontSize: 14 }}>
                        {isBarter ? '—' : inr(creatorShareOf(b))}
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </Page>
  );
}

export { statusTone, statusLabel };
