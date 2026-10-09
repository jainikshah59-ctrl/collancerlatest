import React, { useEffect, useState } from 'react';
import { ArrowRight, Instagram, Mail, MapPin, Sparkles } from 'lucide-react';
import { ensureFirebase, db, doc, getDoc } from './lib/firebase.js';
import { Page, Card, Button, SkeletonCard } from './components/ui.jsx';

const listOf = value => Array.isArray(value) ? value : [];
const displayCount = value => Math.max(0, Number(value) || 0).toLocaleString('en-IN');
const audienceLocation = audience => [listOf(audience?.cities)[0]?.name, listOf(audience?.countries)[0]?.name].filter(Boolean).join(', ');
const rowsForGender = audience => {
  const rows = listOf(audience?.genderAge);
  if (!rows.length) return { women: null, men: null, other: null };
  const women = rows.filter(row => /female|(^|[\s/_.-])f([\s/_.-]|$)/i.test(String(row?.name || ''))).reduce((sum, row) => sum + (Number(row?.value) || 0), 0);
  const men = rows.filter(row => /(^|[\s/_.-])m([\s/_.-]|$)|male/i.test(String(row?.name || '')) && !/female/i.test(String(row?.name || ''))).reduce((sum, row) => sum + (Number(row?.value) || 0), 0);
  const total = rows.reduce((sum, row) => sum + (Number(row?.value) || 0), 0);
  if (!total) return { women: null, men: null, other: null };
  const w = Math.round(women / total * 100), m = Math.round(men / total * 100);
  return { women: w, men: m, other: Math.max(0, 100 - w - m) };
};
const brandsOf = value => listOf(value).map(item => typeof item === 'string' ? { name: item, logoUrl: '' } : ({ name: item?.name || item?.brand || '', logoUrl: item?.logoUrl || item?.logo || item?.imageUrl || '' })).filter(item => item.name);
const classForTheme = theme => ({ basic: 'mk-essential', glass: 'mk-glass', clay: 'mk-clay', minimal: 'mk-minimal', neon: 'mk-neon', aurora: 'mk-aurora', chrome: 'mk-chrome', editorial: 'mk-editorial', bloom: 'mk-bloom', cyber: 'mk-cyber', obsidian: 'mk-obsidian', retro: 'mk-retro', holographic: 'mk-holographic' }[theme] || 'mk-essential');
const themeName = theme => ({ basic: 'Collancer Signature', glass: 'Pure Liquid Glass', clay: 'Sculpted Clay', minimal: 'Architectural Minimal', neon: 'Neon Signal', aurora: 'Aurora Field', chrome: 'Liquid Chrome', editorial: 'Editorial Atelier', bloom: 'Sculptural Bloom', cyber: 'Cyber Grid', obsidian: 'Obsidian Reserve', retro: 'Retro Dimension', holographic: 'Holographic Pearl' }[theme] || 'Collancer Signature');

function AudienceBar({ label, value, kind }) {
  return <div className="cl-mk-gender-row"><div><span>{label}</span><strong>{value === null || value === undefined || value === '' ? '—' : Math.round(Number(value)) + '%'}</strong></div><div className="cl-mk-gender-track"><i className={'gender-' + kind} style={{ width: value === null || value === undefined || value === '' ? '0%' : Math.max(0, Math.min(100, Number(value))) + '%' }}/></div></div>;
}

function PublicKitDocument({ kit, handle, theme }) {
  const instagram = kit.instagram || {};
  const audience = kit.audience || instagram.audience || {};
  const demographics = kit.genderSplit || rowsForGender(audience);
  const storedGender = kit.mediaKitGenderSplit || {};
  const gender = {
    women: storedGender.women !== '' && storedGender.women != null ? storedGender.women : demographics.women,
    men: storedGender.men !== '' && storedGender.men != null ? storedGender.men : demographics.men,
    other: storedGender.other !== '' && storedGender.other != null ? storedGender.other : demographics.other,
  };
  const brands = brandsOf(kit.pastCollaborations || []);
  const formats = (Array.isArray(kit.contentFormats) ? kit.contentFormats : String(kit.services || '').split(',')).map(value => String(value || '').trim()).filter(Boolean);
  const countries = listOf(audience.countries).slice(0, 3);
  const dominant = kit.mediaKitAudience || audienceLocation(audience);
  const views = Number(kit.avgViews || instagram.avgViews || instagram.accountInsights?.totals?.views || 0);
  const engagement = Number(kit.engagementRate || instagram.engagementRate || 0);
  const followers = Number(kit.followers || instagram.followersCount || 0);
  const profilePath = kit.collancerProfileUrl || ('/c/' + encodeURIComponent(kit.handle || handle));
  const bar = (label, value, kind) => <AudienceBar key={label} label={label} value={value} kind={kind}/>;
  return <article className={'cl-mk-document theme-' + theme + ' ' + classForTheme(theme)}>
    <div className="cl-mk-document-bar"><span>COLLANCER / CREATOR MEDIA KIT</span><span>{themeName(theme).toUpperCase()} <i/> 2026</span></div>
    <section className="cl-mk-hero">
      <div className="cl-mk-cover">{kit.coverImage || kit.coverImageUrl ? <img src={kit.coverImage || kit.coverImageUrl} alt="Creator cover"/> : <div className="cl-mk-cover-art"><i/><i/><i/></div>}<div className="cl-mk-cover-overlay"/><div className="cl-mk-cover-label"><span>CREATOR PORTFOLIO</span><span>01 / INTRODUCTION</span></div></div>
      <div className="cl-mk-hero-profile"><div className="cl-mk-avatar-frame">{kit.photo ? <img src={kit.photo} alt={(kit.creatorName || handle) + ' profile'}/> : <div className="cl-mk-avatar-placeholder"><Sparkles size={24}/></div>}</div><div className="cl-mk-profile-copy"><div className="cl-mk-pretitle">{kit.niche || 'Creator'}</div><h2>{kit.creatorName || handle}</h2><div className="cl-mk-username">@{kit.handle || handle}</div><div className="cl-mk-identity-tags">{kit.city ? <span><MapPin size={12}/>{kit.city}</span> : null}{kit.niche ? <span>{kit.niche}</span> : null}</div></div><span className={'cl-mk-open-tag ' + (kit.openForCollabs !== false ? 'is-open' : 'is-closed')}><i/>{kit.openForCollabs !== false ? 'Open for collabs' : 'Currently unavailable'}</span></div>
      <div className="cl-mk-headline">{kit.headline || kit.title || 'Creator & digital storyteller'}</div>
    </section>
    <div className="cl-mk-sections">
      <section className="cl-mk-section cl-mk-about"><div className="cl-mk-section-index">01 <span>ABOUT</span></div><div className="cl-mk-section-main"><h3>About <span>the creator</span></h3><p>{kit.bio || 'Creator and digital storyteller open to meaningful brand collaborations.'}</p></div></section>
      <section className="cl-mk-section cl-mk-platforms"><div className="cl-mk-section-index">02 <span>PLATFORMS</span></div><div className="cl-mk-section-main"><h3>Platform <span>performance</span></h3><div className="cl-mk-platform-card"><div className="cl-mk-platform-head"><span className="cl-mk-platform-icon"><Instagram size={21}/></span><span className="cl-mk-platform-brand"><strong>Instagram</strong><small>@{kit.handle || handle}</small></span><span className="cl-mk-platform-badge">Creator profile</span></div><div className="cl-mk-platform-metrics"><div><strong>{displayCount(followers)}</strong><span>Followers</span></div><div><strong>{views ? displayCount(views) : '—'}</strong><span>Avg. views</span></div><div><strong>{engagement ? engagement + '%' : '—'}</strong><span>Engagement rate</span></div></div></div></div></section>
      <section className="cl-mk-section cl-mk-audience"><div className="cl-mk-section-index">03 <span>AUDIENCE</span></div><div className="cl-mk-section-main"><h3>Who <span>you reach</span></h3><div className="cl-mk-audience-grid"><div className="cl-mk-audience-feature"><span className="cl-mk-mini-label">DOMINANT AUDIENCE</span><strong>{dominant || 'Audience details not provided'}</strong><p>{dominant ? 'Leading audience location from available insights.' : 'Demographics were not available when this media kit was published.'}</p>{countries.length > 0 && <div className="cl-mk-country-list">{countries.map(row => <div key={row.name}><span>{row.name}</span><strong>{Number(row.value) > 0 ? (Number(row.value) <= 1 ? Math.round(Number(row.value) * 100) : Math.round(Number(row.value))) + '%' : '—'}</strong></div>)}</div>}</div><div className="cl-mk-gender-card"><div className="cl-mk-mini-label">GENDER SPLIT</div><div className="cl-mk-gender-note">Instagram audience demographics</div>{bar('Women', gender.women, 'women')}{bar('Men', gender.men, 'men')}{bar('Other / not specified', gender.other, 'other')}</div></div></div></section>
      <section className="cl-mk-section cl-mk-formats"><div className="cl-mk-section-index">04 <span>CONTENT</span></div><div className="cl-mk-section-main"><h3>Content <span>formats</span></h3><div className="cl-mk-format-grid">{formats.length ? formats.map((format, i) => <div className="cl-mk-format-tile" key={format}><span className="cl-mk-format-index">0{i + 1}</span><strong>{format}</strong><small>Creative format</small></div>) : <div className="cl-mk-empty-panel"><strong>Content formats not provided</strong><span>The creator has not added these details yet.</span></div>}</div></div></section>
      <section className="cl-mk-section cl-mk-collaborations"><div className="cl-mk-section-index">05 <span>SELECTED WORK</span></div><div className="cl-mk-section-main"><h3>Past <span>collaborations</span></h3><p className="cl-mk-section-desc">Selected brand partnerships and creator work.</p>{brands.length ? <div className="cl-mk-brand-window"><div className="cl-mk-brand-rail" aria-label="Past brand collaborations">{[...brands, ...brands].map((brand, i) => <div className="cl-mk-brand" key={brand.name + i} aria-hidden={i >= brands.length}>{brand.logoUrl ? <img src={brand.logoUrl} alt={i < brands.length ? brand.name : ''}/> : <span className="cl-mk-brand-monogram">{brand.name.split(/\\s+/).map(x => x[0]).join('').slice(0, 3).toUpperCase()}</span>}<small>{brand.name}</small></div>)}</div></div> : <div className="cl-mk-empty-panel"><strong>Past collaborations</strong><span>No past brand collaborations have been added.</span></div>}</div></section>
    </div>
    <section className="cl-mk-cta"><div className="cl-mk-cta-shape"><i/><i/></div><div className="cl-mk-cta-content"><div className="cl-mk-mini-label">LET'S MAKE SOMETHING MATTER</div><h3>Interested in working together?</h3><p>Have a campaign in mind? Connect through Collancer and let's create something meaningful.</p>{kit.email && <div className="cl-mk-cta-email"><Mail size={14}/>{kit.email}</div>}<a className="cl-mk-book-link" href={profilePath}><span>Book me on Collancer</span><ArrowRight size={17}/></a></div><div className="cl-mk-cta-signature"><span>CREATOR × BRAND</span><strong>Collancer</strong><small>Where influence meets industry</small></div></section>
    <section className="cl-mk-thank-you"><p>Thank you for taking the time to check out my media kit.</p><strong>{kit.creatorName || handle}</strong></section><div className="cl-mk-document-footer"><span>CREATOR MEDIA KIT</span><span>Made with Collancer Media Kit Builder.</span></div>
  </article>;
}

export default function PublicMediaKit({ handle }) {
  const [kit, setKit] = useState(null);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        await ensureFirebase();
        const normalized = String(handle || '').trim().toLowerCase().replace(/^@/, '');
        const handleSnap = await getDoc(doc(db(), 'creatorHandles', normalized));
        if (!handleSnap.exists()) throw new Error('not-found');
        const creatorId = handleSnap.data().creatorId;
        const kitSnap = await getDoc(doc(db(), 'mediaKits', creatorId));
        if (!kitSnap.exists() || kitSnap.data().isPublic !== true) throw new Error('not-found');
        if (active) setKit(kitSnap.data());
      } catch { if (active) setMissing(true); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [handle]);
  if (loading) return <Page><div className="cl-container" style={{ maxWidth: 900, paddingTop: 28 }}><SkeletonCard/><SkeletonCard/></div></Page>;
  if (missing || !kit) return <Page><div className="cl-container" style={{ maxWidth: 560, paddingTop: 50 }}><Card><h2>Media kit unavailable</h2><p className="cl-small cl-muted" style={{ marginTop: 8 }}>This creator has not published a public media kit, or the link may have changed.</p><Button block style={{ marginTop: 16 }} onClick={() => { window.location.href = '/'; }}>Visit Collancer</Button></Card></div></Page>;
  const theme = new URLSearchParams(window.location.search).get('style') || kit.theme || 'basic';
  return <Page pageKey="public-media-kit"><main className="cl-container cl-public-kit" style={{ maxWidth: 1040, paddingTop: 24, paddingBottom: 44 }}><PublicKitDocument kit={kit} handle={handle} theme={theme}/><div className="cl-public-kit-footer"><span>Creator media kit</span><a href="/" rel="noreferrer">Powered by Collancer</a></div><style>{`
    .cl-public-kit .cl-mk-brand-window{overflow:hidden;width:100%;mask-image:linear-gradient(90deg,transparent,#000 7%,#000 93%,transparent)}
    .cl-public-kit .cl-mk-brand-rail{display:flex;width:max-content;gap:14px;animation:cl-mk-brand-train 32s linear infinite;will-change:transform}
    .cl-public-kit .cl-mk-brand-window:hover .cl-mk-brand-rail{animation-play-state:paused}
    .cl-public-kit .cl-mk-brand{flex:0 0 auto;min-width:140px}
    .cl-public-kit .cl-mk-thank-you{padding:34px 18px 28px;text-align:center;border-top:1px solid var(--glass-border,rgba(120,140,160,.25))}
    .cl-public-kit .cl-mk-thank-you p{margin:0 0 9px;font-size:clamp(15px,2.2vw,21px);line-height:1.5;font-weight:650}
    .cl-public-kit .cl-mk-thank-you strong{font-size:12px;letter-spacing:.08em;text-transform:uppercase;opacity:.72}
    .cl-public-kit .cl-mk-document-footer{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap}
    @keyframes cl-mk-brand-train{from{transform:translateX(0)}to{transform:translateX(-50%)}}
    @media(prefers-reduced-motion:reduce){.cl-public-kit .cl-mk-brand-rail{animation:none!important;overflow-x:auto;max-width:100%}}
  `}</style></main></Page>;
}