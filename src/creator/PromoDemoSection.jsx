/* Creator promo demo portfolio — upload/list/delete (audit §7.11).
   DEMO_TYPES / DEMO_FORMATS / MAX_DEMO_UPLOADS from constants; media via Cloudinary;
   records in promoDemos (public read, creator-owned write). */
import React, { useMemo, useRef, useState } from 'react';
import { ImagePlus, Trash2, Play, FileText, Upload, ArrowLeft, Clock3 } from 'lucide-react';
import { ensureFirebase, db, collection, addDoc, deleteDoc, doc, serverTimestamp } from '../lib/firebase.js';
import { uploadToGCS, GCS_FOLDERS } from '../lib/cloudinary.js';
import { DEMO_TYPES, DEMO_FORMATS, MAX_DEMO_UPLOADS } from '../lib/constants.js';
import { timeAgo } from '../lib/format.js';
import {
  Page, TopBar, IconBtn, Card, Button, Field, Input, TextArea, Select, Badge,
  EmptyState, useToast, ConfirmDialog, Chip,
} from '../components/ui.jsx';

/** Capture a JPEG thumbnail from a video file (local, no server). */
function videoThumbnail(file) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    try {
      const url = URL.createObjectURL(file);
      const v = document.createElement('video');
      v.muted = true;
      v.playsInline = true;
      v.preload = 'auto';
      v.src = url;
      const cleanup = () => URL.revokeObjectURL(url);
      v.onloadeddata = () => { try { v.currentTime = Math.min(0.6, (v.duration || 1) / 2); } catch (e) { finish(''); cleanup(); } };
      v.onseeked = () => {
        try {
          const w = 480;
          const h = Math.max(240, Math.round((w * (v.videoHeight || 270)) / (v.videoWidth || 480)));
          const c = document.createElement('canvas');
          c.width = w; c.height = h;
          c.getContext('2d').drawImage(v, 0, 0, w, h);
          finish(c.toDataURL('image/jpeg', 0.72));
        } catch (e) { finish(''); }
        cleanup();
      };
      v.onerror = () => { cleanup(); finish(''); };
      setTimeout(() => { cleanup(); finish(''); }, 9000);
    } catch (e) { finish(''); }
  });
}

export default function PromoDemoSection({ creator, onBack }) {
  const toast = useToast();
  const fileRef = useRef(null);
  const [demos, setDemos] = useState(null); // null = loading
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState('');
  const [delId, setDelId] = useState(null);
  const [form, setForm] = useState({ title: '', description: '', demoType: DEMO_TYPES[0], format: DEMO_FORMATS[0] });
  const setF = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));

  // Real-time list of own demos.
  React.useEffect(() => {
    let unsub = () => {};
    (async () => {
      try {
        await ensureFirebase();
        const { query, where, onSnapshot } = await import('../lib/firebase.js');
        unsub = onSnapshot(
          query(collection(db(), 'promoDemos'), where('creatorId', '==', creator.id)),
          (snap) => {
            const arr = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
            arr.sort((a, b) => {
              const x = a.createdAt?.seconds || 0, y = b.createdAt?.seconds || 0;
              return y - x;
            });
            setDemos(arr);
          },
          () => setError('Could not load your demos.'),
        );
      } catch (e) { setError('Could not load your demos.'); }
    })();
    return () => unsub();
  }, [creator.id]);

  const remaining = useMemo(
    () => Math.max(0, MAX_DEMO_UPLOADS - (demos?.length || 0)),
    [demos],
  );

  async function handleFiles(files) {
    const list = [...(files || [])].slice(0, remaining);
    if (!list.length) {
      toast.err(`You can keep up to ${MAX_DEMO_UPLOADS} demos. Delete one to add another.`);
      return;
    }
    if (!form.title.trim()) {
      toast.err('Give your demo a title first.');
      return;
    }
    setUploading(true);
    try {
      await ensureFirebase();
      for (const file of list) {
        const isVideo = file.type.startsWith('video/');
        const format = isVideo ? 'Video' : 'Image';
        setProgress(`Uploading ${file.name}…`);
        const { url } = await uploadToGCS(file, isVideo ? 'video' : 'image', GCS_FOLDERS.promos);
        let thumbnailUrl = url;
        if (isVideo) {
          setProgress('Generating thumbnail…');
          const thumb = await videoThumbnail(file);
          if (thumb) {
            const thumbBlob = await (await fetch(thumb)).blob();
            const uploadedThumb = await uploadToGCS(thumbBlob, 'image', GCS_FOLDERS.promoThumbnails);
            thumbnailUrl = uploadedThumb.url;
          }
        }
        await addDoc(collection(db(), 'promoDemos'), {
          creatorId: creator.id,
          creatorName: creator.name,
          creatorHandle: creator.handle,
          name: creator.name,
          demoType: form.demoType,
          format,
          title: form.title.trim(),
          description: form.description.trim(),
          mediaUrl: url,
          thumbnailUrl,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      toast.ok(list.length > 1 ? `${list.length} demos added.` : 'Demo added to your portfolio.');
      setForm({ title: '', description: '', demoType: DEMO_TYPES[0], format: DEMO_FORMATS[0] });
    } catch (e) {
      toast.err('Upload failed. Check your connection and try again.');
    } finally {
      setUploading(false);
      setProgress('');
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function removeDemo() {
    if (!delId) return;
    try {
      await ensureFirebase();
      await deleteDoc(doc(db(), 'promoDemos', delId));
      toast.ok('Demo removed.');
    } catch (e) {
      toast.err('Could not delete the demo.');
    } finally {
      setDelId(null);
    }
  }

  return (
    <Page pageKey="creator-demos">
      <TopBar title="Promo demos" subtitle={`${demos?.length || 0}/${MAX_DEMO_UPLOADS} slots used`}
        left={onBack ? <IconBtn icon={ArrowLeft} label="Back" onClick={onBack} /> : null} />
      <div className="cl-container" style={{ paddingTop: 14, paddingBottom: 28, display: 'grid', gap: 14 }}>
        <Card>
          <h3 style={{ fontSize: 16, marginBottom: 4 }}>Add a demo</h3>
          <p className="cl-small cl-muted" style={{ marginBottom: 14, lineHeight: 1.6 }}>
            Show brands what your promotions look like. Business Pro members can watch these on your profile.
          </p>
          <Field label="Title">
            <Input value={form.title} onChange={setF('title')} placeholder="e.g. Skincare reel for GlowUp" maxLength={80} />
          </Field>
          <Field label="Description (optional)">
            <TextArea value={form.description} onChange={setF('description')} placeholder="What did you create here?" style={{ minHeight: 70 }} />
          </Field>
          <div className="cl-row" style={{ gap: 10 }}>
            <div className="cl-grow">
              <Field label="Demo type">
                <Select value={form.demoType} onChange={setF('demoType')}>
                  {DEMO_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </Select>
              </Field>
            </div>
            <div className="cl-grow">
              <Field label="Format">
                <Select value={form.format} onChange={setF('format')}>
                  {DEMO_FORMATS.map((t) => <option key={t} value={t}>{t}</option>)}
                </Select>
              </Field>
            </div>
          </div>
          <input ref={fileRef} type="file" accept="image/*,video/*" multiple
            style={{ display: 'none' }} onChange={(e) => handleFiles(e.target.files)} />
          <Button block loading={uploading} disabled={remaining <= 0} onClick={() => fileRef.current?.click()} icon={Upload}>
            {uploading ? (progress || 'Uploading…') : remaining <= 0 ? 'Demo slots full' : 'Choose video / image'}
          </Button>
          <div className="cl-small cl-muted" style={{ marginTop: 8, textAlign: 'center' }}>
            {remaining} of {MAX_DEMO_UPLOADS} slots left
          </div>
        </Card>

        <div className="cl-section-title"><h3>Your portfolio</h3></div>
        {error ? (
          <Card><div className="cl-small" style={{ color: 'var(--red)' }}>{error}</div></Card>
        ) : demos === null ? (
          <Card><div className="cl-small cl-muted">Loading demos…</div></Card>
        ) : demos.length === 0 ? (
          <EmptyState icon={ImagePlus} title="No demos yet"
            body="Upload your first demo video or image to show brands your style."
            action={<Button size="sm" onClick={() => fileRef.current?.click()} icon={Upload}>Upload demo</Button>} />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {demos.map((d) => (
              <Card key={d.id} style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ position: 'relative', aspectRatio: '4/3', background: 'var(--surface-2)' }}>
                  {d.thumbnailUrl ? (
                    <img src={d.thumbnailUrl} alt={d.title}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                  ) : (
                    <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: 'var(--faint)' }}>
                      {d.format === 'Video' ? <Play style={{ width: 30, height: 30 }} /> : <FileText style={{ width: 30, height: 30 }} />}
                    </div>
                  )}
                  {d.format === 'Video' && (
                    <span style={{
                      position: 'absolute', inset: 0, display: 'grid', placeItems: 'center',
                      background: 'rgba(0,0,0,.18)',
                    }}>
                      <span style={{
                        width: 42, height: 42, borderRadius: '50%', background: 'rgba(255,255,255,.92)',
                        display: 'grid', placeItems: 'center',
                      }}>
                        <Play style={{ width: 18, height: 18, color: 'var(--ink)', marginLeft: 2 }} />
                      </span>
                    </span>
                  )}
                  <button onClick={() => setDelId(d.id)} aria-label="Delete demo"
                    style={{
                      position: 'absolute', top: 8, right: 8, width: 32, height: 32, borderRadius: '50%',
                      border: 0, background: 'rgba(11,11,12,.6)', color: '#fff', cursor: 'pointer',
                      display: 'grid', placeItems: 'center', backdropFilter: 'blur(6px)',
                    }}>
                    <Trash2 style={{ width: 15, height: 15 }} />
                  </button>
                </div>
                <div style={{ padding: 10 }}>
                  <div className="cl-row" style={{ gap: 6, marginBottom: 4 }}>
                    <Chip cyan>{d.demoType}</Chip>
                    <span className="cl-small cl-muted">{d.format}</span>
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {d.title}
                  </div>
                  <div className="cl-small cl-muted" style={{ marginTop: 2 }}>
                    <Clock3 style={{ width: 11, height: 11, verticalAlign: -1 }} /> {timeAgo(d.createdAt)}
                  </div>
                  <a href={d.mediaUrl} target="_blank" rel="noreferrer" className="cl-small cl-link"
                    style={{ display: 'inline-block', marginTop: 6 }}>Open full media</a>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
      <ConfirmDialog
        open={!!delId}
        onClose={() => setDelId(null)}
        title="Delete this demo?"
        body="It will be removed from your portfolio immediately."
        confirmLabel="Delete"
        danger
        onConfirm={removeDemo}
      />
    </Page>
  );
}
