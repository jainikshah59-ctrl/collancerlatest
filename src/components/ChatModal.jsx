/* Dedicated chat popup — full conversation with a booking's other party.
 * 3D glassmorphism, header with peer avatar+name, red pulsing unread badge support.
 * Props: booking, myType ('brand'|'creator'), peerName, peerAvatar, onClose
 */
import React, { useState, useEffect, useRef } from 'react';
import { Send, Loader2, X } from 'lucide-react';
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
    await updateDoc(doc(db(), 'bookings', bookingId), {
      [field]: serverTimestamp(),
    });
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
  const bottomRef = useRef(null);
  const peerId = myType === 'brand' ? booking.creatorId : booking.bizId;

  // mark as read on open
  useEffect(() => {
    markChatRead(booking.id, myType);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booking.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

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
      // denormalize for list badges
      try {
        await updateDoc(doc(db(), 'bookings', booking.id), {
          lastMessageAt: serverTimestamp(),
          lastMessageFrom: myType,
        });
      } catch (e) { /* best-effort */ }
      setText('');
      markChatRead(booking.id, myType);
      // notify the other party
      notifyPeer(myType === 'brand' ? 'creatorNotifs' : 'bizNotifs', peerId, booking, senderName || myType, msg);
    } catch (e) {
      toast.err('Could not send message.');
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 90,
        background: 'rgba(8,12,20,0.55)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 480, height: 'min(78vh, 640px)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          borderRadius: 22, position: 'relative',
          background: 'linear-gradient(160deg, rgba(255,255,255,0.92), rgba(255,255,255,0.78))',
          backdropFilter: 'blur(24px) saturate(1.4)', WebkitBackdropFilter: 'blur(24px) saturate(1.4)',
          border: '1px solid rgba(255,255,255,0.65)',
          boxShadow: '0 24px 70px rgba(2,8,20,0.35), inset 0 1px 0 rgba(255,255,255,0.8), inset 0 -1px 0 rgba(255,255,255,0.25)',
        }}
      >
        {/* header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px',
          borderBottom: '1px solid rgba(0,0,0,0.06)',
          background: 'linear-gradient(180deg, rgba(255,255,255,0.5), rgba(255,255,255,0))',
        }}>
          <Avatar src={peerAvatar} name={peerName} size={42} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {peerName}
            </div>
            <div className="cl-small cl-muted" style={{ fontSize: 12 }}>
              {booking.campaignName || 'Booking chat'}
            </div>
          </div>
          <button
            onClick={onClose} aria-label="Close chat"
            style={{
              width: 34, height: 34, borderRadius: '50%', border: '1px solid rgba(0,0,0,0.08)',
              background: 'rgba(255,255,255,0.7)', cursor: 'pointer',
              display: 'grid', placeItems: 'center',
              boxShadow: '0 2px 8px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.9)',
            }}
          >
            <X style={{ width: 16, height: 16 }} />
          </button>
        </div>

        {/* messages */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {messages.length === 0 && (
            <div style={{ textAlign: 'center', padding: '32px 16px' }}>
              <p className="cl-small cl-muted" style={{ lineHeight: 1.6 }}>
                No messages yet.<br />Say hello to start the conversation!
              </p>
            </div>
          )}
          {messages.map((m) => {
            const mine = m.senderType === myType;
            return (
              <div key={m.id} style={{
                alignSelf: mine ? 'flex-end' : 'flex-start',
                maxWidth: '78%',
                padding: '10px 14px', borderRadius: 16,
                borderTopRightRadius: mine ? 6 : 16,
                borderTopLeftRadius: mine ? 16 : 6,
                fontSize: 14, lineHeight: 1.5,
                color: mine ? '#fff' : 'var(--ink)',
                background: mine
                  ? 'linear-gradient(135deg, #22d3ee, #0891b2)'
                  : 'rgba(255,255,255,0.85)',
                border: mine ? '1px solid rgba(255,255,255,0.35)' : '1px solid rgba(0,0,0,0.06)',
                boxShadow: mine
                  ? '0 6px 18px rgba(8,145,178,0.35), inset 0 1px 0 rgba(255,255,255,0.4)'
                  : '0 4px 14px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.9)',
              }}>
                {m.text}
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>

        {/* composer */}
        <div style={{
          padding: '12px 14px calc(12px + env(safe-area-inset-bottom))',
          borderTop: '1px solid rgba(0,0,0,0.06)',
          background: 'rgba(255,255,255,0.6)', backdropFilter: 'blur(12px)',
          display: 'flex', gap: 10, alignItems: 'center',
        }}>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
            placeholder="Type a message..."
            style={{
              flex: 1, height: 44, borderRadius: 22, padding: '0 18px',
              border: '1px solid rgba(0,0,0,0.08)', fontSize: 14, outline: 'none',
              background: 'rgba(255,255,255,0.9)',
              boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.05)',
            }}
          />
          <button
            onClick={send}
            disabled={sending || !text.trim()}
            aria-label="Send message"
            style={{
              width: 46, height: 46, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.4)',
              cursor: 'pointer', display: 'grid', placeItems: 'center', color: '#fff',
              background: 'linear-gradient(135deg, #22d3ee, #0891b2)',
              boxShadow: '0 8px 20px rgba(8,145,178,0.4), inset 0 1px 0 rgba(255,255,255,0.45), inset 0 -2px 4px rgba(0,0,0,0.12)',
              opacity: sending || !text.trim() ? 0.45 : 1,
              transform: 'translateZ(0)',
            }}
          >
            {sending ? <Loader2 style={{ width: 19, height: 19 }} /> : <Send style={{ width: 19, height: 19 }} />}
          </button>
        </div>
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
      background: 'linear-gradient(135deg, #ef4444, #dc2626)',
      color: '#fff', fontSize: 12, fontWeight: 800,
      display: 'grid', placeItems: 'center', padding: '0 6px',
      border: '2px solid #fff',
      boxShadow: '0 4px 12px rgba(220,38,38,0.5)',
      animation: 'cl-pulse-red 1.6s ease-in-out infinite',
    }}>
      {count > 99 ? '99+' : count}
      <style>{`@keyframes cl-pulse-red { 0%,100% { transform: scale(1); } 50% { transform: scale(1.18); } }`}</style>
    </span>
  );
}
