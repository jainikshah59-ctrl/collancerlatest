import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Calculator, Copy, Download, FileText, ShieldAlert, CheckCircle2, Share2, Upload, ExternalLink, Sparkles } from 'lucide-react';
import { Page, TopBar, IconBtn, Card, Button, Field, Input, TextArea, Badge, Tabs, useToast } from '../components/ui.jsx';
import { ensureFirebase, db, collection, addDoc, query, orderBy, limit, onSnapshot, serverTimestamp, doc, setDoc } from '../lib/firebase.js';
import { uploadToCloudinary } from '../lib/cloudinary.js';

const money = n => `₹${Math.max(0, Math.round(Number(n) || 0)).toLocaleString('en-IN')}`;
const count = n => Math.max(0, Number(n) || 0).toLocaleString('en-IN');
const themes = [
  { id: 'basic', name: 'Essential', note: 'Clean & professional', cls: 'mk-essential' },
  { id: 'glass', name: '3D Glass', note: 'Frosted glass layers', cls: 'mk-glass' },
  { id: 'clay', name: 'Soft Clay', note: 'Rounded, tactile surfaces', cls: 'mk-clay' },
  { id: 'minimal', name: 'Editorial', note: 'Bold, minimal typography', cls: 'mk-minimal' },
];

function MediaKit({ creator }) {
  const toast = useToast();
  const [theme, setTheme] = useState('glass');
  const [bio, setBio] = useState(creator?.bio || creator?.instagram?.bio || creator?.instagramClient?.bio || '');
  const [email, setEmail] = useState(creator?.businessEmail || creator?.email || '');
  const [city, setCity] = useState(creator?.city || '');
  const [services, setServices] = useState('Instagram Reels, Stories, UGC');
  const [saving, setSaving] = useState(false);
  const [shareUrl, setShareUrl] = useState('');
  const followers = Number(creator?.followers || creator?.instagramClient?.followers || creator?.instagram?.followers || 0);
  const views = Number(creator?.avgViews || creator?.averageViews || creator?.instagramClient?.avgViews || 0);
  const engagement = Number(creator?.engagementRate || creator?.engagement || 0);
  const handle = String(creator?.handle || creator?.username || '').replace(/^@/, '');
  const name = creator?.name || creator?.fullName || 'Creator';
  const photo = creator?.photoURL || creator?.photoUrl || creator?.avatar || creator?.instagramClient?.profilePictureUrl || creator?.instagram?.profilePictureUrl || '';
  const text = useMemo(() => [name, handle ? '@' + handle : '', creator?.niche || creator?.category || '', city, 'Followers: ' + count(followers), views ? 'Average views: ' + count(views) : '', engagement ? 'Engagement rate: ' + engagement + '%' : '', bio, 'Services: ' + services, email ? 'Contact: ' + email : ''].filter(Boolean).join('\n'), [name, handle, creator, city, followers, views, engagement, bio, services, email]);
  useEffect(() => {
    setBio(creator?.bio || creator?.instagram?.bio || creator?.instagramClient?.bio || '');
    setEmail(creator?.businessEmail || creator?.email || '');
    setCity(creator?.city || '');
  }, [creator?.bio, creator?.businessEmail, creator?.email, creator?.city]);
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); toast.ok('Media kit details copied.'); }
    catch { toast.err('Could not copy.'); }
  };
  const download = () => {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'collancer-media-kit.txt'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const share = async () => {
    if (!creator?.id) { toast.err('Your profile is still loading.'); return; }
    if (!handle) { toast.err('Add a public Instagram handle to your profile before sharing a media kit.'); return; }
    setSaving(true);
    try {
      await ensureFirebase();
      const payload = { creatorId: creator.id, creatorName: name, handle, theme, bio, email, city, services, updatedAt: serverTimestamp(), isPublic: true };
      await setDoc(doc(db(), 'mediaKits', creator.id), payload, { merge: true });
      const url = new URL('/media-kit/' + encodeURIComponent(handle), window.location.origin);
      url.searchParams.set('style', theme);
      setShareUrl(url.toString());
      try { await navigator.clipboard.writeText(url.toString()); toast.ok('Public media kit link copied.'); }
      catch { toast.ok('Public media kit link created.'); }
    } catch { toast.err('Could not create a share link. Please try again.'); }
    finally { setSaving(false); }
  };
  return <div className="cl-tools-stack">
    <Card>
      <div className="cl-row" style={{ gap: 10, marginBottom: 14 }}>
        <FileText style={{ width: 22, height: 22, color: 'var(--cyan-deep)', flexShrink: 0 }} />
        <div className="cl-grow"><h3 style={{ fontSize: 17 }}>Media Kit Studio</h3><p className="cl-small cl-muted">Your audience, niche and creator identity — styled into a brand-ready portfolio.</p></div>
        <Badge tone="green">Live preview</Badge>
      </div>
      <div className="cl-template-grid">{themes.map(t => <button type="button" key={t.id} onClick={() => setTheme(t.id)} className={'cl-template-choice ' + (theme === t.id ? 'is-active' : '')}><span className={'cl-template-swatch ' + t.cls}><i/><i/><i/></span><strong>{t.name}</strong><small>{t.note}</small></button>)}</div>
      <div className="cl-row cl-kit-fields" style={{ gap: 10, marginTop: 16 }}>
        <div className="cl-grow"><Field label="City / location"><Input value={city} onChange={e => setCity(e.target.value)} placeholder="Your city" /></Field></div>
        <div className="cl-grow"><Field label="Business contact email"><Input value={email} onChange={e => setEmail(e.target.value)} placeholder="hello@example.com" inputType="email" /></Field></div>
      </div>
      <Field label="Creator bio"><TextArea value={bio} onChange={e => setBio(e.target.value)} maxLength={500} placeholder="A short introduction for potential brand partners" /></Field>
      <Field label="Services"><Input value={services} onChange={e => setServices(e.target.value)} placeholder="Reels, Stories, UGC..." /></Field>
    </Card>
    <section className={'cl-media-preview ' + themes.find(t => t.id === theme).cls}>
      <div className="cl-media-preview-top"><span>COLLANCER CREATOR KIT</span><span className="cl-media-pill">MEDIA KIT · 2026</span></div>
      <div className="cl-media-identity">
        {photo ? <img className="cl-media-avatar" src={photo} alt="" /> : <div className="cl-media-avatar cl-media-avatar-fallback"><Sparkles size={26}/></div>}
        <div className="cl-grow"><div className="cl-media-kicker">{creator?.niche || creator?.category || 'CREATOR · DIGITAL STORYTELLER'}</div><h2>{name}</h2><p>{handle ? '@' + handle : 'Your Instagram handle'}</p></div>
      </div>
      <p className="cl-media-bio">{bio || 'Add a short bio to tell brands what makes your content and community unique.'}</p>
      <div className="cl-media-stats"><div><strong>{count(followers)}</strong><span>Followers</span></div><div><strong>{views ? count(views) : '—'}</strong><span>Avg. views</span></div><div><strong>{engagement ? engagement + '%' : '—'}</strong><span>Engagement</span></div></div>
      <div className="cl-media-bottom"><div><span>LOCATION</span><strong>{city || 'Add your city'}</strong></div><div><span>COLLABORATIONS</span><strong>{services || 'Add your services'}</strong></div></div>
      {email && <div className="cl-media-contact">{email}</div>}
      <div className="cl-media-footer"><span>Where Indian brands meet verified creators</span><span>COLLANCER ↗</span></div>
    </section>
    <div className="cl-row cl-kit-actions" style={{ gap: 8 }}>
      <Button onClick={copy} icon={Copy}>Copy details</Button>
      <Button variant="light" onClick={download} icon={Download}>Download text</Button>
      <Button onClick={share} loading={saving} icon={Share2}>Create share link</Button>
    </div>
    {shareUrl && <Card className="cl-glass"><div className="cl-small" style={{ fontWeight: 800, marginBottom: 8 }}>Your public media kit link</div><div className="cl-share-url">{shareUrl}</div><div className="cl-row" style={{ gap: 8, marginTop: 10 }}><Button onClick={() => { navigator.clipboard?.writeText(shareUrl).then(() => toast.ok('Link copied.')).catch(() => toast.err('Copy failed.')); }} icon={Copy}>Copy link</Button><Button variant="light" onClick={() => window.open(shareUrl, '_blank', 'noopener,noreferrer')} icon={ExternalLink}>Preview</Button></div><p className="cl-small cl-muted" style={{ marginTop: 8 }}>The public route must be enabled and readable in your Firebase rules for visitors to access this link.</p></Card>}
  </div>;
}

function ChargesCalculator({ creator }) {
  const followers = Number(creator?.followers || creator?.instagramClient?.followers || creator?.instagram?.followers || 0);
  const [f, setF] = useState(String(followers));
  const [v, setV] = useState(String(creator?.avgViews || creator?.averageViews || 0));
  const [e, setE] = useState(String(creator?.engagement || creator?.engagementRate || 2.5));
  const [u, setU] = useState('organic');
  const [d, setD] = useState('reel');
  useEffect(() => { setF(String(followers)); setV(String(creator?.avgViews || creator?.averageViews || 0)); setE(String(creator?.engagement || creator?.engagementRate || 2.5)); }, [followers, creator?.avgViews, creator?.averageViews, creator?.engagement, creator?.engagementRate]);
  const r = useMemo(() => {
    const F = Math.max(0, Number(f) || 0), V = Math.max(0, Number(v) || 0), E = Math.min(100, Math.max(0, Number(e) || 0));
    const base = Math.max(1500, Math.min(50000, F * .035));
    const viewFactor = V ? Math.min(1.8, Math.max(.65, V / Math.max(F, 1) * .18)) : 1;
    const engagementFactor = 1 + Math.min(.35, Math.max(-.15, (E - 2.5) * .06));
    const deliverable = { story: .45, reel: 1, video: 1.35, ugc: 1.15 }[d] || 1;
    const usage = u === 'paid' ? 1.35 : u === 'whitelisting' ? 1.65 : 1;
    const estimate = base * viewFactor * engagementFactor * deliverable * usage;
    return { min: estimate * .8, max: estimate * 1.2, mid: estimate };
  }, [f, v, e, u, d]);
  return <Card>
    <div className="cl-row" style={{ gap: 10, marginBottom: 14 }}><Calculator style={{ width: 22, height: 22, color: 'var(--cyan-deep)', flexShrink: 0 }}/><div className="cl-grow"><h3 style={{ fontSize: 17 }}>Creator Charges Calculator</h3><p className="cl-small cl-muted">Profile data is prefilled. Adjust the brief and usage rights to estimate a starting quote.</p></div></div>
    <div className="cl-row cl-calc-fields" style={{ gap: 10 }}><div className="cl-grow"><Field label="Followers"><Input value={f} onChange={e => setF(e.target.value)} inputMode="numeric"/></Field></div><div className="cl-grow"><Field label="Average views per post"><Input value={v} onChange={e => setV(e.target.value)} inputMode="numeric"/></Field></div></div>
    <div className="cl-row cl-calc-fields" style={{ gap: 10 }}><div className="cl-grow"><Field label="Engagement rate (%)"><Input value={e} onChange={e => setE(e.target.value)} inputMode="decimal"/></Field></div><div className="cl-grow"><Field label="Deliverable"><select value={d} onChange={e => setD(e.target.value)} className="cl-input"><option value="reel">Instagram Reel</option><option value="story">Instagram Story</option><option value="video">Dedicated Video</option><option value="ugc">UGC Video</option></select></Field></div></div>
    <Field label="Usage rights"><select value={u} onChange={e => setU(e.target.value)} className="cl-input"><option value="organic">Organic posting only</option><option value="paid">Paid advertising usage</option><option value="whitelisting">Whitelisting / creator licensing</option></select></Field>
    <div className="cl-price-result"><div className="cl-small cl-muted">Suggested quote range</div><div className="cl-price-main">{money(r.min)} – {money(r.max)}</div><div className="cl-small cl-muted">Midpoint estimate: {money(r.mid)}</div><div className="cl-price-note">An estimate, not a guaranteed market rate. Factor in production costs, revisions, exclusivity, duration and campaign scope.</div></div>
  </Card>;
}

function ScamAlerts({ creator }) {
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [description, setDescription] = useState('');
  const [subject, setSubject] = useState('');
  const [kind, setKind] = useState('agency');
  const [evidence, setEvidence] = useState([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let unsub = () => {}; let active = true;
    (async () => { try { await ensureFirebase(); if (!active) return; unsub = onSnapshot(query(collection(db(), 'scamAlerts'), orderBy('createdAt', 'desc'), limit(50)), s => setItems(s.docs.map(x => ({ id: x.id, ...x.data() })))); } catch {} })();
    return () => { active = false; unsub(); };
  }, []);
  const uploadEvidence = async files => {
    const chosen = Array.from(files || []).slice(0, 4);
    if (chosen.some(f => !f.type.startsWith('image/'))) { toast.err('Please choose image files only.'); return; }
    if (chosen.some(f => f.size > 8 * 1024 * 1024)) { toast.err('Each image must be 8 MB or smaller.'); return; }
    setBusy(true);
    try { const uploaded = await Promise.all(chosen.map(f => uploadToCloudinary(f, 'image', 'collancer_scam_evidence'))); setEvidence(prev => [...prev, ...uploaded.map(x => x.url)].slice(0, 4)); toast.ok('Evidence uploaded.'); }
    catch { toast.err('Evidence upload failed. Please try again.'); }
    finally { setBusy(false); }
  };
  const post = async () => {
    if (!description.trim() || !subject.trim()) { toast.err('Add the report subject and details first.'); return; }
    setBusy(true);
    try {
      await ensureFirebase();
      await addDoc(collection(db(), 'scamAlerts'), { creatorId: creator?.id || '', creatorName: creator?.name || 'Community member', subject: subject.trim(), type: kind, text: description.trim(), evidence, status: 'community-reported', createdAt: serverTimestamp() });
      setDescription(''); setSubject(''); setEvidence([]); toast.ok('Community report submitted.');
    } catch { toast.err('Could not submit the report. Check your connection and try again.'); }
    finally { setBusy(false); }
  };
  return <div className="cl-tools-stack">
    <Card>
      <div className="cl-row" style={{ gap: 10, marginBottom: 14 }}><ShieldAlert style={{ width: 22, height: 22, color: 'var(--amber)', flexShrink: 0 }}/><div className="cl-grow"><h3 style={{ fontSize: 17 }}>Community Scam Alerts</h3><p className="cl-small cl-muted">Document suspicious outreach and help creators identify warning signs.</p></div><Badge tone="green">Community</Badge></div>
      <Field label="Report category"><select value={kind} onChange={e => setKind(e.target.value)} className="cl-input"><option value="brand">Brand</option><option value="agency">Agency</option><option value="campaign">Campaign / offer</option><option value="individual">Individual / impersonation</option><option value="payment">Payment / phishing link</option></select></Field>
      <Field label="Brand, agency, campaign or account name"><Input value={subject} onChange={e => setSubject(e.target.value)} maxLength={140} placeholder="Name or public handle involved"/></Field>
      <Field label="What happened?"><TextArea value={description} onChange={e => setDescription(e.target.value)} maxLength={2000} placeholder="Describe the interaction, requested payment, missing payout, suspicious link or other evidence. Avoid posting phone numbers, addresses, OTPs or other private data."/></Field>
      <label className="cl-evidence-upload"><Upload size={18}/><span><strong>Add evidence images</strong><small>Up to 4 images · 8 MB each</small></span><input type="file" accept="image/*" multiple onChange={e => { uploadEvidence(e.target.files); e.target.value = ''; }} /></label>
      {evidence.length > 0 && <div className="cl-evidence-grid">{evidence.map((url, i) => <div key={url} className="cl-evidence-item"><img src={url} alt={'Evidence ' + (i + 1)}/><button type="button" onClick={() => setEvidence(prev => prev.filter(x => x !== url))} aria-label="Remove evidence">×</button></div>)}</div>}
      <p className="cl-small cl-muted" style={{ marginTop: 10 }}>Reports are community-submitted allegations, not verified findings. Share only relevant evidence and redact personal or sensitive information.</p>
      <Button block style={{ marginTop: 12 }} onClick={post} loading={busy} icon={ShieldAlert}>Submit community report</Button>
    </Card>
    <div className="cl-row" style={{ justifyContent: 'space-between' }}><h3 style={{ fontSize: 16 }}>Recent community reports</h3><Badge>{items.length} reports</Badge></div>
    {items.map(item => <Card key={item.id}><div className="cl-row" style={{ gap: 8, alignItems: 'flex-start' }}><div className="cl-grow"><div style={{ fontWeight: 800 }}>{item.subject || 'Community alert'}</div><div className="cl-small cl-muted" style={{ marginTop: 3 }}>{item.type || 'report'} · Reported by {item.creatorName || 'Community member'}</div></div><Badge tone="amber">Unverified</Badge></div><p style={{ marginTop: 10, lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>{item.text}</p>{Array.isArray(item.evidence) && item.evidence.length > 0 && <div className="cl-evidence-grid" style={{ marginTop: 10 }}>{item.evidence.map(url => <a key={url} href={url} target="_blank" rel="noreferrer"><img src={url} alt="Report evidence"/></a>)}</div>}</Card>)}
    {!items.length && <Card><div className="cl-small cl-muted">No community reports yet. Be the first to submit a helpful, evidence-based warning.</div></Card>}
  </div>;
}

export default function ToolsPage({ creator, onBack }) {
  const [tab, setTab] = useState('media');
  return <Page pageKey="creator-tools"><TopBar title="Creator Tools" subtitle="Build, price and protect your creator business" left={<IconBtn icon={ArrowLeft} label="Back" onClick={onBack}/>}/><div className="cl-container cl-tools-container" style={{ paddingTop: 14, paddingBottom: 28 }}><Tabs tabs={[{ key: 'media', label: 'Media Kit', icon: FileText }, { key: 'calculator', label: 'Charges', icon: Calculator }, { key: 'scams', label: 'Scam Alerts', icon: ShieldAlert }]} value={tab} onChange={setTab}/><div style={{ marginTop: 14 }}>{tab === 'media' && <MediaKit creator={creator}/>} {tab === 'calculator' && <ChargesCalculator creator={creator}/>} {tab === 'scams' && <ScamAlerts creator={creator}/>}</div></div><style>{`
    .cl-tools-container{max-width:980px}.cl-tools-stack{display:grid;gap:14px}.cl-template-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.cl-template-choice{min-width:0;text-align:left;border:1px solid var(--line);border-radius:12px;padding:10px;background:var(--surface-2);color:var(--ink);display:grid;gap:5px;cursor:pointer;transition:transform .22s ease,border-color .22s ease}.cl-template-choice:hover{transform:translateY(-2px)}.cl-template-choice.is-active{border-color:var(--cyan);box-shadow:0 0 0 2px var(--cyan-glow)}.cl-template-choice strong{font-size:12px}.cl-template-choice small{font-size:11px;color:var(--muted);line-height:1.35}.cl-template-swatch{height:48px;border-radius:8px;display:flex;gap:4px;align-items:flex-end;padding:6px;overflow:hidden}.cl-template-swatch i{display:block;height:70%;width:24%;border-radius:4px;background:rgba(255,255,255,.65)}.mk-essential{--kit-a:#d9f6fb;--kit-b:#fff;--kit-ink:#14232c}.mk-glass{--kit-a:#17283d;--kit-b:#3d7190;--kit-ink:#fff}.mk-clay{--kit-a:#f4c7b8;--kit-b:#f8e8d9;--kit-ink:#4c2d2c}.mk-minimal{--kit-a:#f2eee7;--kit-b:#ded8cd;--kit-ink:#1b1b1b}.cl-template-swatch.mk-essential{background:linear-gradient(135deg,#d9f6fb,#fff)}.cl-template-swatch.mk-glass{background:linear-gradient(135deg,#17283d,#3d7190)}.cl-template-swatch.mk-clay{background:linear-gradient(135deg,#f4c7b8,#f8e8d9)}.cl-template-swatch.mk-minimal{background:linear-gradient(135deg,#f2eee7,#ded8cd)}.cl-media-preview{position:relative;isolation:isolate;overflow:hidden;border-radius:22px;padding:clamp(18px,4vw,34px);color:var(--kit-ink);background:linear-gradient(135deg,var(--kit-a),var(--kit-b));box-shadow:0 22px 60px rgba(0,0,0,.13);animation:cl-kit-enter .65s cubic-bezier(.2,.8,.2,1) both}.cl-media-preview:before{content:'';position:absolute;z-index:-1;width:230px;height:230px;border-radius:50%;right:-60px;top:-85px;background:rgba(255,255,255,.22);filter:blur(2px);animation:cl-kit-float 8s ease-in-out infinite alternate}.mk-glass.cl-media-preview{border:1px solid rgba(255,255,255,.4);background:linear-gradient(135deg,rgba(25,45,67,.96),rgba(35,112,139,.85));backdrop-filter:blur(18px);--kit-ink:#fff}.mk-clay.cl-media-preview{border-radius:30px;box-shadow:inset 8px 8px 20px rgba(255,255,255,.28),inset -8px -8px 20px rgba(90,40,35,.08),0 18px 36px rgba(0,0,0,.12)}.mk-minimal.cl-media-preview{border-radius:2px;box-shadow:none}.cl-media-preview-top,.cl-media-footer{display:flex;justify-content:space-between;gap:12px;align-items:center;font-size:10px;font-weight:800;letter-spacing:.12em}.cl-media-pill{border:1px solid currentColor;border-radius:999px;padding:5px 8px;letter-spacing:.06em}.cl-media-identity{display:flex;gap:16px;align-items:center;margin:32px 0 20px;min-width:0}.cl-media-avatar{width:78px;height:78px;object-fit:cover;border-radius:22px;border:1px solid rgba(255,255,255,.6);box-shadow:0 8px 22px rgba(0,0,0,.16);flex-shrink:0}.mk-clay .cl-media-avatar{border-radius:26px}.mk-minimal .cl-media-avatar{border-radius:0}.cl-media-avatar-fallback{display:grid;place-items:center;background:rgba(255,255,255,.25)}.cl-media-kicker{font-size:10px;letter-spacing:.12em;font-weight:800;opacity:.75}.cl-media-identity h2{font-size:clamp(24px,5vw,42px);line-height:1.06;margin:5px 0;overflow-wrap:anywhere}.cl-media-identity p{margin:0;opacity:.75;font-size:13px}.cl-media-bio{max-width:650px;line-height:1.7;font-size:14px;white-space:pre-wrap;overflow-wrap:anywhere}.cl-media-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:24px 0}.cl-media-stats>div{padding:14px;border:1px solid rgba(255,255,255,.28);border-radius:12px;background:rgba(255,255,255,.12);min-width:0}.mk-glass .cl-media-stats>div{backdrop-filter:blur(10px)}.mk-clay .cl-media-stats>div{border-radius:20px;box-shadow:inset 3px 3px 7px rgba(255,255,255,.18),inset -3px -3px 7px rgba(0,0,0,.04)}.mk-minimal .cl-media-stats>div{border-radius:0;background:transparent;border-color:currentColor}.cl-media-stats strong,.cl-media-stats span{display:block;overflow-wrap:anywhere}.cl-media-stats strong{font-size:clamp(16px,3vw,25px);font-variant-numeric:tabular-nums}.cl-media-stats span{font-size:11px;opacity:.75;margin-top:4px}.cl-media-bottom{display:grid;grid-template-columns:1fr 1fr;gap:18px;padding-top:18px;border-top:1px solid rgba(255,255,255,.28)}.cl-media-bottom span,.cl-media-bottom strong{display:block}.cl-media-bottom span{font-size:9px;letter-spacing:.12em;opacity:.7;margin-bottom:5px}.cl-media-bottom strong{font-size:12px;overflow-wrap:anywhere}.cl-media-contact{margin-top:16px;font-size:12px;overflow-wrap:anywhere}.cl-media-footer{margin-top:28px;padding-top:14px;border-top:1px solid rgba(255,255,255,.2);font-size:9px;letter-spacing:.07em}.cl-kit-actions{flex-wrap:wrap}.cl-share-url{padding:10px;border-radius:8px;background:var(--surface-2);font-size:12px;overflow-wrap:anywhere}.cl-price-result{padding:20px;margin-top:14px;border:1px solid var(--glass-border);border-radius:16px;background:linear-gradient(135deg,var(--glass-hi),var(--glass-lo));box-shadow:var(--shadow-card)}.cl-price-main{font-size:clamp(25px,5vw,34px);font-weight:850;letter-spacing:-.04em;margin:7px 0;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}.cl-price-note{font-size:12px;color:var(--muted);line-height:1.6;margin-top:10px}.cl-evidence-upload{display:flex;align-items:center;gap:10px;padding:14px;border:1px dashed var(--line);border-radius:12px;cursor:pointer}.cl-evidence-upload span,.cl-evidence-upload small{display:block}.cl-evidence-upload small{font-size:11px;color:var(--muted);margin-top:3px}.cl-evidence-upload input{max-width:180px;font-size:12px}.cl-evidence-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.cl-evidence-item{position:relative;min-width:0}.cl-evidence-grid img{display:block;width:100%;height:100px;object-fit:cover;border-radius:8px;border:1px solid var(--line)}.cl-evidence-item button{position:absolute;right:4px;top:4px;border:0;border-radius:50%;width:24px;height:24px;background:rgba(0,0,0,.72);color:white;font-size:18px;cursor:pointer}.cl-tools-container .cl-input{width:100%;min-width:0}.cl-tools-container .cl-field{min-width:0}@keyframes cl-kit-enter{from{opacity:0;transform:translateY(10px) scale(.99)}to{opacity:1;transform:translateY(0) scale(1)}}@keyframes cl-kit-float{from{transform:translate3d(0,0,0) rotate(0)}to{transform:translate3d(-22px,18px,0) rotate(14deg)}}@media(max-width:640px){.cl-template-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.cl-media-identity{gap:12px;margin:24px 0 16px}.cl-media-avatar{width:60px;height:60px;border-radius:16px}.cl-media-stats>div{padding:10px 8px}.cl-media-bottom{grid-template-columns:1fr}.cl-media-footer{align-items:flex-start;flex-direction:column}.cl-kit-actions>*{flex:1 1 140px}.cl-evidence-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.cl-evidence-grid img{height:120px}}@media(prefers-reduced-motion:reduce){.cl-media-preview,.cl-media-preview:before{animation:none!important}}
  `}</style></Page>;
}
