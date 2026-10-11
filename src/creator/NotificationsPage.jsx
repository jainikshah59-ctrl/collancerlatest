/* Creator notifications — real-time creatorNotifs (audit §7.12).
   Loads ALL notifications (no unread-only filter — avoids the read-state race);
   client-side Set tracks genuinely new IDs; mark one/all read; open related booking. */
import React, { useMemo, useRef, useState } from 'react';
import { Bell, ArrowLeft, CheckCheck, CalendarCheck, ChevronRight } from 'lucide-react';
import { ensureFirebase, db, doc, updateDoc, serverTimestamp } from '../lib/firebase.js';
import { timeAgo } from '../lib/format.js';
import {
  Page, TopBar, IconBtn, Card, Button, Badge, EmptyState, Tabs, useToast,
} from '../components/ui.jsx';

const TYPE_TONE = {
  booking_received: 'amber', verification_approved: 'green', verification_rejected: 'red',
  payment_approved: 'green', completion_rejected: 'red', payout_approved: 'cyan',
  payout_rejected: 'red', payout_paid: 'green', offer_rejected: 'red', ad_success: 'cyan',
  video_removed: 'red', chat_message: 'cyan',
};

function typeLabel(t) {
  return String(t || 'update').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function NotificationsPage({ notifs, loading, onBack, onOpenBooking }) {
  const toast = useToast();
  const [filter, setFilter] = useState('all');
  const [busyAll, setBusyAll] = useState(false);
  // Client-side Set of seen IDs to identify genuinely new notifications (audit §7.12).
  const seenRef = useRef(new Set());

  const sorted = useMemo(() => {
    const arr = [...(notifs || [])].sort((a, b) => {
      const x = a.createdAt?.seconds || 0, y = b.createdAt?.seconds || 0;
      return y - x;
    });
    arr.forEach((n) => seenRef.current.add(n.id));
    return arr;
  }, [notifs]);

  const list = filter === 'unread' ? sorted.filter((n) => !n.read) : sorted;
  const unreadCount = sorted.filter((n) => !n.read).length;

  async function markRead(n) {
    if (n.read) return;
    try {
      await ensureFirebase();
      await updateDoc(doc(db(), 'creatorNotifs', n.id), { read: true, readAt: serverTimestamp() });
    } catch (e) { /* best-effort */ }
  }

  async function markAll() {
    const unread = sorted.filter((n) => !n.read);
    if (!unread.length) return;
    setBusyAll(true);
    try {
      await ensureFirebase();
      await Promise.allSettled(unread.map((n) =>
        updateDoc(doc(db(), 'creatorNotifs', n.id), { read: true, readAt: serverTimestamp() }),
      ));
      toast.ok('All notifications marked as read.');
    } catch (e) {
      toast.err('Could not mark all as read.');
    } finally {
      setBusyAll(false);
    }
  }

  function open(n) {
    markRead(n);
    if (n.bookingId) onOpenBooking?.(n.bookingId);
  }

  return (
    <Page pageKey="creator-notifications">
      <TopBar title="Notifications" subtitle={unreadCount ? `${unreadCount} unread` : 'All caught up'}
        left={<IconBtn icon={ArrowLeft} label="Back" onClick={onBack} />}
        right={unreadCount > 0 ? (
          <Button variant="ghost" size="sm" loading={busyAll} onClick={markAll} icon={CheckCheck}>Mark all read</Button>
        ) : null}
      />
      <div className="cl-container" style={{ paddingTop: 14, paddingBottom: 24 }}>
        <Tabs
          tabs={[
            { key: 'all', label: `All${sorted.length ? ` (${sorted.length})` : ''}` },
            { key: 'unread', label: `Unread${unreadCount ? ` (${unreadCount})` : ''}` },
          ]}
          value={filter} onChange={setFilter} style={{ marginBottom: 14 }}
        />
        {loading ? (
          <Card><div className="cl-small cl-muted">Loading notifications…</div></Card>
        ) : list.length === 0 ? (
          <EmptyState icon={Bell} title={filter === 'unread' ? 'No unread notifications' : 'No notifications yet'}
            body="Booking requests, verification decisions, payouts and review updates will appear here." />
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {list.map((n) => (
              <Card key={n.id} pressable={!!n.bookingId} onClick={() => open(n)}
                style={{
                  padding: 14,
                  borderLeft: n.read ? undefined : '3px solid var(--cyan)',
                  background: n.read ? undefined : 'var(--cyan-soft)',
                }}>
                <div className="cl-row" style={{ gap: 10, alignItems: 'flex-start' }}>
                  <div className="cl-grow" style={{ minWidth: 0 }}>
                    <div className="cl-row" style={{ gap: 8, marginBottom: 4 }}>
                      <Badge tone={TYPE_TONE[n.type] || 'grey'}>{typeLabel(n.type)}</Badge>
                      <span className="cl-small cl-muted">{timeAgo(n.createdAt)}</span>
                    </div>
                    <div style={{ fontWeight: n.read ? 600 : 800, fontSize: 14 }}>{n.title || typeLabel(n.type)}</div>
                    {n.body && (
                      <p className="cl-small cl-muted" style={{ marginTop: 4, lineHeight: 1.6 }}>{n.body}</p>
                    )}
                  </div>
                  {n.bookingId && <ChevronRight style={{ width: 17, height: 17, color: 'var(--faint)', flexShrink: 0, marginTop: 4 }} />}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </Page>
  );
}
