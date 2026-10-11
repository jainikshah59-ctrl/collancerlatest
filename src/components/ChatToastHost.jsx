/* In-app message toast — iOS-style banner when a new chat message arrives.
 * Shows peer avatar + name + message preview. Click opens the chat directly.
 * Props: notifs (array), myType ('brand'|'creator'), getBooking (async fn by id)
 */
import React, { useState, useEffect, useRef } from 'react';
import { Avatar } from './ui.jsx';
import ChatModal from './ChatModal.jsx';
import { ensureFirebase, db, doc, getDoc } from '../lib/firebase.js';

export default function ChatToastHost({ notifs, myType }) {
  const [toast, setToast] = useState(null); // { notif, booking }
  const [visible, setVisible] = useState(false);
  const seenRef = useRef(new Set());
  const timerRef = useRef(null);

  useEffect(() => {
    const chatNotifs = (notifs || [])
      .filter((n) => n.type === 'chat_message' && !n.read && n.bookingId)
      .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
    const fresh = chatNotifs.find((n) => !seenRef.current.has(n.id));
    if (!fresh) return;
    seenRef.current.add(fresh.id);

    // fetch booking for peer info + chat open
    ensureFirebase().then(async () => {
      try {
        const snap = await getDoc(doc(db(), 'bookings', fresh.bookingId));
        if (!snap.exists()) return;
        const booking = { id: snap.id, ...snap.data() };
        const isBrand = myType === 'brand';
        setToast({
          notif: fresh,
          booking,
          peerName: isBrand ? booking.creatorName || 'Creator' : booking.bizName || 'Brand',
          peerAvatar: isBrand ? booking.creatorPfp : booking.bizPfp,
        });
        requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
        // auto-dismiss after 6s
        clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => dismiss(), 6000);
      } catch (e) { /* best-effort */ }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notifs]);

  function dismiss() {
    setVisible(false);
    setTimeout(() => setToast(null), 300);
  }

  const [chatOpen, setChatOpen] = useState(false);

  if (!toast) return null;

  const preview = toast.notif.body || '';
  const senderName = toast.notif.peerName || toast.peerName;

  return (
    <>
      <div
        onClick={() => { dismiss(); setTimeout(() => setChatOpen(true), 150); }}
        style={{
          position: 'fixed',
          top: 'calc(10px + env(safe-area-inset-top))',
          left: 12, right: 12, zIndex: 120,
          transform: visible ? 'translateY(0)' : 'translateY(-120%)',
          opacity: visible ? 1 : 0,
          transition: 'transform 0.38s cubic-bezier(0.32, 0.72, 0, 1), opacity 0.3s ease',
          cursor: 'pointer',
        }}
      >
        <div style={{
          display: 'flex', gap: 12, alignItems: 'center',
          padding: '12px 14px', borderRadius: 0,
          background: 'linear-gradient(180deg, var(--surface) 0%, var(--surface-2) 100%)',
          border: '1px solid var(--line)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.4), 0 16px 44px rgba(0,0,0,0.18)',
        }}>
          <Avatar src={toast.peerAvatar} name={toast.peerName} size={44} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {senderName}
            </div>
            <div style={{
              fontSize: 13, color: 'var(--ink-2)', marginTop: 2,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {preview}
            </div>
          </div>
          <div style={{
            fontSize: 11, fontWeight: 700, color: 'var(--cyan-deep)',
            background: 'var(--cyan-soft)', borderRadius: 8, padding: '4px 8px', flexShrink: 0,
          }}>
            Chat
          </div>
        </div>
      </div>
      {chatOpen && (
        <ChatModal
          booking={toast.booking}
          myType={myType}
          peerName={toast.peerName}
          peerAvatar={toast.peerAvatar}
          senderName={senderName}
          onClose={() => setChatOpen(false)}
        />
      )}
    </>
  );
}
