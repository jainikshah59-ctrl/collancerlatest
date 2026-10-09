import React, { useEffect, useState } from 'react';
import { Sparkles, MapPin, Mail, Instagram, Users, Eye } from 'lucide-react';
import { ensureFirebase, db, doc, getDoc } from './lib/firebase.js';
import { Page, Card, Button, SkeletonCard } from './components/ui.jsx';

export default function PublicMediaKit({ handle }) {
  const [kit, setKit] = useState(null);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        await ensureFirebase();
        const h = String(handle || '').trim().toLowerCase().replace(/^@/, '');
        const hSnap = await getDoc(doc(db(), 'creatorHandles', h));
        if (!hSnap.exists()) throw new Error('not-found');
        const creatorId = hSnap.data().creatorId;
        const kSnap = await getDoc(doc(db(), 'mediaKits', creatorId));
        if (!kSnap.exists() || kSnap.data().isPublic !== true) throw new Error('not-found');
        if (active) setKit(kSnap.data());
      } catch { if (active) setMissing(true); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [handle]);
  if (loading) return <Page><div className="cl-container" style={{ maxWidth: 780, paddingTop: 28 }}><SkeletonCard/><SkeletonCard/></div></Page>;
  if (missing || !kit) return <Page><div className="cl-container" style={{ maxWidth: 560, paddingTop: 50 }}><Card><h2>Media kit unavailable</h2><p className="cl-small cl-muted" style={{ marginTop: 8 }}>This creator has not published a public media kit, or the link may have changed.</p><Button block style={{ marginTop: 16 }} onClick={() => { window.location.href = '/'; }}>Visit Collancer</Button></Card></div></Page>;
  const theme = new URLSearchParams(window.location.search).get('style') || kit.theme || 'glass';
  const cls = { basic: 'mk-essential', glass: 'mk-glass', clay: 'mk-clay', minimal: 'mk-minimal' }[theme] || 'mk-glass';
  return <Page pageKey="public-media-kit"><main className="cl-container cl-public-kit" style={{ maxWidth: 850, paddingTop: 24, paddingBottom: 44 }}><div className={'cl-media-preview ' + cls}>
    <div className="cl-media-preview-top"><span>COLLANCER CREATOR KIT</span><span className="cl-media-pill">MEDIA KIT</span></div>
    <div className="cl-media-identity"><div className="cl-media-avatar cl-media-avatar-fallback"><Sparkles size={26}/></div><div className="cl-grow"><div className="cl-media-kicker">CREATOR · DIGITAL STORYTELLER</div><h1>{kit.creatorName || handle}</h1><p><Instagram size={13} style={{ display: 'inline', verticalAlign: 'middle' }}/> @{kit.handle || handle}</p></div></div>
    <p className="cl-media-bio">{kit.bio || 'Creator and digital storyteller open to brand collaborations.'}</p>
    <div className="cl-media-bottom"><div><span><MapPin size={11} style={{ display: 'inline' }}/> LOCATION</span><strong>{kit.city || 'India'}</strong></div><div><span>COLLABORATIONS</span><strong>{kit.services || 'Brand partnerships, Reels, Stories and UGC'}</strong></div></div>
    {kit.email && <div className="cl-media-contact"><Mail size={13} style={{ display: 'inline', verticalAlign: 'middle' }}/> {kit.email}</div>}
    <div className="cl-media-footer"><span>Where Indian brands meet verified creators</span><span>COLLANCER ↗</span></div>
  </div><div className="cl-public-kit-footer"><span>Creator media kit</span><a href="https://collancer.in" rel="noreferrer">Powered by Collancer</a></div></main><style>{`.cl-public-kit .cl-media-preview{margin-top:12px}.cl-public-kit-footer{display:flex;justify-content:space-between;gap:10px;margin-top:16px;color:var(--muted);font-size:12px}.cl-public-kit-footer a{color:var(--cyan-deep);text-decoration:none}.cl-media-identity p svg{margin-right:4px}@media(max-width:560px){.cl-public-kit-footer{flex-direction:column}.cl-public-kit .cl-media-identity h1{font-size:clamp(24px,7vw,34px)}}`}</style></Page>;
}
