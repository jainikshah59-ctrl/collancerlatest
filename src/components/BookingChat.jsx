/* Booking-scoped chat — brand ↔ creator messaging within a booking.
 * Messages stored in `booking_messages` collection, scoped by bookingId.
 */
import React, { useState, useEffect, useRef } from 'react';
import { Send, Loader2 } from 'lucide-react';
import { Card, useToast } from './ui.jsx';
import { ensureFirebase, db, collection, addDoc, query, where, orderBy, onSnapshot, serverTimestamp } from '../lib/firebase.js';

export default function BookingChat({ bookingId, senderType, senderName }) {
  const toast = useToast();
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    let unsub = () => {};
    ensureFirebase().then(() => {
      const q = query(
        collection(db(), 'booking_messages'),
        where('bookingId', '==', bookingId),
        orderBy('createdAt', 'asc')
      );
      unsub = onSnapshot(q, (snap) => {
        setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      }, () => {});
    });
    return () => unsub();
  }, [bookingId]);

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
        bookingId,
        senderType, // 'brand' | 'creator'
        senderName: senderName || senderType,
        text: msg,
        createdAt: serverTimestamp(),
      });
      setText('');
    } catch {
      toast.err('Could not send message.');
    } finally {
      setSending(false);
    }
  }

  return (
    <Card style={{ marginBottom: 12 }}>
      <h4 style={{ fontSize: 14, marginBottom: 10 }}>Messages</h4>
      <div style={{ maxHeight: 220, overflowY: 'auto', display: 'grid', gap: 8, marginBottom: 10 }}>
        {messages.length === 0 && (
          <p className="cl-small cl-muted" style={{ textAlign: 'center', padding: '12px 0' }}>
            No messages yet. Say hello!
          </p>
        )}
        {messages.map((m) => {
          const mine = m.senderType === senderType;
          return (
            <div key={m.id} style={{
              justifySelf: mine ? 'end' : 'start',
              maxWidth: '80%',
              background: mine ? 'var(--cyan-soft)' : 'var(--surface-2)',
              borderRadius: 12,
              padding: '8px 12px',
            }}>
              <div className="cl-small" style={{ fontWeight: 700, marginBottom: 2, fontSize: 11 }}>
                {m.senderName}
              </div>
              <div className="cl-small" style={{ lineHeight: 1.5 }}>{m.text}</div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
      <div className="cl-row" style={{ gap: 8 }}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder="Type a message..."
          className="cl-input"
          style={{ flex: 1 }}
        />
        <button
          onClick={send}
          disabled={sending || !text.trim()}
          style={{
            width: 40, height: 40, borderRadius: 10, border: 0, cursor: 'pointer',
            background: 'var(--cyan)', color: '#fff', display: 'grid', placeItems: 'center',
            opacity: sending || !text.trim() ? 0.5 : 1,
          }}
          aria-label="Send message"
        >
          {sending ? <Loader2 style={{ width: 18, height: 18 }} /> : <Send style={{ width: 18, height: 18 }} />}
        </button>
      </div>
    </Card>
  );
}
