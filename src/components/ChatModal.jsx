/* Dedicated chat screen — full-screen popup with the booking's other party.
 * iOS-style slide-up animation, back button, theme-aware colors.
 * Props: booking, myType ('brand'|'creator'), peerName, peerAvatar, onClose
 */
import React, { useState, useEffect, useRef } from 'react';
import { Send, Loader2, ArrowLeft } from 'lucide-react';
import { Avatar, useToast } from './ui.jsx';
import {
  ensureFirebase, db, collection, addDoc, doc, updateDoc,
  query, where, onSnapshot, serverTimestamp,
} from '../lib/firebase.js';

/** Live messages for a booking, sorted oldest-first. */
export function useBookingMessages(bookingId) {
  const [messages, setMessages] = useState([]);
  useEffect(() => {
    let unsub = () => {};
    ensureFirebase().then(() => {
      const q = query(collection(db(), 'booking_messages'), where('bookingId', '==', bookingId));
      unsub = onSnapshot(q, (snap) => {
        const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        all.sort((a, b) => (a.createdAt?.toMillis?.() || 0) - (b.createdAt?.toMillis?.() || 0));
        setMessages(all);
      }, (err) => console.error('[chat] snapshot failed', err));
    });
    return () => unsub();
  }, [bookingId]);
  return messages;
}

/** Unread count for myType given booking's read timestamps. */
export function useChatUnread(booking, myType) {
  const messages = useBookingMessages(booking?.id);
  if (!booking?.id) return 0;
  const readAt = myType === 'brand'
    ? booking.brandChatReadAt?.toMillis?.() || 0
    : booking.creatorChatReadAt?.toMillis?.() || 0;
  const other = myType === 'brand' ? 'creator' : 'brand';
  return messages.filter((m) => m.senderType === other && (m.createdAt?.toMillis?.() || 0) > readAt).length;
}

/** Mark chat as read for myType. Best-effort. */
export async function markChatRead(bookingId, myType) {
  try {
    await ensureFirebase();
    const field = myType === 'brand' ? 'brandChatReadAt' : 'creatorChatReadAt';
    await updateDoc(doc(db(), 'bookings', bookingId), { [field]: serverTimestamp() });
  } catch (e) { /* best-effort */ }
}

async function notifyPeer(collectionName, peerId, booking, senderName, text) {
  if (!peerId) return;
  try {
    await ensureFirebase();
    const key = collectionName === 'bizNotifs' ? 'bizId' : 'creatorId';
    await addDoc(collection(db(), collectionName), {
      [key]: peerId,
      type: 'chat_message',
      title: `New message from ${senderName}`,
      body: text.length > 90 ? text.slice(0, 90) + '…' : text,
      bookingId: booking.id || null,
      peerName: senderName || null,
      read: false,
      createdAt: serverTimestamp(),
    });
  } catch (e) { /* notifications must never block chat */ }
}

export default function ChatModal({ booking, myType, peerName, peerAvatar, senderName, onClose }) {
  const toast = useToast();
  const messages = useBookingMessages(booking.id);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [visible, setVisible] = useState(false);
  const bottomRef = useRef(null);
  const peerId = myType === 'brand' ? booking.creatorId : booking.bizId;

  // iOS-style entrance animation
  useEffect(() => {
    requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
    markChatRead(booking.id, myType);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booking.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  function handleClose() {
    setVisible(false);
    setTimeout(onClose, 280); // wait for exit animation
  }

  async function send() {
    const msg = text.trim();
    if (!msg || sending) return;
    setSending(true);
    try {
      await ensureFirebase();
      await addDoc(collection(db(), 'booking_messages'), {
        bookingId: booking.id,
        senderType: myType,
        senderName: senderName || myType,
        text: msg,
        createdAt: serverTimestamp(),
      });
      try {
        await updateDoc(doc(db(), 'bookings', booking.id), {
          lastMessageAt: serverTimestamp(),
          lastMessageFrom: myType,
        });
      } catch (e) { /* best-effort */ }
      setText('');
      markChatRead(booking.id, myType);
      notifyPeer(myType === 'brand' ? 'creatorNotifs' : 'bizNotifs', peerId, booking, senderName || myType, msg);
    } catch (e) {
      toast.err('Could not send message.');
    } finally {
      setSending(false);
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 90,
      background: 'var(--surface)',
      transform: visible ? 'translateY(0)' : 'translateY(100%)',
      opacity: visible ? 1 : 0,
      transition: 'transform 0.32s cubic-bezier(0.32, 0.72, 0, 1), opacity 0.28s ease',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: 'calc(12px + env(safe-area-inset-top)) 12px 12px',
        borderBottom: '1px solid var(--line)',
        background: 'var(--surface)',
      }}>
        <button
          onClick={handleClose} aria-label="Back"
          style={{
            width: 38, height: 38, borderRadius: '50%', border: 0,
            background: 'var(--surface-2)', cursor: 'pointer',
            display: 'grid', placeItems: 'center', color: 'var(--ink)',
            transition: 'transform 0.15s ease',
          }}
          onTouchStart={(e) => { e.currentTarget.style.transform = 'scale(0.92)'; }}
          onTouchEnd={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
        >
          <ArrowLeft style={{ width: 20, height: 20 }} />
        </button>
        <Avatar src={peerAvatar} name={peerName} size={42} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 16, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--ink)' }}>
            {peerName}
          </div>
          <div className="cl-small cl-muted" style={{ fontSize: 12.5 }}>
            {booking.campaignName || 'Booking chat'}
          </div>
        </div>
      </div>

      {/* messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 10, background: 'var(--surface)' }}>
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', padding: '48px 16px' }}>
            <p className="cl-small cl-muted" style={{ lineHeight: 1.7, fontSize: 14 }}>
              No messages yet.<br />Say hello to start the conversation!
            </p>
          </div>
        )}
        {messages.map((m, i) => {
          const mine = m.senderType === myType;
          const showAvatar = !mine && (i === 0 || messages[i - 1].senderType !== m.senderType);
          return (
            <div key={m.id} style={{
              display: 'flex', gap: 8, alignItems: 'flex-end',
              justifyContent: mine ? 'flex-end' : 'flex-start',
              animation: 'cl-msg-in 0.25s cubic-bezier(0.32, 0.72, 0, 1)',
            }}>
              {!mine && (
                <div style={{ width: 28, flexShrink: 0 }}>
                  {showAvatar && <Avatar src={peerAvatar} name={peerName} size={28} />}
                </div>
              )}
              <div style={{
                maxWidth: '75%',
                padding: '10px 14px',
                borderRadius: 18,
                borderBottomRightRadius: mine ? 6 : 18,
                borderBottomLeftRadius: mine ? 18 : 6,
                fontSize: 14.5, lineHeight: 1.55,
                color: mine ? '#fff' : 'var(--ink)',
                background: mine ? 'var(--cyan)' : 'var(--surface-2)',
                boxShadow: mine
                  ? '0 2px 8px rgba(8,145,178,0.25)'
                  : '0 1px 3px rgba(0,0,0,0.06)',
              }}>
                {m.text}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
      <style>{`@keyframes cl-msg-in { from { opacity: 0; transform: translateY(8px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }`}</style>

      {/* composer */}
      <div style={{
        padding: '10px 12px calc(10px + env(safe-area-inset-bottom))',
        borderTop: '1px solid var(--line)',
        background: 'var(--surface)',
        display: 'flex', gap: 10, alignItems: 'center',
      }}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
          placeholder="Type a message..."
          className="cl-input"
          style={{ flex: 1, height: 44, borderRadius: 22, fontSize: 15 }}
        />
        <button
          onClick={send}
          disabled={sending || !text.trim()}
          aria-label="Send message"
          style={{
            width: 46, height: 46, borderRadius: '50%', border: 0,
            cursor: 'pointer', display: 'grid', placeItems: 'center', color: '#fff',
            background: 'var(--cyan)',
            boxShadow: '0 4px 14px rgba(8,145,178,0.35)',
            opacity: sending || !text.trim() ? 0.4 : 1,
            transition: 'transform 0.15s ease, opacity 0.2s ease',
            transform: 'scale(1)',
          }}
          onTouchStart={(e) => { if (text.trim() && !sending) e.currentTarget.style.transform = 'scale(0.9)'; }}
          onTouchEnd={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
        >
          {sending ? <Loader2 style={{ width: 20, height: 20 }} /> : <Send style={{ width: 20, height: 20 }} />}
        </button>
      </div>
    </div>
  );
}

/** Red pulsing unread badge. */
export function UnreadBadge({ count }) {
  if (!count) return null;
  return (
    <span style={{
      position: 'absolute', top: -7, right: -7,
      minWidth: 22, height: 22, borderRadius: 11,
      background: '#ef4444', color: '#fff',
      fontSize: 12, fontWeight: 800,
      display: 'grid', placeItems: 'center', padding: '0 6px',
      border: '2px solid var(--surface)',
      boxShadow: '0 4px 12px rgba(239,68,68,0.5)',
      animation: 'cl-pulse-red 1.6s ease-in-out infinite',
      zIndex: 2,
    }}>
      {count > 99 ? '99+' : count}
      <style>{`@keyframes cl-pulse-red { 0%,100% { transform: scale(1); } 50% { transform: scale(1.15); } }`}</style>
    </span>
  );
}
