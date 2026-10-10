import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Calculator, Check, CheckCircle2, Copy, Download, ExternalLink, FileText, Instagram, Mail, MapPin, Palette, Share2, ShieldAlert, Sparkles, Upload } from 'lucide-react';
import { Page, TopBar, IconBtn, Card, Button, Field, Input, TextArea, Badge, Tabs, useToast } from '../components/ui.jsx';
import { ensureFirebase, db, collection, addDoc, query, orderBy, limit, onSnapshot, serverTimestamp, doc, getDoc, setDoc, updateDoc } from '../lib/firebase.js';
import { uploadToCloudinary } from '../lib/cloudinary.js';

const money = n => '₹' + Math.max(0, Math.round(Number(n) || 0)).toLocaleString('en-IN');
const count = n => Math.max(0, Number(n) || 0).toLocaleString('en-IN');
const themes = [
  { id: 'basic', name: 'Collancer Signature', note: 'The Collancer design system, elevated', cls: 'mk-essential', family: 'Signature', marker: 'SIGNATURE' },
  { id: 'glass', name: 'Pure Liquid Glass', note: 'Clear white glass, sharp edges and black controls', cls: 'mk-glass', family: 'Glassmorphism', marker: 'LIQUID GLASS' },
  { id: 'clay', name: 'Sculpted Clay', note: 'Tactile surfaces with inflated 3D depth', cls: 'mk-clay', family: 'Claymorphism', marker: 'SCULPTED' },
  { id: 'minimal', name: 'Architectural Minimal', note: 'Hard grid, sharp rules and quiet luxury', cls: 'mk-minimal', family: 'Minimalism', marker: 'STUDIO 01' },
  { id: 'neon', name: 'Neon Signal', note: 'Dark glass, electric lines and luminous edges', cls: 'mk-neon', family: 'Neon futurism', marker: 'SIGNAL' },
  { id: 'aurora', name: 'Aurora Field', note: 'Atmospheric gradients and layered ambient light', cls: 'mk-aurora', family: 'Aurora 3D', marker: 'ATMOSPHERE' },
  { id: 'chrome', name: 'Liquid Chrome', note: 'Bevelled metal with hard silver reflections', cls: 'mk-chrome', family: 'Metallic 3D', marker: 'POLISHED' },
  { id: 'editorial', name: 'Editorial Atelier', note: 'Fashion magazine typography and paper texture', cls: 'mk-editorial', family: 'Editorial', marker: 'VOLUME 01' },
  { id: 'bloom', name: 'Sculptural Bloom', note: 'Warm colour volumes and soft dimensional forms', cls: 'mk-bloom', family: 'Gradient sculpture', marker: 'IN FULL COLOUR' },
  { id: 'cyber', name: 'Cyber Grid', note: 'Technical typography, data panels and matrix lines', cls: 'mk-cyber', family: 'Cyber 3D', marker: 'NODE / 01' },
  { id: 'obsidian', name: 'Obsidian Reserve', note: 'Black stone, gold foil and a luxury finish', cls: 'mk-obsidian', family: 'Luxury', marker: 'PRIVATE EDITION' },
  { id: 'retro', name: 'Retro Dimension', note: 'Synthwave horizon and perspective geometry', cls: 'mk-retro', family: 'Retro futurism', marker: 'AFTER HOURS' },
  { id: 'holographic', name: 'Holographic Pearl', note: 'Prismatic pearlescence and spectral surfaces', cls: 'mk-holographic', family: 'Holographic', marker: 'SPECTRAL' },
];
const kitList = value => Array.isArray(value) ? value.map(item => String(item || '').trim()).filter(Boolean) : String(value || '').split(/[\n,]/).map(item => item.trim()).filter(Boolean);
const mediaRows = value => Array.isArray(value) ? value : [];
const kitBrandsText = value => mediaRows(value).map(item => typeof item === 'string' ? item : [item?.name || item?.brand || '', item?.logoUrl || item?.logo || item?.imageUrl || ''].filter(Boolean).join(' | ')).join('\n');
const parseKitBrands = value => String(value || '').split('\n').map(line => line.trim()).filter(Boolean).map(line => { const parts = line.split('|').map(part => part.trim()); return { name: parts[0], logoUrl: parts[1] || '' }; }).filter(item => item.name);
const inferKitFormats = creator => {
  const explicit = creator?.contentFormats || creator?.creatorContentFormats || creator?.formats;
  if (Array.isArray(explicit) && explicit.length) return explicit.join(', ');
  if (typeof explicit === 'string' && explicit.trim()) return explicit;
  const ig = creator?.instagramClient || creator?.instagram || {};
  const media = mediaRows(ig.recentMedia);
  const formats = [];
  if (media.some(item => /VIDEO|REELS/i.test(String(item?.mediaType || item?.media_type || '')))) formats.push('Reels / short-form video');
  if (media.some(item => /CAROUSEL/i.test(String(item?.mediaType || item?.media_type || '')))) formats.push('Carousels');
  if (media.some(item => /IMAGE|PHOTO/i.test(String(item?.mediaType || item?.media_type || '')))) formats.push('Photography / static posts');
  return formats.join(', ');
};
const dominantKitAudience = audience => [mediaRows(audience?.cities)[0]?.name, mediaRows(audience?.countries)[0]?.name].filter(Boolean).join(', ');
const kitGenderSplit = audience => {
  const rows = mediaRows(audience?.genderAge);
  if (!rows.length) return { women: null, men: null, other: null };
  const female = rows.filter(row => /female|(^|[\s/_.-])f([\s/_.-]|$)/i.test(String(row?.name || ''))).reduce((sum, row) => sum + (Number(row?.value) || 0), 0);
  const male = rows.filter(row => /(^|[\s/_.-])m([\s/_.-]|$)|male/i.test(String(row?.name || '')) && !/female/i.test(String(row?.name || ''))).reduce((sum, row) => sum + (Number(row?.value) || 0), 0);
  const total = rows.reduce((sum, row) => sum + (Number(row?.value) || 0), 0);
  if (!total) return { women: null, men: null, other: null };
  const women = Math.round(female / total * 100), men = Math.round(male / total * 100);
  return { women, men, other: Math.max(0, 100 - women - men) };
};
const dominantDemographicRows = audience => mediaRows(audience?.countries).slice(0, 3);
const topAverageViews = creator => {
  const ig = creator?.instagramClient || creator?.instagram || {};
  const direct = Number(creator?.avgViews || creator?.averageViews || ig?.avgViews || ig?.accountInsights?.totals?.views || 0);
  if (direct > 0) return direct;
  const recent = mediaRows(ig.recentMedia).map(item => Number(item?.viewCount ?? item?.view_count ?? item?.insights?.views ?? 0)).filter(value => value > 0);
  return recent.length ? Math.round(recent.reduce((sum, value) => sum + value, 0) / recent.length) : 0;
};
const creatorProfilePath = handle => handle ? '/c/' + encodeURIComponent(String(handle).trim().replace(/^@/, '')) : '/';

function MediaKit({ creator }) {
  const toast = useToast();
  const [theme, setTheme] = useState('basic');
  const [draftTheme, setDraftTheme] = useState('basic');
  const [stage, setStage] = useState('intro');
  const [loadingStep, setLoadingStep] = useState(0);
  const [showTemplates, setShowTemplates] = useState(false);
  const [freshCreator, setFreshCreator] = useState(null);
  const [headline, setHeadline] = useState(creator?.headline || creator?.title || '');
  const [coverImage, setCoverImage] = useState(creator?.coverImageUrl || creator?.coverImage || creator?.bannerUrl || '');
  const [bio, setBio] = useState(creator?.bio || creator?.instagram?.bio || creator?.instagramClient?.bio || '');
  const [email, setEmail] = useState(creator?.businessEmail || creator?.email || '');
  const [city, setCity] = useState(creator?.city || '');
  const [contentFormats, setContentFormats] = useState(inferKitFormats(creator));
  const [dominantAudience, setDominantAudience] = useState(creator?.mediaKitAudience || creator?.dominantAudience || '');
  const [womenShare, setWomenShare] = useState(creator?.mediaKitGenderSplit?.women ?? '');
  const [menShare, setMenShare] = useState(creator?.mediaKitGenderSplit?.men ?? '');
  const [otherShare, setOtherShare] = useState(creator?.mediaKitGenderSplit?.other ?? '');
  const [collaborationsText, setCollaborationsText] = useState(kitBrandsText(creator?.pastCollaborations || creator?.brandCollaborations || creator?.previousCollaborations || creator?.collaboratedBrands || []));
  const [openForCollabs, setOpenForCollabs] = useState(creator?.openForCollabs !== false && creator?.openToCollaborations !== false);
  const [saving, setSaving] = useState(false);
  const [draftSaveStatus, setDraftSaveStatus] = useState('idle');
  const [shareUrl, setShareUrl] = useState('');
  const data = freshCreator ? { ...creator, ...freshCreator } : (creator || {});
  const instagram = data.instagramClient || data.instagram || {};
  const audience = instagram.audience || data.audience || {};
  const followers = Number(data.followers || instagram.followersCount || 0);
  const views = topAverageViews(data);
  const engagement = Number(data.engagementRate || data.engagement || instagram.engagementRate || 0);
  const handle = String(data.handle || data.handleLower || data.username || instagram.username || '').replace(/^@/, '');
  const name = data.name || data.fullName || instagram.name || 'Creator';
  const niche = data.niche || data.category || 'Creator';
  const photo = data.pfp || data.photoURL || data.photoUrl || data.avatar || instagram.profilePictureUrl || '';
  const selectedTheme = themes.find(t => t.id === theme) || themes[0];
  const previewTheme = themes.find(t => t.id === (showTemplates ? draftTheme : theme)) || themes[0];
  const formats = kitList(contentFormats);
  const collaborations = parseKitBrands(collaborationsText);
  const derivedAudience = dominantKitAudience(audience);
  const gender = kitGenderSplit(audience);
  const pct = (manual, automatic) => manual !== '' && manual !== null && manual !== undefined && Number.isFinite(Number(manual)) ? Math.max(0, Math.min(100, Number(manual))) : automatic;
  const women = pct(womenShare, gender.women);
  const men = pct(menShare, gender.men);
  const other = pct(otherShare, gender.other);
  const audienceValue = dominantAudience.trim() || derivedAudience;
  const profilePath = creatorProfilePath(handle);
  const shareText = useMemo(() => [name, handle ? '@' + handle : '', headline, niche, city, 'Followers: ' + count(followers), views ? 'Average views: ' + count(views) : '', engagement ? 'Engagement rate: ' + engagement + '%' : '', bio, 'Content formats: ' + contentFormats, email ? 'Contact: ' + email : ''].filter(Boolean).join('\n'), [name, handle, headline, niche, city, followers, views, engagement, bio, contentFormats, email]);

  useEffect(() => {
    setHeadline(creator?.headline || creator?.title || '');
    setCoverImage(creator?.coverImageUrl || creator?.coverImage || creator?.bannerUrl || '');
    setBio(creator?.bio || creator?.instagram?.bio || creator?.instagramClient?.bio || '');
    setEmail(creator?.businessEmail || creator?.email || '');
    setCity(creator?.city || '');
    setContentFormats(inferKitFormats(creator));
    setDominantAudience(creator?.mediaKitAudience || creator?.dominantAudience || '');
    setWomenShare(creator?.mediaKitGenderSplit?.women ?? '');
    setMenShare(creator?.mediaKitGenderSplit?.men ?? '');
    setOtherShare(creator?.mediaKitGenderSplit?.other ?? '');
    setCollaborationsText(kitBrandsText(creator?.pastCollaborations || creator?.brandCollaborations || creator?.previousCollaborations || creator?.collaboratedBrands || []));
    setOpenForCollabs(creator?.openForCollabs !== false && creator?.openToCollaborations !== false);
  }, [creator?.id, creator?.headline, creator?.title, creator?.bio, creator?.businessEmail, creator?.email, creator?.city, creator?.contentFormats, creator?.niche, creator?.category, creator?.instagram?.username, creator?.instagramClient?.username]);

  const wait = ms => new Promise(resolve => window.setTimeout(resolve, ms));
  const createMediaKit = async () => {
    if (stage !== 'intro') return;
    setStage('loading');
    setLoadingStep(0);
    let latest = creator || {};
    try {
      await ensureFirebase();
      if (creator?.id) {
        const snap = await getDoc(doc(db(), 'creators', creator.id));
        if (snap.exists()) latest = { ...creator, ...snap.data(), id: creator.id };
      }
    } catch { /* Keep the live profile values available if refresh is offline. */ }
    setFreshCreator(latest);
    const ig = latest.instagramClient || latest.instagram || {};
    setHeadline(latest.headline || latest.title || '');
    setCoverImage(latest.coverImageUrl || latest.coverImage || latest.bannerUrl || '');
    setBio(latest.bio || ig.bio || '');
    setEmail(latest.businessEmail || latest.email || '');
    setCity(latest.city || '');
    setContentFormats(inferKitFormats(latest));
    setDominantAudience(latest.mediaKitAudience || latest.dominantAudience || '');
    setWomenShare(latest.mediaKitGenderSplit?.women ?? '');
    setMenShare(latest.mediaKitGenderSplit?.men ?? '');
    setOtherShare(latest.mediaKitGenderSplit?.other ?? '');
    setCollaborationsText(kitBrandsText(latest.pastCollaborations || latest.brandCollaborations || latest.previousCollaborations || latest.collaboratedBrands || []));
    setOpenForCollabs(latest.openForCollabs !== false && latest.openToCollaborations !== false);
    await wait(650);
    setLoadingStep(1);
    await wait(900);
    setStage('success');
    await wait(1500);
    setStage('kit');
  };

  const payload = normalizedHandle => ({
    creatorId: creator?.id || data.id || '',
    creatorName: name, handle: normalizedHandle || handle, headline, title: headline,
    coverImage, coverImageUrl: coverImage, theme, bio, email, city, niche, photo,
    followers, avgViews: views, engagementRate: engagement, platform: 'Instagram',
    contentFormats: formats, services: formats.join(', '),
    mediaKitAudience: dominantAudience.trim(),
    genderSplit: { women, men, other },
    mediaKitGenderSplit: { women: womenShare, men: menShare, other: otherShare },
    audience: audience || {}, pastCollaborations: collaborations, openForCollabs,
    collancerProfileUrl: profilePath, updatedAt: serverTimestamp(),
  });

  useEffect(() => {
    if (!creator?.id || stage !== 'kit') return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setDraftSaveStatus('saving');
      try {
        await ensureFirebase();
        await setDoc(doc(db(), 'mediaKits', creator.id), payload(handle), { merge: true });
        if (!cancelled) setDraftSaveStatus('saved');
      } catch {
        if (!cancelled) setDraftSaveStatus('local');
      }
    }, 550);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [creator?.id, stage, handle, name, headline, coverImage, theme, bio, email, city, niche, photo, followers, views, engagement, contentFormats, dominantAudience, womenShare, menShare, otherShare, collaborationsText, openForCollabs]);

  const applyTemplate = () => {
    setTheme(draftTheme);
    setShowTemplates(false);
    setShareUrl(current => {
      if (!current) return current;
      try { const url = new URL(current); url.searchParams.set('style', draftTheme); return url.toString(); } catch { return current; }
    });
    toast.ok('Your media kit has been restyled.');
    window.setTimeout(() => document.querySelector('.cl-mk-document')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  };
  const copyDetails = async () => {
    try { await navigator.clipboard.writeText(shareText); toast.ok('Media kit details copied.'); } catch { toast.err('Could not copy.'); }
  };
  const exportPdf = () => { try { window.print(); } catch { toast.err('PDF export is not available in this browser.'); } };
  const share = async () => {
    if (!creator?.id) { toast.err('Your profile is still loading.'); return; }
    if (!handle) { toast.err('Add or confirm your public creator handle in Profile before publishing.'); return; }
    setSaving(true);
    try {
      await ensureFirebase();
      const normalizedHandle = handle.trim().toLowerCase().replace(/^@/, '');
      if (!/^[a-z0-9._]{1,30}$/.test(normalizedHandle)) { toast.err('Your public handle contains unsupported characters. Update it in Profile and try again.'); return; }
      const handleRef = doc(db(), 'creatorHandles', normalizedHandle);
      const handleSnap = await getDoc(handleRef);
      if (handleSnap.exists() && handleSnap.data().creatorId !== creator.id) throw new Error('handle-taken');
      await setDoc(doc(db(), 'mediaKits', creator.id), { ...payload(normalizedHandle), isPublic: true }, { merge: true });
      if (!handleSnap.exists()) await setDoc(handleRef, { creatorId: creator.id, handle: normalizedHandle, handleLower: normalizedHandle, updatedAt: serverTimestamp() }, { merge: true });
      const url = new URL('/media-kit/' + encodeURIComponent(normalizedHandle), window.location.origin);
      url.searchParams.set('style', theme);
      setShareUrl(url.toString());
      try { await navigator.clipboard.writeText(url.toString()); toast.ok('Published media kit link copied.'); } catch { toast.ok('Public media kit link created.'); }
    } catch (error) {
      if (error?.message === 'handle-taken') toast.err('That handle is already linked to another creator. Check your public handle and try again.');
      else toast.err('Could not publish the media kit. Please try again.');
    } finally { setSaving(false); }
  };

  const loadingTitles = ['Fetching your account details', 'Creating your media kit'];
  const field = (label, value, setter, placeholder, extra = {}) => <Field label={label} hint={extra.hint}><Input value={value} onChange={event => setter(event.target.value)} placeholder={placeholder} inputType={extra.inputType || 'text'} /></Field>;
  const genderBar = (label, value, kind) => <div className="cl-mk-gender-row" key={label}><div><span>{label}</span><strong>{value === null || value === undefined || value === '' ? 'Add data' : Math.round(Number(value)) + '%'}</strong></div><div className="cl-mk-gender-track"><i className={'gender-' + kind} style={{ width: value === null || value === undefined || value === '' ? '0%' : Math.max(0, Math.min(100, Number(value))) + '%' }}/></div></div>;

  return <div className="cl-tools-stack cl-media-kit-workspace">
    {stage === 'intro' && <section className="cl-kit-intro"><div className="cl-kit-intro-copy"><div className="cl-kit-eyebrow"><span className="cl-kit-eyebrow-dot"/> CREATOR STUDIO <span>/</span> MEDIA KIT</div><h2>Build a portfolio brands <span>remember.</span></h2><p className="cl-kit-intro-description">Create a complete creator presentation—not just a stats card. Your profile and Instagram analytics are filled automatically wherever data is available. Complete any missing details, choose a distinctive 3D design and publish your media kit.</p><div className="cl-kit-intro-proof"><span><strong>{count(followers)}</strong> profile followers</span><i/><span><strong>7 sections</strong> for brand decision-making</span><i/><span><strong>13 styles</strong> built from different visual systems</span></div><Button block size="lg" onClick={createMediaKit} icon={Sparkles}>Create your media kit <ArrowRight size={16}/></Button><div className="cl-kit-intro-note"><CheckCircle2 size={14}/> Profile data first · fill only what's missing · publish when ready</div></div><div className="cl-kit-intro-art" aria-hidden="true"><div className="cl-kit-orbit cl-kit-orbit-a"/><div className="cl-kit-orbit cl-kit-orbit-b"/><div className="cl-kit-art-glass"><div className="cl-kit-art-top"><span>COLLANCER / STUDIO</span><span>CREATOR 001</span></div><div className="cl-kit-art-avatar">{photo ? <img src={photo} alt=""/> : <Sparkles size={30}/>}</div><div className="cl-kit-art-kicker">{niche}</div><div className="cl-kit-art-name">{name}</div><div className="cl-kit-art-handle">{handle ? '@' + handle : '@yourhandle'}</div><div className="cl-kit-art-stats"><span><strong>{count(followers)}</strong><small>FOLLOWERS</small></span><span><strong>{views ? count(views) : '—'}</strong><small>AVG VIEWS</small></span><span><strong>{engagement ? engagement + '%' : '—'}</strong><small>ENGAGEMENT</small></span></div><div className="cl-kit-art-foot"><span>YOUR STORY / YOUR NUMBERS</span><Sparkles size={14}/></div></div><div className="cl-kit-orbit-chip"><Sparkles size={15}/><span>Built around your story</span></div></div></section>}

    {stage === 'loading' && <section className="cl-kit-flow-screen" role="status" aria-live="polite"><div className="cl-kit-loader-emblem"><span className="cl-kit-loader-ring"/><span className="cl-kit-loader-ring cl-kit-loader-ring-two"/><span className="cl-kit-loader-core"><Sparkles size={28}/></span></div><span className="cl-kit-flow-kicker">COLLANCER MEDIA KIT STUDIO</span><h2 key={loadingStep}>{loadingTitles[loadingStep]}</h2><p>{loadingStep === 0 ? 'Bringing your saved creator profile and connected audience data together.' : 'Building your portfolio sections and ready-to-personalize details.'}</p><div className="cl-kit-progress-track"><span style={{ width: loadingStep === 0 ? '44%' : '100%' }}/></div><div className="cl-kit-loading-steps">{loadingTitles.map((label, i) => <div className={'cl-kit-loading-step ' + (i < loadingStep ? 'is-done' : i === loadingStep ? 'is-current' : '')} key={label}><span>{i < loadingStep ? <Check size={13}/> : <span className="cl-kit-step-dot"/>}</span>{label}</div>)}</div></section>}

    {stage === 'success' && <div className="cl-kit-success-overlay" role="dialog" aria-modal="true" aria-label="Media kit successfully created"><div className="cl-kit-success-card"><div className="cl-kit-success-orbit"><span/><span/><span/><div><CheckCircle2 size={34}/></div></div><div className="cl-kit-success-eyebrow">YOUR CREATOR STORY, BEAUTIFULLY PACKAGED</div><h2>Media kit successfully created</h2><p>Your profile information is ready. Complete the missing pieces and choose the visual system that feels like you.</p><div className="cl-kit-success-bottom"><span/><span/><span/></div></div></div>}

    {stage === 'kit' && <>
      {showTemplates && <section className="cl-kit-template-gallery"><div className="cl-kit-gallery-heading"><div><div className="cl-kit-eyebrow"><span className="cl-kit-eyebrow-dot"/> TEMPLATE LIBRARY <span>/</span> 13 DESIGN SYSTEMS</div><h2>Thirteen looks. Thirteen personalities.</h2><p>These are different material and layout systems—not the same card with a new palette. Select a style and confirm to apply it.</p></div><button type="button" className="cl-kit-gallery-close" onClick={() => { setDraftTheme(theme); setShowTemplates(false); }} aria-label="Close templates">×</button></div><div className="cl-template-grid cl-template-grid-premium">{themes.map(t => <button type="button" key={t.id} aria-pressed={draftTheme === t.id} onClick={() => setDraftTheme(t.id)} className={'cl-template-choice cl-template-choice-premium ' + t.cls + (draftTheme === t.id ? ' is-active' : '')}><span className={'cl-template-swatch ' + t.cls}><i/><i/><i/><b/></span><span className="cl-template-choice-meta"><small>{t.family}</small>{theme === t.id && <em>APPLIED</em>}</span><strong>{t.name}</strong><small className="cl-template-description">{t.note}</small><span className="cl-template-select-cue">{draftTheme === t.id ? <><CheckCircle2 size={15}/> Selected</> : <>Select design <ArrowRight size={13}/></>}</span></button>)}</div><div className="cl-kit-gallery-actions"><p><strong>{(themes.find(t => t.id === draftTheme) || themes[0]).name}</strong> is selected. Confirm to apply the full design system.</p><div><Button variant="light" onClick={() => { setDraftTheme(theme); setShowTemplates(false); }}>Cancel</Button><Button onClick={applyTemplate} icon={CheckCircle2}>Confirm design</Button></div></div></section>}

      <div className="cl-kit-ready-heading"><div><div className="cl-kit-eyebrow"><span className="cl-kit-eyebrow-dot"/> MEDIA KIT READY</div><h2>Your complete creator portfolio.</h2><p>Creator and Instagram details are filled wherever available. The open editor lets you finish missing information before publishing.</p></div><span className={'cl-kit-save-indicator save-' + draftSaveStatus}>{draftSaveStatus === 'saving' ? 'Saving draft…' : draftSaveStatus === 'saved' ? 'Draft saved' : draftSaveStatus === 'local' ? 'Preview only' : 'Preparing draft'}</span></div>

      <article key={theme} className={'cl-mk-document theme-' + theme + ' ' + selectedTheme.cls}>
        <div className="cl-mk-document-bar"><span>COLLANCER / CREATOR MEDIA KIT</span><span>{selectedTheme.marker} <i/> 2026</span></div>
        <section className="cl-mk-hero">
          <div className="cl-mk-cover">{coverImage ? <img src={coverImage} alt=""/> : <div className="cl-mk-cover-art"><i/><i/><i/></div>}<div className="cl-mk-cover-overlay"/><div className="cl-mk-cover-label"><span>CREATOR PORTFOLIO</span><span>01 / INTRODUCTION</span></div></div>
          <div className="cl-mk-hero-profile"><div className="cl-mk-avatar-frame">{photo ? <img src={photo} alt={name + ' profile'}/> : <div className="cl-mk-avatar-placeholder"><Sparkles size={24}/></div>}</div><div className="cl-mk-profile-copy"><div className="cl-mk-pretitle">{niche}</div><h2>{name}</h2><div className="cl-mk-username">{handle ? '@' + handle : <span className="cl-mk-missing">Add Instagram username</span>}</div><div className="cl-mk-identity-tags">{city ? <span><MapPin size={12}/>{city}</span> : <span className="is-missing">Add city</span>}<span>{niche}</span></div></div><span className={'cl-mk-open-tag ' + (openForCollabs ? 'is-open' : 'is-closed')}><i/>{openForCollabs ? 'Open for collabs' : 'Currently unavailable'}</span></div>
          <div className="cl-mk-headline">{headline || <span className="cl-mk-missing">Add your creator title / headline</span>}</div>
        </section>

        <div className="cl-mk-sections">
          <section className="cl-mk-section cl-mk-about"><div className="cl-mk-section-index">01 <span>ABOUT</span></div><div className="cl-mk-section-main"><h3>About <span>the creator</span></h3><p className={bio ? '' : 'cl-mk-empty-copy'}>{bio || 'Add a concise introduction about your story, creative point of view and the value you bring to brand partners.'}</p></div></section>

          <section className="cl-mk-section cl-mk-platforms"><div className="cl-mk-section-index">02 <span>PLATFORMS</span></div><div className="cl-mk-section-main"><h3>Platform <span>performance</span></h3><div className="cl-mk-platform-card"><div className="cl-mk-platform-head"><span className="cl-mk-platform-icon"><Instagram size={21}/></span><span className="cl-mk-platform-brand"><strong>Instagram</strong><small>{handle ? '@' + handle : 'Add a public username'}</small></span><span className="cl-mk-platform-badge">{data.instagram || data.instagramClient ? 'Connected' : 'Profile'}</span></div><div className="cl-mk-platform-metrics"><div><strong>{count(followers)}</strong><span>Followers</span></div><div><strong>{views ? count(views) : '—'}</strong><span>Avg. views</span></div><div><strong>{engagement ? engagement + '%' : '—'}</strong><span>Engagement rate</span></div></div>{!views || !engagement ? <p className="cl-mk-note">Connect Instagram or complete these metrics in your creator profile to strengthen this section.</p> : null}</div></div></section>

          <section className="cl-mk-section cl-mk-audience"><div className="cl-mk-section-index">03 <span>AUDIENCE</span></div><div className="cl-mk-section-main"><h3>Who <span>you reach</span></h3><div className="cl-mk-audience-grid"><div className="cl-mk-audience-feature"><span className="cl-mk-mini-label">DOMINANT AUDIENCE</span><strong>{audienceValue || <span className="cl-mk-missing">Add your dominant audience</span>}</strong><p>{audienceValue ? 'Based on available audience insights or your own details.' : 'Fill this in if Instagram does not provide demographic data.'}</p>{dominantDemographicRows(audience).length > 0 && <div className="cl-mk-country-list">{dominantDemographicRows(audience).map(row => <div key={row.name}><span>{row.name}</span><strong>{Number(row.value) > 0 && Number(row.value) <= 1 ? Math.round(Number(row.value) * 100) + '%' : Number(row.value) > 1 ? Math.round(Number(row.value)) + '%' : '—'}</strong></div>)}</div>}</div><div className="cl-mk-gender-card"><div className="cl-mk-mini-label">GENDER SPLIT</div><div className="cl-mk-gender-note">{gender.women !== null || gender.men !== null ? 'Connected Instagram demographics' : 'Add details when available'}</div>{genderBar('Women', women, 'women')}{genderBar('Men', men, 'men')}{genderBar('Other / not specified', other, 'other')}<p className="cl-mk-note">Bars use Instagram demographics where available, or values you enter in the editor.</p></div></div></div></section>

          <section className="cl-mk-section cl-mk-formats"><div className="cl-mk-section-index">04 <span>CONTENT</span></div><div className="cl-mk-section-main"><h3>Content <span>formats</span></h3><div className="cl-mk-format-grid">{formats.length ? formats.map((format, i) => <div className="cl-mk-format-tile" key={format}><span className="cl-mk-format-index">0{i + 1}</span><strong>{format}</strong><small>Creative format</small></div>) : <div className="cl-mk-empty-panel"><strong>What do you create?</strong><span>Add Reels, UGC, tutorials, product photography, styling, reviews or your core formats in Customize your kit.</span></div>}</div></div></section>

          <section className="cl-mk-section cl-mk-collaborations"><div className="cl-mk-section-index">05 <span>SELECTED WORK</span></div><div className="cl-mk-section-main"><h3>Past <span>collaborations</span></h3><p className="cl-mk-section-desc">Selected brand partnerships and creator work.</p>{collaborations.length ? <div className="cl-mk-brand-rail">{collaborations.map((brand, i) => <div className="cl-mk-brand" key={brand.name + i}>{brand.logoUrl ? <img src={brand.logoUrl} alt={brand.name}/> : <span className="cl-mk-brand-monogram">{brand.name.split(/\s+/).map(x => x[0]).join('').slice(0, 3).toUpperCase()}</span>}<small>{brand.name}</small></div>)}</div> : <div className="cl-mk-empty-panel"><strong>Your brand history belongs here.</strong><span>Add previous brand names and optional logo URLs. Only list collaborations you have actually completed.</span></div>}</div></section>
        </div>

        <section className="cl-mk-cta"><div className="cl-mk-cta-shape"><i/><i/></div><div className="cl-mk-cta-content"><div className="cl-mk-mini-label">LET'S MAKE SOMETHING MATTER</div><h3>Interested in working together?</h3><p>Have a campaign in mind? Let's turn your brief into something people remember.</p>{email && <div className="cl-mk-cta-email"><Mail size={14}/>{email}</div>}<a className="cl-mk-book-link" href={profilePath} onClick={event => { if (!handle) { event.preventDefault(); toast.info('Add your public handle in Profile so brands can book you on Collancer.'); } }}><span>Book me on Collancer</span><ArrowRight size={17}/></a></div><div className="cl-mk-cta-signature"><span>CREATOR × BRAND</span><strong>Collancer</strong><small>Where influence meets industry</small></div></section>
        <div className="cl-mk-document-footer"><span>CREATOR MEDIA KIT</span><span>DESIGNED WITH COLLANCER <i/> {handle ? '@' + handle : name}</span></div>
      </article>

      <div className="cl-kit-primary-actions"><Button onClick={() => { setDraftTheme(theme); setShowTemplates(true); }} icon={Palette}>Explore templates</Button><Button variant="light" onClick={copyDetails} icon={FileText}>Copy details</Button><Button variant="light" onClick={exportPdf} icon={Download}>Export / print PDF</Button><Button onClick={share} loading={saving} icon={ExternalLink}>Publish media kit</Button></div>
      <details className="cl-kit-edit-details" open><summary><span><FileText size={17}/> Customize your kit</span><small>Complete missing details · add cover, audience and brand history</small><span className="cl-kit-edit-chevron">＋</span></summary><Card>
        <div className="cl-kit-edit-grid">
          {field('Creator title / headline', headline, setHeadline, 'e.g. Beauty & lifestyle creator')}
          {field('City / location', city, setCity, 'e.g. Mumbai, India')}
          {field('Cover image URL', coverImage, setCoverImage, 'Paste a public image URL', { hint: 'A wide landscape image works best. Leave blank for the template artwork.' })}
          {field('Business contact email', email, setEmail, 'hello@example.com', { inputType: 'email' })}
        </div>
        <Field label="About you" hint="Your Collancer bio is imported automatically. Edit it for brand partners."><TextArea value={bio} onChange={event => setBio(event.target.value)} maxLength={700} placeholder="Tell brands about your story, audience and creative point of view."/></Field>
        <Field label="Content formats" hint="Comma-separated, e.g. Reels, UGC, tutorials, product photography."><Input value={contentFormats} onChange={event => setContentFormats(event.target.value)} placeholder="Add the content formats you regularly create"/></Field>
        <div className="cl-kit-edit-grid">
          {field('Dominant audience', dominantAudience, setDominantAudience, 'e.g. Women 18–34 in India', { hint: 'Optional if connected Instagram demographics are available.' })}
          {field('Women audience (%)', String(womenShare ?? ''), setWomenShare, 'e.g. 68', { inputType: 'number' })}
          {field('Men audience (%)', String(menShare ?? ''), setMenShare, 'e.g. 29', { inputType: 'number' })}
          {field('Other / unspecified (%)', String(otherShare ?? ''), setOtherShare, 'e.g. 3', { inputType: 'number' })}
        </div>
        <Field label="Past brand collaborations" hint="One brand per line. Optional format: Brand Name | https://public-logo-image-url. Only add completed collaborations."><TextArea value={collaborationsText} onChange={event => setCollaborationsText(event.target.value)} maxLength={3000} rows={4} placeholder={'Example Brand | https://example.com/brand-logo.png\nAnother Brand'}/></Field>
        <label className="cl-kit-collab-toggle"><input type="checkbox" checked={openForCollabs} onChange={event => setOpenForCollabs(event.target.checked)}/><span><strong>Open for collaborations</strong><small>Show the availability tag on your kit.</small></span></label>
        <div className="cl-kit-edit-foot"><span>Profile data is imported wherever available. Fill the remaining details above to complete the portfolio.</span><Button variant="light" onClick={() => document.querySelector('.cl-mk-document')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>Preview my kit</Button></div>
      </Card></details>
      {shareUrl && <Card className="cl-glass"><div className="cl-small" style={{ fontWeight: 800, marginBottom: 8 }}>Your published media kit</div><div className="cl-share-url">{shareUrl}</div><div className="cl-row" style={{ gap: 8, marginTop: 10 }}><Button onClick={() => { navigator.clipboard?.writeText(shareUrl).then(() => toast.ok('Link copied.')).catch(() => toast.err('Copy failed.')); }} icon={Copy}>Copy link</Button><Button variant="light" onClick={() => window.open(shareUrl, '_blank', 'noopener,noreferrer')} icon={ExternalLink}>Preview public kit</Button></div><p className="cl-small cl-muted" style={{ marginTop: 8 }}>Only include contact details and brand marks that you have permission to share publicly.</p></Card>}
    </>}
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
    const remaining = Math.max(0, 4 - evidence.length);
    const chosen = Array.from(files || []).slice(0, remaining);
    if (!chosen.length) { toast.err('You can attach up to 4 evidence images per report. Remove one before adding another.'); return; }
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
      <Field label="What happened?"><TextArea value={description} onChange={e => setDescription(e.target.value)} maxLength={600} placeholder="Describe the interaction, requested payment, missing payout, suspicious link or other evidence. Avoid posting phone numbers, addresses, OTPs or other private data."/></Field>
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
  const [tab, setTab] = useState(null);
  const toolOptions = [
    { key: 'media', title: 'Media Kit Builder', description: 'Create a polished creator portfolio with your profile details, audience stats and shareable media kit.', icon: FileText },
    { key: 'calculator', title: 'Creator Charges Calculator', description: 'Estimate a fair starting quote based on your followers, average views, deliverables and usage rights.', icon: Calculator },
    { key: 'scams', title: 'Scam Alerts', description: 'Review community-submitted warnings and report suspicious brands, agencies or collaboration offers.', icon: ShieldAlert },
  ];
  return <Page pageKey="creator-tools"><TopBar title="Creator Tools" subtitle="Build, price and protect your creator business" left={<IconBtn icon={ArrowLeft} label="Back" onClick={tab ? () => setTab(null) : onBack}/>}/><div className="cl-container cl-tools-container" style={{ paddingTop: 14, paddingBottom: 28 }}>{tab ? <div className="cl-tools-opened"><button type="button" className="cl-tools-back" onClick={() => setTab(null)}><ArrowLeft size={16}/> All tools</button>{tab === 'media' && <MediaKit creator={creator}/>} {tab === 'calculator' && <ChargesCalculator creator={creator}/>} {tab === 'scams' && <ScamAlerts creator={creator}/>}</div> : <div className="cl-tool-options" aria-label="Creator tools">{toolOptions.map(({ key, title, description, icon: ToolIcon }) => <button type="button" className="cl-tool-option" key={key} onClick={() => setTab(key)}><span className="cl-tool-option-icon"><ToolIcon size={21}/></span><span className="cl-tool-option-copy"><strong>{title}</strong><small>{description}</small></span><span className="cl-tool-option-arrow" aria-hidden="true"><ArrowRight size={19}/></span></button>)}</div>}</div><style>{`
    .cl-tool-options{display:grid;gap:12px;max-width:900px;margin:0 auto}
    .cl-tool-option{width:100%;display:grid;grid-template-columns:52px minmax(0,1fr) 42px;align-items:center;gap:16px;padding:20px;text-align:left;color:var(--ink);border:1px solid var(--glass-border);border-radius:18px;background:linear-gradient(135deg,var(--surface-1),var(--surface-2));box-shadow:var(--shadow-card),inset 0 1px 0 rgba(255,255,255,.45);cursor:pointer;transition:transform .22s ease,border-color .22s ease,box-shadow .22s ease}
    .cl-tool-option:hover{transform:translateY(-2px);border-color:var(--cyan);box-shadow:0 12px 30px rgba(15,65,85,.1),0 0 0 2px var(--cyan-glow)}
    .cl-tool-option:focus-visible,.cl-tools-back:focus-visible{outline:3px solid var(--cyan);outline-offset:3px}
    .cl-tool-option-icon{width:48px;height:48px;display:grid;place-items:center;border:1px solid var(--glass-border);border-radius:14px;background:linear-gradient(145deg,var(--surface-1),var(--surface-3));color:var(--cyan-deep);box-shadow:inset 0 1px 0 rgba(255,255,255,.65),0 5px 12px rgba(10,45,65,.07)}
    .cl-tool-option-copy{display:grid;gap:5px;min-width:0}
    .cl-tool-option-copy strong{font-size:15px;line-height:1.35;font-weight:800;letter-spacing:-.02em}
    .cl-tool-option-copy small{font-size:12px;line-height:1.6;color:var(--muted);font-weight:450}
    .cl-tool-option-arrow{width:38px;height:38px;display:grid;place-items:center;border:1px solid var(--line);border-radius:12px;background:var(--surface-1);color:var(--cyan-deep);transition:transform .22s ease,background .22s ease}
    .cl-tool-option:hover .cl-tool-option-arrow{transform:translateX(3px);background:var(--cyan-soft)}
    .cl-tools-opened{display:grid;gap:12px}
    .cl-tools-back{justify-self:start;display:inline-flex;align-items:center;gap:7px;padding:9px 12px;border:1px solid var(--line);border-radius:10px;background:var(--surface-1);color:var(--ink);font-size:12px;font-weight:750;cursor:pointer;transition:background .2s ease}
    .cl-tools-back:hover{background:var(--surface-2)}
    @media(max-width:520px){.cl-tool-option{grid-template-columns:42px minmax(0,1fr) 34px;gap:11px;padding:14px;border-radius:15px}.cl-tool-option-icon{width:40px;height:40px;border-radius:12px}.cl-tool-option-copy strong{font-size:13px}.cl-tool-option-copy small{font-size:11px}.cl-tool-option-arrow{width:32px;height:32px}}
    .cl-tools-container{max-width:980px}.cl-tools-stack{display:grid;gap:14px}.cl-template-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.cl-template-choice{min-width:0;text-align:left;border:1px solid var(--line);border-radius:12px;padding:10px;background:var(--surface-2);color:var(--ink);display:grid;gap:5px;cursor:pointer;transition:transform .22s ease,border-color .22s ease}.cl-template-choice:hover{transform:translateY(-2px)}.cl-template-choice.is-active{border-color:var(--cyan);box-shadow:0 0 0 2px var(--cyan-glow)}.cl-template-choice strong{font-size:12px}.cl-template-choice small{font-size:11px;color:var(--muted);line-height:1.35}.cl-template-swatch{height:48px;border-radius:8px;display:flex;gap:4px;align-items:flex-end;padding:6px;overflow:hidden}.cl-template-swatch i{display:block;height:70%;width:24%;border-radius:4px;background:rgba(255,255,255,.65)}.mk-essential{--kit-a:#d9f6fb;--kit-b:#fff;--kit-ink:#14232c}.mk-glass{--kit-a:#17283d;--kit-b:#3d7190;--kit-ink:#fff}.mk-clay{--kit-a:#f4c7b8;--kit-b:#f8e8d9;--kit-ink:#4c2d2c}.mk-minimal{--kit-a:#f2eee7;--kit-b:#ded8cd;--kit-ink:#1b1b1b}.cl-template-swatch.mk-essential{background:linear-gradient(135deg,#d9f6fb,#fff)}.cl-template-swatch.mk-glass{background:linear-gradient(135deg,#17283d,#3d7190)}.cl-template-swatch.mk-clay{background:linear-gradient(135deg,#f4c7b8,#f8e8d9)}.cl-template-swatch.mk-minimal{background:linear-gradient(135deg,#f2eee7,#ded8cd)}.cl-media-preview{position:relative;isolation:isolate;overflow:hidden;border-radius:22px;padding:clamp(18px,4vw,34px);color:var(--kit-ink);background:linear-gradient(135deg,var(--kit-a),var(--kit-b));box-shadow:0 22px 60px rgba(0,0,0,.13);animation:cl-kit-enter .65s cubic-bezier(.2,.8,.2,1) both}.cl-media-preview:before{content:'';position:absolute;z-index:-1;width:230px;height:230px;border-radius:50%;right:-60px;top:-85px;background:rgba(255,255,255,.22);filter:blur(2px);animation:cl-kit-float 8s ease-in-out infinite alternate}.mk-glass.cl-media-preview{border:1px solid rgba(255,255,255,.4);background:linear-gradient(135deg,rgba(25,45,67,.96),rgba(35,112,139,.85));backdrop-filter:blur(18px);--kit-ink:#fff}.mk-clay.cl-media-preview{border-radius:30px;box-shadow:inset 8px 8px 20px rgba(255,255,255,.28),inset -8px -8px 20px rgba(90,40,35,.08),0 18px 36px rgba(0,0,0,.12)}.mk-minimal.cl-media-preview{border-radius:2px;box-shadow:none}.cl-media-preview-top,.cl-media-footer{display:flex;justify-content:space-between;gap:12px;align-items:center;font-size:10px;font-weight:800;letter-spacing:.12em}.cl-media-pill{border:1px solid currentColor;border-radius:999px;padding:5px 8px;letter-spacing:.06em}.cl-media-identity{display:flex;gap:16px;align-items:center;margin:32px 0 20px;min-width:0}.cl-media-avatar{width:78px;height:78px;object-fit:cover;border-radius:22px;border:1px solid rgba(255,255,255,.6);box-shadow:0 8px 22px rgba(0,0,0,.16);flex-shrink:0}.mk-clay .cl-media-avatar{border-radius:26px}.mk-minimal .cl-media-avatar{border-radius:0}.cl-media-avatar-fallback{display:grid;place-items:center;background:rgba(255,255,255,.25)}.cl-media-kicker{font-size:10px;letter-spacing:.12em;font-weight:800;opacity:.75}.cl-media-identity h2{font-size:clamp(24px,5vw,42px);line-height:1.06;margin:5px 0;overflow-wrap:anywhere}.cl-media-identity p{margin:0;opacity:.75;font-size:13px}.cl-media-bio{max-width:650px;line-height:1.7;font-size:14px;white-space:pre-wrap;overflow-wrap:anywhere}.cl-media-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:24px 0}.cl-media-stats>div{padding:14px;border:1px solid rgba(255,255,255,.28);border-radius:12px;background:rgba(255,255,255,.12);min-width:0}.mk-glass .cl-media-stats>div{backdrop-filter:blur(10px)}.mk-clay .cl-media-stats>div{border-radius:20px;box-shadow:inset 3px 3px 7px rgba(255,255,255,.18),inset -3px -3px 7px rgba(0,0,0,.04)}.mk-minimal .cl-media-stats>div{border-radius:0;background:transparent;border-color:currentColor}.cl-media-stats strong,.cl-media-stats span{display:block;overflow-wrap:anywhere}.cl-media-stats strong{font-size:clamp(16px,3vw,25px);font-variant-numeric:tabular-nums}.cl-media-stats span{font-size:11px;opacity:.75;margin-top:4px}.cl-media-bottom{display:grid;grid-template-columns:1fr 1fr;gap:18px;padding-top:18px;border-top:1px solid rgba(255,255,255,.28)}.cl-media-bottom span,.cl-media-bottom strong{display:block}.cl-media-bottom span{font-size:9px;letter-spacing:.12em;opacity:.7;margin-bottom:5px}.cl-media-bottom strong{font-size:12px;overflow-wrap:anywhere}.cl-media-contact{margin-top:16px;font-size:12px;overflow-wrap:anywhere}.cl-media-footer{margin-top:28px;padding-top:14px;border-top:1px solid rgba(255,255,255,.2);font-size:9px;letter-spacing:.07em}.cl-kit-actions{flex-wrap:wrap}.cl-share-url{padding:10px;border-radius:8px;background:var(--surface-2);font-size:12px;overflow-wrap:anywhere}.cl-price-result{padding:20px;margin-top:14px;border:1px solid var(--glass-border);border-radius:16px;background:linear-gradient(135deg,var(--glass-hi),var(--glass-lo));box-shadow:var(--shadow-card)}.cl-price-main{font-size:clamp(25px,5vw,34px);font-weight:850;letter-spacing:-.04em;margin:7px 0;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}.cl-price-note{font-size:12px;color:var(--muted);line-height:1.6;margin-top:10px}.cl-evidence-upload{display:flex;align-items:center;gap:10px;padding:14px;border:1px dashed var(--line);border-radius:12px;cursor:pointer}.cl-evidence-upload span,.cl-evidence-upload small{display:block}.cl-evidence-upload small{font-size:11px;color:var(--muted);margin-top:3px}.cl-evidence-upload input{max-width:180px;font-size:12px}.cl-evidence-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.cl-evidence-item{position:relative;min-width:0}.cl-evidence-grid img{display:block;width:100%;height:100px;object-fit:cover;border-radius:8px;border:1px solid var(--line)}.cl-evidence-item button{position:absolute;right:4px;top:4px;border:0;border-radius:50%;width:24px;height:24px;background:rgba(0,0,0,.72);color:white;font-size:18px;cursor:pointer}.cl-tools-container .cl-input{width:100%;min-width:0}.cl-tools-container .cl-field{min-width:0}@keyframes cl-kit-enter{from{opacity:0;transform:translateY(10px) scale(.99)}to{opacity:1;transform:translateY(0) scale(1)}}@keyframes cl-kit-float{from{transform:translate3d(0,0,0) rotate(0)}to{transform:translate3d(-22px,18px,0) rotate(14deg)}}@media(max-width:640px){.cl-template-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.cl-media-identity{gap:12px;margin:24px 0 16px}.cl-media-avatar{width:60px;height:60px;border-radius:16px}.cl-media-stats>div{padding:10px 8px}.cl-media-bottom{grid-template-columns:1fr}.cl-media-footer{align-items:flex-start;flex-direction:column}.cl-kit-actions>*{flex:1 1 140px}.cl-evidence-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.cl-evidence-grid img{height:120px}}@media(prefers-reduced-motion:reduce){.cl-media-preview,.cl-media-preview:before{animation:none!important}}

    .cl-tools-container{max-width:1120px}
    .cl-media-kit-workspace{gap:18px;min-width:0}
    .cl-kit-intro{position:relative;display:grid;grid-template-columns:minmax(0,1fr) minmax(310px,.92fr);gap:clamp(24px,5vw,64px);align-items:center;min-height:510px;padding:clamp(24px,5vw,54px);overflow:hidden;border:1px solid rgba(112,207,234,.24);border-radius:30px;background:radial-gradient(ellipse at 88% 8%,rgba(47,191,226,.19),transparent 38%),radial-gradient(ellipse at 0 100%,rgba(92,92,240,.13),transparent 42%),linear-gradient(135deg,var(--surface-1),var(--surface-2));box-shadow:0 24px 70px rgba(0,0,0,.10),inset 0 1px 0 rgba(255,255,255,.55)}
    .cl-kit-intro-copy{position:relative;z-index:2;min-width:0}
    .cl-kit-eyebrow{display:flex;align-items:center;gap:8px;color:var(--cyan-deep);font-size:10px;font-weight:850;letter-spacing:.15em;text-transform:uppercase}
    .cl-kit-eyebrow>span:not(.cl-kit-eyebrow-dot){opacity:.45}
    .cl-kit-eyebrow-dot{width:7px;height:7px;border-radius:50%;background:var(--cyan);box-shadow:0 0 0 4px var(--cyan-glow),0 0 14px var(--cyan)}
    .cl-kit-intro h2{max-width:600px;margin:22px 0 14px;font-size:clamp(34px,5vw,62px);line-height:.99;letter-spacing:-.065em;font-weight:850}
    .cl-kit-intro h2 span{display:block;color:var(--cyan-deep);text-shadow:0 8px 30px rgba(22,171,202,.14)}
    .cl-kit-intro-description{max-width:570px;color:var(--muted);font-size:14px;line-height:1.85;margin:0 0 23px}
    .cl-kit-intro-proof{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin:0 0 26px;font-size:11px;color:var(--muted)}
    .cl-kit-intro-proof span{display:grid;gap:2px;max-width:165px;overflow-wrap:anywhere}
    .cl-kit-intro-proof strong{font-size:13px;color:var(--ink);font-weight:800}
    .cl-kit-intro-proof i{height:22px;width:1px;background:var(--line)}
    .cl-kit-intro-copy>.cl-btn,.cl-kit-intro-copy>button{max-width:320px;min-height:48px;border-radius:14px;box-shadow:0 10px 28px rgba(27,172,203,.19);transition:transform .25s ease,box-shadow .25s ease}
    .cl-kit-intro-copy>.cl-btn:hover,.cl-kit-intro-copy>button:hover{transform:translateY(-2px);box-shadow:0 16px 32px rgba(27,172,203,.25)}
    .cl-kit-intro-note{display:flex;align-items:center;gap:7px;margin-top:14px;color:var(--muted);font-size:10px;line-height:1.5}
    .cl-kit-intro-note svg{flex-shrink:0;color:var(--cyan-deep)}
    .cl-kit-intro-art{position:relative;min-height:365px;display:grid;place-items:center;perspective:1300px;isolation:isolate}
    .cl-kit-orbit{position:absolute;left:50%;top:50%;border:1px solid rgba(72,199,228,.23);border-radius:50%;transform:translate(-50%,-50%) rotate(-24deg);pointer-events:none}
    .cl-kit-orbit-a{width:385px;height:295px;animation:cl-kit-orbit 16s linear infinite}
    .cl-kit-orbit-b{width:320px;height:410px;border-color:rgba(123,120,245,.18);transform:translate(-50%,-50%) rotate(47deg);animation:cl-kit-orbit 22s linear infinite reverse}
    .cl-kit-art-glass{position:relative;width:min(100%,340px);padding:22px 22px 16px;overflow:hidden;color:#f5fbff;border:1px solid rgba(239,252,255,.66);border-radius:23px;background:linear-gradient(135deg,rgba(255,255,255,.2),rgba(255,255,255,.035) 34%,rgba(87,204,237,.12) 72%,rgba(255,255,255,.18)),linear-gradient(135deg,rgba(14,36,60,.58),rgba(28,105,132,.32));backdrop-filter:blur(30px) saturate(185%);-webkit-backdrop-filter:blur(30px) saturate(185%);box-shadow:0 35px 80px rgba(0,0,0,.24),inset 0 1px 0 rgba(255,255,255,.84),inset 1px 0 0 rgba(255,255,255,.28),inset -1px 0 0 rgba(3,32,52,.22);transform:rotateY(-13deg) rotateX(7deg) rotateZ(-2deg);animation:cl-kit-card-float 6s ease-in-out infinite;transform-style:preserve-3d}
    .cl-kit-art-glass:before{content:'';position:absolute;inset:0;pointer-events:none;background:linear-gradient(115deg,rgba(255,255,255,.24),transparent 18%,transparent 64%,rgba(255,255,255,.13));border-radius:inherit}
    .cl-kit-art-top,.cl-kit-art-foot{position:relative;display:flex;justify-content:space-between;gap:8px;align-items:center;font-size:8px;font-weight:850;letter-spacing:.14em;opacity:.8}
    .cl-kit-art-avatar{width:56px;height:56px;margin:27px 0 12px;display:grid;place-items:center;overflow:hidden;border:1px solid rgba(255,255,255,.6);border-radius:18px;background:rgba(255,255,255,.18);box-shadow:0 12px 24px rgba(0,0,0,.18),inset 0 1px rgba(255,255,255,.55);transform:translateZ(22px)}
    .cl-kit-art-avatar img{width:100%;height:100%;object-fit:cover}
    .cl-kit-art-kicker{font-size:8px;letter-spacing:.13em;font-weight:800;opacity:.72;text-transform:uppercase}
    .cl-kit-art-name{margin-top:4px;font-size:27px;font-weight:850;letter-spacing:-.05em;line-height:1.06;overflow-wrap:anywhere}
    .cl-kit-art-handle{margin-top:5px;font-size:11px;opacity:.72}
    .cl-kit-art-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;margin:21px 0 19px}
    .cl-kit-art-stats span{min-width:0;padding:10px 8px;border:1px solid rgba(255,255,255,.24);border-radius:10px;background:rgba(255,255,255,.11);box-shadow:inset 0 1px 0 rgba(255,255,255,.17);backdrop-filter:blur(10px)}
    .cl-kit-art-stats strong,.cl-kit-art-stats small{display:block;overflow-wrap:anywhere}
    .cl-kit-art-stats strong{font-size:13px;font-variant-numeric:tabular-nums}
    .cl-kit-art-stats small{margin-top:4px;font-size:6px;font-weight:850;letter-spacing:.1em;opacity:.67}
    .cl-kit-art-foot{padding-top:12px;border-top:1px solid rgba(255,255,255,.22)}
    .cl-kit-orbit-chip{position:absolute;right:-8px;bottom:18px;display:flex;align-items:center;gap:8px;padding:10px 13px;border:1px solid rgba(255,255,255,.7);border-radius:13px;background:rgba(241,251,255,.76);color:#16364b;font-size:10px;font-weight:800;box-shadow:0 18px 38px rgba(18,64,84,.14),inset 0 1px 0 white;backdrop-filter:blur(16px);transform:translateZ(35px);animation:cl-kit-chip-float 4.6s ease-in-out infinite}
    .cl-kit-orbit-chip svg{color:#139bb9}
    .cl-kit-flow-screen{min-height:430px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:42px 24px;border:1px solid var(--glass-border);border-radius:28px;background:radial-gradient(ellipse at 50% 5%,rgba(38,191,220,.13),transparent 44%),linear-gradient(145deg,var(--surface-1),var(--surface-2));box-shadow:var(--shadow-card)}
    .cl-kit-loader-emblem{position:relative;width:90px;height:90px;margin-bottom:26px;display:grid;place-items:center}
    .cl-kit-loader-ring{position:absolute;inset:1px;border:1px solid rgba(37,184,214,.6);border-top-color:transparent;border-radius:26px;transform:rotate(45deg);animation:cl-kit-loader-spin 2s linear infinite}
    .cl-kit-loader-ring-two{inset:10px;border-color:rgba(133,126,244,.7);border-bottom-color:transparent;border-radius:50%;animation-duration:1.4s;animation-direction:reverse}
    .cl-kit-loader-core{width:55px;height:55px;display:grid;place-items:center;border:1px solid rgba(255,255,255,.72);border-radius:18px;background:linear-gradient(145deg,rgba(255,255,255,.76),rgba(184,239,249,.22));color:var(--cyan-deep);box-shadow:0 12px 32px rgba(26,152,183,.14),inset 0 1px 0 white;backdrop-filter:blur(16px);animation:cl-kit-core-breathe 2s ease-in-out infinite}
    .cl-kit-flow-kicker{font-size:9px;font-weight:850;letter-spacing:.18em;color:var(--muted)}
    .cl-kit-flow-screen h2{margin:14px 0 8px;font-size:clamp(22px,4vw,31px);letter-spacing:-.045em;animation:cl-kit-text-in .35s ease both}
    .cl-kit-flow-screen p{margin:0;color:var(--muted);font-size:13px;line-height:1.65}
    .cl-kit-progress-track{width:min(310px,100%);height:5px;margin:25px auto 18px;overflow:hidden;border-radius:99px;background:var(--line-soft);box-shadow:inset 0 1px 2px rgba(0,0,0,.07)}
    .cl-kit-progress-track span{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,#43c7e0,#7184ff,#c37df5);box-shadow:0 0 15px rgba(62,186,226,.45);transition:width .8s cubic-bezier(.2,.8,.2,1)}
    .cl-kit-loading-steps{display:flex;gap:16px;flex-wrap:wrap;justify-content:center}
    .cl-kit-loading-step{display:flex;align-items:center;gap:6px;color:var(--muted);font-size:10px;transition:color .3s ease}
    .cl-kit-loading-step>span:first-child{width:19px;height:19px;border:1px solid var(--line);border-radius:50%;display:grid;place-items:center}
    .cl-kit-loading-step.is-current{color:var(--ink);font-weight:750}
    .cl-kit-loading-step.is-current>span:first-child{border-color:var(--cyan);box-shadow:0 0 0 4px var(--cyan-glow)}
    .cl-kit-loading-step.is-done{color:var(--cyan-deep)}
    .cl-kit-loading-step.is-done>span:first-child{border-color:var(--cyan);background:var(--cyan-soft)}
    .cl-kit-step-dot{width:4px;height:4px;border-radius:50%;background:currentColor}
    .cl-kit-success-overlay{position:relative;z-index:3;min-height:430px;display:grid;place-items:center;padding:24px;overflow:hidden;border:1px solid rgba(95,207,225,.25);border-radius:28px;background:radial-gradient(ellipse at 50% 38%,rgba(34,201,173,.18),transparent 42%),linear-gradient(135deg,var(--surface-1),var(--surface-2));animation:cl-kit-overlay-in .4s ease both}
    .cl-kit-success-card{position:relative;width:min(100%,460px);padding:35px 30px 29px;text-align:center;border:1px solid rgba(255,255,255,.62);border-radius:27px;background:linear-gradient(145deg,rgba(255,255,255,.78),rgba(237,251,255,.34));box-shadow:0 30px 90px rgba(16,76,95,.16),inset 0 1px 0 white,0 0 0 1px rgba(70,194,218,.08);backdrop-filter:blur(28px);animation:cl-kit-success-pop .65s cubic-bezier(.16,1.2,.35,1) both}
    .cl-kit-success-orbit{position:relative;width:88px;height:88px;margin:0 auto 20px;border-radius:29px;display:grid;place-items:center;animation:cl-kit-success-float 3s ease-in-out infinite}
    .cl-kit-success-orbit>span{position:absolute;inset:0;border:1px solid rgba(25,190,160,.42);border-radius:29px;animation:cl-kit-success-ring 2.3s ease-out infinite}
    .cl-kit-success-orbit>span:nth-child(2){animation-delay:.6s}.cl-kit-success-orbit>span:nth-child(3){animation-delay:1.2s}
    .cl-kit-success-orbit>div{position:relative;width:67px;height:67px;display:grid;place-items:center;border:1px solid rgba(255,255,255,.9);border-radius:23px;color:#0e9d88;background:linear-gradient(145deg,#fff,rgba(165,247,220,.7));box-shadow:0 15px 34px rgba(19,161,135,.2),inset 0 1px 0 white}
    .cl-kit-success-eyebrow{font-size:9px;line-height:1.6;letter-spacing:.13em;font-weight:850;color:#178b7d}
    .cl-kit-success-card h2{margin:9px 0;font-size:clamp(23px,4vw,30px);letter-spacing:-.05em}
    .cl-kit-success-card p{max-width:340px;margin:0 auto;color:var(--muted);font-size:12px;line-height:1.7}
    .cl-kit-success-bottom{display:flex;justify-content:center;gap:6px;margin-top:23px}
    .cl-kit-success-bottom span{width:4px;height:4px;border-radius:50%;background:#20b99b;animation:cl-kit-step-pulse 1.1s ease-in-out infinite}.cl-kit-success-bottom span:nth-child(2){animation-delay:.15s}.cl-kit-success-bottom span:nth-child(3){animation-delay:.3s}
    .cl-kit-template-gallery{padding:clamp(18px,3.4vw,30px);border:1px solid var(--glass-border);border-radius:25px;background:linear-gradient(145deg,var(--surface-1),var(--surface-2));box-shadow:var(--shadow-card);animation:cl-kit-text-in .38s cubic-bezier(.2,.8,.2,1) both}
    .cl-kit-gallery-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;margin-bottom:22px}
    .cl-kit-gallery-heading h2,.cl-kit-ready-heading h2{margin:12px 0 7px;font-size:clamp(23px,3.6vw,34px);letter-spacing:-.05em;line-height:1.08}
    .cl-kit-gallery-heading p,.cl-kit-ready-heading p{max-width:650px;margin:0;color:var(--muted);font-size:12px;line-height:1.7}
    .cl-kit-gallery-close{flex:0 0 auto;width:38px;height:38px;border:1px solid var(--line);border-radius:13px;background:var(--surface-2);color:var(--ink);font-size:25px;cursor:pointer;transition:transform .2s ease,background .2s ease}
    .cl-kit-gallery-close:hover{transform:rotate(90deg);background:var(--surface-3)}
    .cl-template-grid-premium{grid-template-columns:repeat(3,minmax(0,1fr));gap:13px}
    .cl-template-choice-premium{position:relative;isolation:isolate;min-height:212px;padding:12px;border-radius:17px;border-color:var(--line);background:linear-gradient(145deg,var(--surface-1),var(--surface-2));box-shadow:0 7px 17px rgba(12,36,53,.06),inset 0 1px 0 rgba(255,255,255,.56);transform-style:preserve-3d;transition:transform .28s cubic-bezier(.2,.8,.2,1),box-shadow .28s ease,border-color .25s ease}
    .cl-template-choice-premium:hover{transform:translateY(-4px) rotateX(1.5deg);box-shadow:0 17px 33px rgba(12,36,53,.11),inset 0 1px 0 rgba(255,255,255,.64)}
    .cl-template-choice-premium.is-active{border-color:var(--cyan);box-shadow:0 0 0 2px var(--cyan-glow),0 16px 32px rgba(12,36,53,.13);transform:translateY(-2px)}
    .cl-template-choice-meta{display:flex;justify-content:space-between;align-items:center;gap:8px;margin:12px 0 7px;color:var(--muted);font-size:9px;letter-spacing:.07em;text-transform:uppercase}
    .cl-template-choice-meta em{font-style:normal;color:var(--cyan-deep);font-weight:850;font-size:8px;letter-spacing:.1em}
    .cl-template-choice-premium>strong{display:block;font-size:14px;line-height:1.3;letter-spacing:-.025em}
    .cl-template-description{display:block;margin-top:5px;color:var(--muted);font-size:10px;line-height:1.45}
    .cl-template-select-cue{display:flex;justify-content:space-between;align-items:center;gap:6px;padding-top:11px;margin-top:11px;border-top:1px solid var(--line-soft);font-size:10px;font-weight:750;color:var(--cyan-deep)}
    .cl-template-swatch{position:relative;height:77px;border-radius:12px;display:flex;gap:6px;align-items:flex-end;padding:10px;overflow:hidden;isolation:isolate;box-shadow:inset 0 1px 0 rgba(255,255,255,.6),0 5px 12px rgba(0,0,0,.09);transform:translateZ(10px)}
    .cl-template-swatch:before{content:'';position:absolute;inset:0;z-index:-1;background:linear-gradient(115deg,rgba(255,255,255,.34),transparent 38%,rgba(255,255,255,.07));pointer-events:none}
    .cl-template-swatch i{position:relative;display:block;height:43px;width:27%;border:1px solid rgba(255,255,255,.38);border-radius:6px;background:rgba(255,255,255,.46);box-shadow:0 5px 11px rgba(0,0,0,.08),inset 0 1px 0 rgba(255,255,255,.7);transform:translateZ(12px)}
    .cl-template-swatch i:nth-child(2){height:31px;width:19%;opacity:.75}.cl-template-swatch i:nth-child(3){height:51px;width:35%;opacity:.9}
    .cl-template-swatch b{position:absolute;right:11px;top:11px;width:22px;height:22px;border-radius:50%;background:rgba(255,255,255,.45);border:1px solid rgba(255,255,255,.56);box-shadow:0 4px 9px rgba(0,0,0,.12),inset 0 1px 0 white}
    .cl-template-swatch.mk-glass{background:linear-gradient(135deg,rgba(246,253,255,.36),rgba(73,161,194,.24)),linear-gradient(135deg,#132c42,#3c94b0);backdrop-filter:blur(16px);border:1px solid rgba(240,252,255,.75);box-shadow:inset 0 1px 0 white,inset 1px 0 rgba(255,255,255,.35),0 8px 19px rgba(12,47,65,.22)}
    .cl-template-swatch.mk-glass i{border-radius:4px;background:rgba(240,252,255,.2);backdrop-filter:blur(7px);box-shadow:inset 0 1px 0 rgba(255,255,255,.85),2px 6px 10px rgba(0,0,0,.12)}
    .mk-neon{--kit-a:#101127;--kit-b:#382762;--kit-ink:#f8f7ff}.mk-aurora{--kit-a:#152d3a;--kit-b:#6046a5;--kit-ink:#f5ffff}.mk-chrome{--kit-a:#dfe5ed;--kit-b:#a6b4c2;--kit-ink:#182634}.mk-editorial{--kit-a:#f6f0e6;--kit-b:#e5d7c0;--kit-ink:#29231d}.mk-bloom{--kit-a:#ffb994;--kit-b:#ed88b9;--kit-ink:#4e153e}.mk-cyber{--kit-a:#061e1c;--kit-b:#0b5045;--kit-ink:#d8fff1}.mk-obsidian{--kit-a:#171717;--kit-b:#3c3021;--kit-ink:#f5e4b4}.mk-retro{--kit-a:#21104c;--kit-b:#713c8f;--kit-ink:#ffe0c9}.mk-holographic{--kit-a:#c9d9ff;--kit-b:#f4d5f2;--kit-ink:#1d2844}
    .cl-template-swatch.mk-essential{background:linear-gradient(135deg,#d9f6fb,#fff)}.cl-template-swatch.mk-clay{background:linear-gradient(135deg,#f4c7b8,#f8e8d9)}.cl-template-swatch.mk-minimal{background:linear-gradient(135deg,#f2eee7,#ded8cd)}
    .cl-template-swatch.mk-neon{background:linear-gradient(135deg,#121227,#a53bfe 57%,#3ef5db)}.cl-template-swatch.mk-aurora{background:radial-gradient(circle at 80% 20%,#bb9bff,transparent 48%),linear-gradient(135deg,#173b49,#48c6b9)}.cl-template-swatch.mk-chrome{background:linear-gradient(125deg,#f9fdff,#8a9bab 33%,#f3f6fa 49%,#788999 68%,#e7edf4)}
    .cl-template-swatch.mk-editorial{background:linear-gradient(135deg,#f6f0e6,#c7a774)}.cl-template-swatch.mk-bloom{background:radial-gradient(circle at 80% 15%,#ffd6a8,transparent 43%),linear-gradient(135deg,#fa8c9d,#8b4da2)}.cl-template-swatch.mk-cyber{background:repeating-linear-gradient(0deg,rgba(85,255,193,.12) 0 1px,transparent 1px 12px),repeating-linear-gradient(90deg,rgba(85,255,193,.12) 0 1px,transparent 1px 12px),linear-gradient(135deg,#031715,#0d6d56)}
    .cl-template-swatch.mk-obsidian{background:linear-gradient(135deg,#0c0c0c,#6a4f22);border:1px solid rgba(222,190,111,.6)}.cl-template-swatch.mk-retro{background:repeating-linear-gradient(0deg,rgba(255,139,215,.2) 0 1px,transparent 1px 9px),linear-gradient(135deg,#241044,#9d49a6)}.cl-template-swatch.mk-holographic{background:linear-gradient(125deg,#bdeaff,#f1d5ff 35%,#f9f5ca 54%,#c1fff1 75%,#e7c9fa)}
    .mk-glass.cl-media-preview{--kit-ink:#f7fcff;border:1px solid rgba(234,250,255,.78);border-radius:24px;background:linear-gradient(125deg,rgba(255,255,255,.22),rgba(255,255,255,.025) 29%,rgba(133,219,244,.13) 65%,rgba(255,255,255,.16)),linear-gradient(135deg,rgba(10,27,47,.46),rgba(36,107,137,.27));backdrop-filter:blur(30px) saturate(185%);-webkit-backdrop-filter:blur(30px) saturate(185%);border-top-color:rgba(255,255,255,.92);box-shadow:0 30px 85px rgba(2,23,40,.31),inset 0 1px 0 rgba(255,255,255,.94),inset 1px 0 0 rgba(255,255,255,.42),inset -1px 0 0 rgba(6,30,44,.25)}
    .mk-glass.cl-media-preview .cl-media-stats>div{border-radius:7px;background:rgba(233,249,255,.11);border-color:rgba(236,251,255,.42);box-shadow:inset 0 1px 0 rgba(255,255,255,.35),0 8px 20px rgba(0,0,0,.09)}
    .mk-clay.cl-media-preview{border:1px solid rgba(255,255,255,.72);border-radius:33px;background:linear-gradient(145deg,#fce5dc,#e9a99d);box-shadow:inset 9px 9px 23px rgba(255,255,255,.62),inset -9px -9px 22px rgba(145,73,76,.18),0 26px 50px rgba(125,69,68,.16)}
    .mk-clay .cl-media-stats>div{background:rgba(255,246,239,.3);box-shadow:inset 4px 4px 9px rgba(255,255,255,.58),inset -4px -4px 9px rgba(141,65,66,.09);border-radius:22px}
    .mk-minimal.cl-media-preview{border:1px solid rgba(36,34,31,.45);border-radius:3px;background:linear-gradient(135deg,#faf7f0,#e8e1d5);box-shadow:10px 12px 0 rgba(35,31,25,.08),0 23px 44px rgba(35,31,25,.1);--kit-ink:#26231d}
    .mk-neon.cl-media-preview{border:1px solid rgba(205,179,255,.72);border-radius:17px;background:radial-gradient(ellipse at 88% 12%,rgba(53,255,224,.24),transparent 34%),linear-gradient(135deg,#100f27,#24183d 52%,#382462);box-shadow:0 0 0 1px rgba(128,80,255,.15),0 25px 65px rgba(100,50,219,.23),inset 0 1px 0 rgba(255,255,255,.17)}
    .mk-neon.cl-media-preview .cl-media-pill,.mk-neon.cl-media-preview .cl-media-stats>div{border-color:rgba(176,139,255,.55);box-shadow:0 0 20px rgba(157,83,255,.12),inset 0 1px rgba(255,255,255,.12)}
    .mk-aurora.cl-media-preview{border:1px solid rgba(208,250,249,.56);border-radius:27px;background:radial-gradient(ellipse at 78% 18%,rgba(204,151,255,.47),transparent 40%),radial-gradient(ellipse at 18% 88%,rgba(54,247,218,.24),transparent 45%),linear-gradient(135deg,#142d3a,#372e6a 60%,#6055a1);box-shadow:0 27px 65px rgba(30,49,102,.26),inset 0 1px 0 rgba(255,255,255,.45)}
    .mk-chrome.cl-media-preview{border:1px solid rgba(255,255,255,.95);border-radius:18px;background:linear-gradient(120deg,#f8fbfe 0%,#b2beca 17%,#fdfefe 30%,#9ba9b7 46%,#eef2f7 58%,#8a99a8 73%,#f5f8fc 88%,#c8d2dc);box-shadow:0 24px 50px rgba(59,76,96,.2),inset 0 1px 0 #fff,inset 1px 0 0 rgba(255,255,255,.9);--kit-ink:#1d2a36}
    .mk-chrome.cl-media-preview .cl-media-stats>div{background:rgba(255,255,255,.42);border-color:rgba(255,255,255,.85);box-shadow:inset 0 1px 3px rgba(41,58,76,.08),0 5px 13px rgba(45,57,74,.06)}
    .mk-editorial.cl-media-preview{border:1px solid rgba(109,86,56,.28);border-radius:5px;background:linear-gradient(135deg,#fbf7ef,#e8ddca);box-shadow:12px 14px 0 rgba(127,101,67,.09),0 27px 55px rgba(63,47,28,.12);--kit-ink:#2d261f}
    .mk-editorial .cl-media-identity h2,.mk-editorial.cl-media-preview .cl-media-identity h2{font-family:Georgia,'Times New Roman',serif;font-weight:500;letter-spacing:-.04em}
    .mk-bloom.cl-media-preview{border:1px solid rgba(255,255,255,.72);border-radius:31px;background:radial-gradient(circle at 90% 5%,rgba(255,240,172,.6),transparent 32%),radial-gradient(ellipse at 15% 95%,rgba(167,104,228,.42),transparent 45%),linear-gradient(135deg,#ffbd9e,#f29abc 52%,#bd85da);box-shadow:0 27px 60px rgba(205,97,157,.22),inset 0 1px 0 rgba(255,255,255,.83);--kit-ink:#4b1745}
    .mk-cyber.cl-media-preview{border:1px solid rgba(98,255,193,.58);border-radius:9px;background:repeating-linear-gradient(0deg,rgba(72,255,178,.055) 0 1px,transparent 1px 23px),repeating-linear-gradient(90deg,rgba(72,255,178,.055) 0 1px,transparent 1px 23px),radial-gradient(ellipse at 80% 9%,rgba(0,241,176,.18),transparent 37%),linear-gradient(135deg,#031716,#062d28 65%,#0a5143);box-shadow:0 28px 65px rgba(0,55,44,.28),inset 0 1px 0 rgba(158,255,224,.25);--kit-ink:#d6fff0}
    .mk-obsidian.cl-media-preview{border:1px solid rgba(216,183,102,.7);border-radius:15px;background:radial-gradient(ellipse at 95% 0,rgba(227,187,94,.19),transparent 40%),linear-gradient(135deg,#0c0c0d,#211d17 56%,#3a2d1b);box-shadow:0 28px 65px rgba(0,0,0,.3),inset 0 1px 0 rgba(255,245,209,.25);--kit-ink:#f5e6bd}
    .mk-obsidian .cl-media-pill,.mk-obsidian .cl-media-stats>div{border-color:rgba(220,186,102,.4)}
    .mk-retro.cl-media-preview{border:1px solid rgba(255,168,226,.68);border-radius:11px;background:repeating-linear-gradient(0deg,rgba(247,105,214,.07) 0 1px,transparent 1px 21px),radial-gradient(ellipse at 50% 0,rgba(255,120,206,.28),transparent 45%),linear-gradient(135deg,#210d48,#583080 65%,#9c4f94);box-shadow:0 25px 64px rgba(68,24,104,.25),inset 0 1px rgba(255,255,255,.24);--kit-ink:#ffe5f6}
    .mk-holographic.cl-media-preview{border:1px solid rgba(255,255,255,.92);border-radius:24px;background:linear-gradient(122deg,#c6e7ff 0%,#e0d2ff 20%,#fbe0ed 38%,#fff6d0 55%,#c8f6ec 73%,#d9ceff 88%,#c5e6ff);box-shadow:0 28px 65px rgba(85,95,161,.17),inset 0 1px 0 white,inset 1px 0 0 rgba(255,255,255,.8);--kit-ink:#24304b}
    .cl-kit-ready-heading{display:flex;justify-content:space-between;align-items:flex-end;gap:20px;margin:5px 0 0}
    .cl-kit-ready-check{display:inline-flex;align-items:center;gap:6px;flex-shrink:0;padding:8px 11px;border:1px solid rgba(26,177,148,.26);border-radius:999px;background:rgba(29,190,159,.08);color:#129b7f;font-size:10px;font-weight:800}
    .cl-media-kit-preview{scroll-margin-top:24px}
    .cl-kit-primary-actions{display:flex;gap:9px;flex-wrap:wrap}
    .cl-kit-primary-actions>button{flex:1 1 165px;min-height:44px;border-radius:12px;transition:transform .2s ease,box-shadow .2s ease}
    .cl-kit-primary-actions>button:hover{transform:translateY(-2px)}
    .cl-kit-edit-details{overflow:hidden;border:1px solid var(--line);border-radius:17px;background:var(--surface-1)}
    .cl-kit-edit-details>summary{list-style:none;display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:12px;padding:16px;cursor:pointer}
    .cl-kit-edit-details>summary::-webkit-details-marker{display:none}
    .cl-kit-edit-details>summary>span:first-child{display:flex;align-items:center;gap:8px;font-size:12px;font-weight:800}
    .cl-kit-edit-details>summary>span:first-child svg{color:var(--cyan-deep)}
    .cl-kit-edit-details>summary>small{color:var(--muted);font-size:10px;line-height:1.5}
    .cl-kit-edit-details[open] .cl-kit-edit-chevron{transform:rotate(45deg)}
    .cl-kit-edit-chevron{font-size:22px;color:var(--muted);transition:transform .2s ease}
    .cl-kit-edit-details>.cl-card{border:0;border-top:1px solid var(--line);border-radius:0;box-shadow:none}
    .cl-kit-gallery-actions{display:flex;justify-content:space-between;align-items:center;gap:18px;margin-top:22px;padding-top:18px;border-top:1px solid var(--line-soft)}
    .cl-kit-gallery-actions p{margin:0;color:var(--muted);font-size:11px;line-height:1.7}
    .cl-kit-gallery-actions p strong{color:var(--ink)}
    .cl-kit-gallery-actions>div{display:flex;gap:8px;flex-wrap:wrap;flex-shrink:0}
    @keyframes cl-kit-orbit{to{transform:translate(-50%,-50%) rotate(336deg)}}
    @keyframes cl-kit-card-float{0%,100%{transform:rotateY(-13deg) rotateX(7deg) rotateZ(-2deg) translateY(0)}50%{transform:rotateY(-9deg) rotateX(4deg) rotateZ(-1deg) translateY(-8px)}}
    @keyframes cl-kit-chip-float{0%,100%{transform:translateY(0) rotate(0)}50%{transform:translateY(-7px) rotate(1deg)}}
    @keyframes cl-kit-loader-spin{to{transform:rotate(405deg)}}
    @keyframes cl-kit-core-breathe{0%,100%{transform:scale(1);box-shadow:0 12px 32px rgba(26,152,183,.14),inset 0 1px 0 white}50%{transform:scale(1.05);box-shadow:0 15px 38px rgba(26,152,183,.25),inset 0 1px 0 white}}
    @keyframes cl-kit-text-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
    @keyframes cl-kit-overlay-in{from{opacity:0}to{opacity:1}}
    @keyframes cl-kit-success-pop{from{opacity:0;transform:translateY(18px) scale(.88)}to{opacity:1;transform:translateY(0) scale(1)}}
    @keyframes cl-kit-success-float{0%,100%{transform:translateY(0) rotate(-3deg)}50%{transform:translateY(-6px) rotate(3deg)}}
    @keyframes cl-kit-success-ring{0%{transform:scale(.72);opacity:.85}100%{transform:scale(1.6);opacity:0}}
    @keyframes cl-kit-step-pulse{0%,100%{opacity:.35;transform:translateY(0)}50%{opacity:1;transform:translateY(-3px)}}
    @media(max-width:900px){.cl-kit-intro{grid-template-columns:minmax(0,1fr) minmax(260px,.8fr);gap:22px;padding:28px}.cl-kit-orbit-a{width:320px;height:250px}.cl-kit-orbit-b{width:285px;height:340px}.cl-template-grid-premium{grid-template-columns:repeat(2,minmax(0,1fr))}}
    @media(max-width:700px){.cl-kit-intro{grid-template-columns:1fr;min-height:auto}.cl-kit-intro h2{font-size:clamp(34px,9vw,50px)}.cl-kit-intro-art{min-height:320px;margin:3px 0 0}.cl-kit-art-glass{width:min(85%,340px)}.cl-kit-orbit-chip{right:3px;bottom:3px}.cl-kit-ready-heading{align-items:flex-start}.cl-kit-gallery-actions{align-items:stretch;flex-direction:column}.cl-kit-gallery-actions>div{width:100%}.cl-kit-gallery-actions>div>button{flex:1}.cl-kit-edit-details>summary{grid-template-columns:auto minmax(0,1fr) auto}.cl-kit-edit-details>summary>small{grid-column:2;grid-row:2}.cl-kit-edit-details>summary>.cl-kit-edit-chevron{grid-column:3;grid-row:1/3}}
    @media(max-width:480px){.cl-kit-intro{padding:22px 18px;border-radius:22px}.cl-kit-intro h2{margin-top:18px}.cl-kit-intro-proof{gap:8px}.cl-kit-intro-proof span{max-width:130px}.cl-kit-intro-art{min-height:285px}.cl-kit-art-glass{padding:18px;width:92%}.cl-kit-orbit-a{width:285px;height:225px}.cl-kit-orbit-b{width:245px;height:295px}.cl-kit-orbit-chip{font-size:9px;right:-2px}.cl-template-grid-premium{gap:9px}.cl-template-choice-premium{padding:9px;min-height:203px}.cl-template-swatch{height:64px}.cl-kit-template-gallery{padding:15px;border-radius:19px}.cl-kit-gallery-heading{gap:8px}.cl-kit-gallery-heading h2{font-size:25px}.cl-kit-gallery-close{width:32px;height:32px}.cl-kit-success-card{padding:28px 18px}.cl-kit-loading-steps{gap:12px}.cl-kit-loading-step{font-size:9px}.cl-kit-ready-heading{gap:8px;flex-direction:column}.cl-kit-ready-heading h2{font-size:27px}.cl-kit-primary-actions>button{flex:1 1 100%}}
    @media(prefers-reduced-motion:reduce){.cl-kit-intro-art,.cl-kit-art-glass,.cl-kit-orbit,.cl-kit-orbit-chip,.cl-kit-loader-ring,.cl-kit-loader-core,.cl-kit-success-orbit,.cl-kit-success-orbit>span,.cl-kit-success-bottom span{animation:none!important}.cl-template-choice-premium,.cl-kit-primary-actions>button{transition:none!important}}

  `}</style></Page>;
}
