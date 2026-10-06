/* Shared admin helpers: real-time queue hook, one-shot doc hook,
   required-reason dialog, queue list shell, and notification writer. */
import { useEffect, useState, useRef } from 'react';
import {
  ensureFirebase, db, collection, doc, getDoc, addDoc,
  query, onSnapshot, serverTimestamp,
} from '../lib/firebase.js';
import {
  Button, Modal, Field, TextArea, EmptyState, SkeletonCard,
} from '../components/ui.jsx';

const tsMillis = (v) => (v && v.seconds ? v.seconds * 1000 : Number(v) || 0);

/** Real-time collection query, newest first (client-side sort — no composite index needed). */
export function useQueue(colName, ...constraints) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let unsub = null;
    let dead = false;
    (async () => {
      try {
        await ensureFirebase();
        const q = query(collection(db(), colName), ...constraints);
        unsub = onSnapshot(
          q,
          (snap) => {
            const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
            rows.sort((a, b) => tsMillis(b.createdAt) - tsMillis(a.createdAt));
            if (!dead) { setItems(rows); setLoading(false); setError(null); }
          },
          (e) => { if (!dead) { setError(e); setLoading(false); } },
        );
      } catch (e) {
        if (!dead) { setError(e); setLoading(false); }
      }
    })();
    return () => { dead = true; if (unsub) unsub(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colName]);

  return { items, loading, error };
}

/** One-shot document fetch (cached per id). */
export function useDoc(colName, id) {
  const [data, setData] = useState(null);
  useEffect(() => {
    if (!id) { setData(null); return; }
    let dead = false;
    (async () => {
      try {
        await ensureFirebase();
        const snap = await getDoc(doc(db(), colName, id));
        if (!dead && snap.exists()) setData({ id: snap.id, ...snap.data() });
      } catch (e) { /* leave null */ }
    })();
    return () => { dead = true; };
  }, [colName, id]);
  return data;
}

/** Write a creator/business notification (outside transactions — plain write). */
export async function pushNotif(colName, payload) {
  await ensureFirebase();
  await addDoc(collection(db(), colName), {
    read: false,
    createdAt: serverTimestamp(),
    ...payload,
  });
}

/** Modal that forces a non-empty reason (used for rejections / send-backs). */
export function ReasonDialog({ open, onClose, title, body, confirmLabel = 'Reject', onSubmit, loading }) {
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (open) { setReason(''); setTouched(false); }
  }, [open ]);

  return (
    <Modal open={open} onClose={onClose}>
      <h3 style={{ fontSize: 18, marginBottom: 8 }}>{title}</h3>
      {body && (
        <p className="cl-small cl-muted" style={{ lineHeight: 1.6, marginBottom: 14 }}>{body}</p>
      )}
      <Field label="Reason" error={touched && !reason.trim() ? 'A reason is required.' : undefined}>
        <TextArea
          rows={3}
          value={reason}
          onChange={(e) => { setReason(e.target.value); setTouched(true); }}
          placeholder="Write a clear, specific reason…"
        />
      </Field>
      <div className="cl-row" style={{ justifyContent: 'flex-end' }}>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button
          variant="danger"
          loading={loading}
          disabled={!reason.trim()}
          onClick={() => { if (reason.trim()) onSubmit(reason.trim()); }}
        >
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}

/** Loading / error / empty shell for a queue list. */
export function QueueShell({ loading, error, items, emptyIcon, emptyTitle, emptyBody, children }) {
  if (loading) {
    return (
      <div style={{ display: 'grid', gap: 12 }}>
        <SkeletonCard /><SkeletonCard /><SkeletonCard />
      </div>
    );
  }
  if (error) {
    return (
      <EmptyState
        icon={emptyIcon}
        title="Couldn't load this queue"
        body="Check your connection and pull to retry. (Error: invalid data or permissions.)"
      />
    );
  }
  if (!items.length) {
    return (
      <EmptyState icon={emptyIcon} title={emptyTitle} body={emptyBody} />
    );
  }
  return <div style={{ display: 'grid', gap: 12 }}>{children}</div>;
}

/** Key/value meta rows for queue cards. */
export function MetaRows({ rows }) {
  return (
    <dl style={{ margin: 0, display: 'grid', gap: 6 }}>
      {rows.filter((r) => r && r.value !== undefined && r.value !== null && r.value !== '').map((r, i) => (
        <div key={i} className="cl-row" style={{ gap: 8, alignItems: 'baseline' }}>
          <dt className="cl-small cl-muted" style={{ width: 108, flexShrink: 0 }}>{r.label}</dt>
          <dd style={{ margin: 0, fontSize: 13.5, wordBreak: 'break-word' }}>{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Reports the live queue size up to the tab badge (render-phase-safe). */
export function CountReporter({ onCount, n }) {
  const ref = useRef(onCount);
  ref.current = onCount;
  useEffect(() => { ref.current?.(n); }, [n]);
  return null;
}
