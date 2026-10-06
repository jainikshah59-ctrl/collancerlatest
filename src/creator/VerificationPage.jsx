/* Creator verification — submit / status / resubmit after rejection.
   Writes verificationRequests/{uid} per audit §4 / §5.7. */
import React, { useState } from 'react';
import { ShieldCheck, ArrowLeft, CheckCircle2, XCircle, Clock3, AlertCircle, ExternalLink } from 'lucide-react';
import { ensureFirebase, db, doc, setDoc, updateDoc, serverTimestamp } from '../lib/firebase.js';
import { PLATFORMS, NICHES, CITIES } from '../lib/constants.js';
import {
  Page, TopBar, IconBtn, Card, Button, Field, Input, TextArea, Select, Badge, useToast, EmptyState,
} from '../components/ui.jsx';
import { fmtDateTime } from '../lib/format.js';

export default function VerificationPage({ creator, verification, loading, onBack, onSubmitted }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({
    fullName: creator?.name || '',
    platform: creator?.platform || 'Instagram',
    followers: String(creator?.followers || ''),
    profileUrl: '',
    niche: creator?.niche || NICHES[0],
    city: creator?.city || 'Mumbai',
    idType: 'Government ID',
    notes: '',
  });
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  const [err, setErr] = useState('');

  const status = verification?.status || 'none';

  async function submit(e) {
    e?.preventDefault();
    setErr('');
    if (f.fullName.trim().length < 2) return setErr('Please enter your full legal name.');
    if (!/^https?:\/\/.+\..+/.test(f.profileUrl.trim())) return setErr('Please enter a valid profile URL (https://…).');
    if (!/^\d+$/.test(f.followers.trim())) return setErr('Please enter your follower count as a number.');
    setBusy(true);
    try {
      await ensureFirebase();
      const uid = creator.id;
      const payload = {
        creatorId: uid,
        creatorName: creator.name,
        creatorHandle: creator.handle,
        fullName: f.fullName.trim(),
        platform: f.platform,
        followers: Number(f.followers.trim()),
        profileUrl: f.profileUrl.trim(),
        niche: f.niche,
        city: f.city,
        idType: f.idType,
        notes: f.notes.trim(),
        email: creator.email,
        whatsapp: creator.whatsapp || '',
        status: 'pending',
        submittedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      if (status === 'rejected') {
        payload.previousRejectReason = verification.rejectReason || verification.previousRejectReason || '';
        await updateDoc(doc(db(), 'verificationRequests', uid), { ...payload, rejectReason: null });
      } else {
        await setDoc(doc(db(), 'verificationRequests', uid), payload, { merge: true });
      }
      toast.ok(status === 'rejected' ? 'Verification resubmitted for review.' : 'Verification submitted for review.');
      onSubmitted?.();
    } catch (e2) {
      setErr('Could not submit verification. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page pageKey="creator-verification">
      <TopBar title="Verification" subtitle="Get the verified badge" left={<IconBtn icon={ArrowLeft} label="Back" onClick={onBack} />} />
      <div className="cl-container" style={{ paddingTop: 14, paddingBottom: 28, display: 'grid', gap: 14 }}>
        {loading ? (
          <Card><div className="cl-small cl-muted">Loading verification status…</div></Card>
        ) : status === 'verified' ? (
          <Card style={{ textAlign: 'center', padding: 28 }}>
            <CheckCircle2 style={{ width: 46, height: 46, color: 'var(--green)', margin: '0 auto 12px' }} />
            <h3 style={{ fontSize: 18, marginBottom: 6 }}>You are verified</h3>
            <p className="cl-small cl-muted" style={{ lineHeight: 1.6 }}>
              Your identity and social presence are confirmed.
              {verification?.reviewedAt && <> Reviewed {fmtDateTime(verification.reviewedAt)}.</>}
            </p>
            <Badge tone="green" icon={ShieldCheck} style={{ marginTop: 12 }}>Verified creator</Badge>
          </Card>
        ) : status === 'pending' ? (
          <Card style={{ textAlign: 'center', padding: 28 }}>
            <Clock3 style={{ width: 46, height: 46, color: 'var(--amber)', margin: '0 auto 12px' }} />
            <h3 style={{ fontSize: 18, marginBottom: 6 }}>Under review</h3>
            <p className="cl-small cl-muted" style={{ lineHeight: 1.6 }}>
              Submitted {fmtDateTime(verification.submittedAt)}. Our team usually reviews within 1–2 working days.
              You will get a notification the moment there is a decision.
            </p>
            <Badge tone="amber" style={{ marginTop: 12 }}>Pending</Badge>
          </Card>
        ) : (
          <>
            {status === 'rejected' && (
              <Card style={{ borderColor: 'var(--red)', borderWidth: 1.5 }}>
                <div className="cl-row" style={{ gap: 10, marginBottom: 8 }}>
                  <XCircle style={{ width: 20, height: 20, color: 'var(--red)', flexShrink: 0 }} />
                  <h3 style={{ fontSize: 16 }}>Previous submission was rejected</h3>
                </div>
                <p className="cl-small" style={{ lineHeight: 1.6 }}>
                  <strong>Reason:</strong> {verification?.rejectReason || verification?.previousRejectReason || 'Details not provided.'}
                </p>
                <p className="cl-small cl-muted" style={{ marginTop: 8, lineHeight: 1.6 }}>
                  Fix the issue below and resubmit — your new submission replaces the old one.
                </p>
              </Card>
            )}
            <Card>
              <div className="cl-row" style={{ gap: 10, marginBottom: 14 }}>
                <ShieldCheck style={{ width: 22, height: 22, color: 'var(--cyan-deep)' }} />
                <div>
                  <h3 style={{ fontSize: 16 }}>{status === 'rejected' ? 'Resubmit verification' : 'Submit verification'}</h3>
                  <p className="cl-small cl-muted" style={{ marginTop: 2 }}>We confirm your identity and social presence.</p>
                </div>
              </div>
              <form onSubmit={submit}>
                <Field label="Full legal name">
                  <Input value={f.fullName} onChange={set('fullName')} placeholder="As on your ID" />
                </Field>
                <div className="cl-row" style={{ gap: 10 }}>
                  <div className="cl-grow">
                    <Field label="Platform">
                      <Select value={f.platform} onChange={set('platform')}>
                        {PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
                      </Select>
                    </Field>
                  </div>
                  <div className="cl-grow">
                    <Field label="Followers / subscribers">
                      <Input value={f.followers} onChange={set('followers')} placeholder="25000" inputMode="numeric" />
                    </Field>
                  </div>
                </div>
                <Field label="Public profile URL" hint="Link to your main creator profile">
                  <div style={{ position: 'relative' }}>
                    <ExternalLink style={{ position: 'absolute', left: 13, top: 14, width: 16, height: 16, color: 'var(--faint)' }} />
                    <Input value={f.profileUrl} onChange={set('profileUrl')} placeholder="https://instagram.com/yourhandle" style={{ paddingLeft: 38 }} inputMode="url" />
                  </div>
                </Field>
                <div className="cl-row" style={{ gap: 10 }}>
                  <div className="cl-grow">
                    <Field label="Niche">
                      <Select value={f.niche} onChange={set('niche')}>
                        {NICHES.map((n) => <option key={n} value={n}>{n}</option>)}
                      </Select>
                    </Field>
                  </div>
                  <div className="cl-grow">
                    <Field label="City">
                      <Select value={f.city} onChange={set('city')}>
                        {CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
                      </Select>
                    </Field>
                  </div>
                </div>
                <Field label="ID proof type">
                  <Select value={f.idType} onChange={set('idType')}>
                    {['Government ID', 'PAN Card', 'Driving Licence', 'Passport'].map((t) => <option key={t} value={t}>{t}</option>)}
                  </Select>
                </Field>
                <Field label="Anything we should know? (optional)">
                  <TextArea value={f.notes} onChange={set('notes')} placeholder="Alternate handles, recent handle change, etc." />
                </Field>
                {err && <div className="cl-error-text" style={{ marginBottom: 12 }}>{err}</div>}
                <Button block size="lg" loading={busy} type="submit" icon={ShieldCheck}>
                  {status === 'rejected' ? 'Resubmit for review' : 'Submit for review'}
                </Button>
                <p className="cl-small cl-muted" style={{ textAlign: 'center', marginTop: 10, lineHeight: 1.6 }}>
                  <AlertCircle style={{ width: 13, height: 13, verticalAlign: -2 }} /> Only you and the admin team can see this submission.
                </p>
              </form>
            </Card>
          </>
        )}
      </div>
    </Page>
  );
}
