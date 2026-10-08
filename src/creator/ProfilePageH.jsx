/* Creator profile editor — tabs: profile / rate card / account (audit §7.5).
   Handle changes use the atomic reservation swap (reserve new -> verify -> delete old
   -> update profile) per audit §3.6. Photo: compress -> Cloudinary -> pfp URL. */
import React, { useRef, useState } from 'react';
import {
  User as UserIcon, ArrowLeft, Camera, AtSign, MapPin, Globe, Youtube,
  Wallet, LogOut, RefreshCw, CheckCircle2, BadgeCheck, Tag, Link2, Percent, Lock,
  Image as ImageIcon, Play, Heart, MessageCircle, Eye, Instagram,
} from 'lucide-react';
import {
  ensureFirebase, db, doc, updateDoc, runTransaction, serverTimestamp,
} from '../lib/firebase.js';
import { compressImage, uploadToCloudinary } from '../lib/cloudinary.js';
import { PLATFORMS, NICHES, CITIES, CATEGORIES, PROMO_TYPES, promoLabel } from '../lib/constants.js';
import { compact } from '../lib/format.js';
import {
  Page, TopBar, IconBtn, Card, Button, Field, Input, TextArea, Select,
  Tabs, Chip, Badge, Avatar, Toggle, useToast, ConfirmDialog, ThemeToggle,
} from '../components/ui.jsx';
import MediaViewer from '../components/MediaViewer.jsx';
import { completionPct, isLive } from './DashboardPage.jsx';

const normHandle = (h) => String(h || '').trim().replace(/^@/, '').toLowerCase();
const handleOk = (h) => /^[a-z0-9._]{3,30}$/.test(normHandle(h));

const PRICE_KEYS = ['story', 'reel', 'video', 'personalad', 'ytshorts'];

/* Creator picks which Instagram posts brands see on their profile.
 * Selection is stored in creators/{uid}.featuredMediaIds (top-level —
 * the `instagram` object is server-synced and locked by Firestore rules).
 * Empty selection = brands see all recent media (back-compat). */
function FeaturedContentPicker({ creator, toast }) {
  const allMedia = creator?.instagramClient?.recentMedia || creator?.instagram?.recentMedia || [];
  const [selected, setSelected] = useState(() => new Set(creator?.featuredMediaIds || []));
  const [saving, setSaving] = useState(false);
  const [viewerMedia, setViewerMedia] = useState(null);
  const dirty = (() => {
    const prev = new Set(creator?.featuredMediaIds || []);
    if (prev.size !== selected.size) return true;
    for (const id of selected) if (!prev.has(id)) return true;
    return false;
  })();

  const toggle = (id) => {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      const { db } = await ensureFirebase();
      await updateDoc(doc(db, 'creators', creator.id), {
        featuredMediaIds: Array.from(selected),
        updatedAt: serverTimestamp(),
      });
      toast.ok(selected.size === 0
        ? 'Cleared — brands will see all your recent posts.'
        : `${selected.size} post${selected.size > 1 ? 's' : ''} featured on your brand profile.`);
    } catch (e) {
      console.error('[featured] save', e);
      toast.err('Could not save selection. Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <p className="cl-small cl-muted" style={{ marginBottom: 12, lineHeight: 1.5 }}>
        Tap posts to feature them on your brand-facing profile.
        {selected.size > 0
          ? ` ${selected.size} selected — brands see only these.`
          : ' Nothing selected — brands see all recent posts.'}
        Tap a play icon to preview.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 12 }}>
        {allMedia.map((m) => {
          const isSel = selected.has(m.id);
          const isVideo = m.type === 'VIDEO' || m.type === 'REELS' || m.type === 'reel';
          return (
            <div key={m.id} style={{ position: 'relative' }}>
              <button
                onClick={() => toggle(m.id)}
                aria-pressed={isSel}
                style={{
                  position: 'relative', aspectRatio: '1', borderRadius: 10, overflow: 'hidden',
                  background: 'var(--surface-2)', border: isSel ? '2.5px solid var(--cyan)' : '2.5px solid transparent',
                  padding: 0, cursor: 'pointer', width: '100%', display: 'block',
                  opacity: selected.size > 0 && !isSel ? 0.45 : 1,
                  transition: 'opacity .15s, border-color .15s',
                }}
              >
                {(m.url || m.thumbnail) ? (
                  <img src={m.thumbnail || m.url} alt="" loading="lazy"
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center' }}>
                    {isVideo
                      ? <Play style={{ width: 24, height: 24, color: 'var(--faint)' }} />
                      : <ImageIcon style={{ width: 24, height: 24, color: 'var(--faint)' }} />}
                  </div>
                )}
                {isSel && (
                  <span style={{
                    position: 'absolute', top: 6, right: 6, width: 24, height: 24,
                    borderRadius: '50%', background: 'var(--cyan)', display: 'grid', placeItems: 'center',
                  }}>
                    <CheckCircle2 style={{ width: 16, height: 16, color: '#fff' }} />
                  </span>
                )}
              </button>
              {isVideo && (
                <button
                  onClick={() => setViewerMedia(m)}
                  aria-label="Preview video"
                  style={{
                    position: 'absolute', bottom: 6, left: 6,
                    background: 'rgba(0,0,0,.6)', border: 0, borderRadius: 6,
                    color: '#fff', fontSize: 10, fontWeight: 700, padding: '3px 7px',
                    display: 'flex', alignItems: 'center', gap: 3, cursor: 'pointer',
                  }}
                >
                  <Play style={{ width: 10, height: 10 }} /> Preview
                </button>
              )}
            </div>
          );
        })}
      </div>
      <Button block disabled={!dirty || saving} onClick={save}>
        {saving ? 'Saving…' : dirty
          ? (selected.size === 0 ? 'Show all posts to brands' : `Feature ${selected.size} post${selected.size > 1 ? 's' : ''}`)
          : 'Selection saved'}
      </Button>
      {viewerMedia && <MediaViewer media={viewerMedia} onClose={() => setViewerMedia(null)} />}
    </div>
  );
}

export default function ProfilePageH({ creator, onBack, onLogout, initialTab, isPro }) {
  const toast = useToast();
  const photoRef = useRef(null);
  const [tab, setTab] = useState(['ratecard', 'content', 'account'].includes(initialTab) ? initialTab : 'profile');
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState('');

  // Keep the mounted profile in sync immediately after Instagram refresh.
  const [syncedInstagram, setSyncedInstagram] = useState(null);
  const profileCreator = syncedInstagram
    ? {
        ...creator,
        instagram: { ...(creator.instagram || {}), ...syncedInstagram },
        instagramClient: syncedInstagram,
        followers: syncedInstagram.followersCount ?? creator.followers,
        engagement: syncedInstagram.engagementRate ?? creator.engagement,
        avgViews: syncedInstagram.avgViews ?? creator.avgViews,
        avgLikes: syncedInstagram.avgLikes ?? creator.avgLikes,
        reach: syncedInstagram.reach ?? creator.reach,
        profileViews: syncedInstagram.profileViews ?? creator.profileViews,
      }
    : creator;

  // ---- profile tab state ----
  const [p, setP] = useState({
    name: profileCreator.name || '', handle: profileCreator.handle || '', bio: profileCreator.bio || '',
    headline: profileCreator.headline || '',
    platform: profileCreator.platform || 'Instagram', niche: profileCreator.niche || NICHES[0],
    city: profileCreator.city || 'Mumbai', followers: String(profileCreator.followers || ''),
    engagement: String(profileCreator.engagement || ''), avgViews: String(profileCreator.avgViews || ''),
    avgLikes: String(profileCreator.avgLikes || ''), reach: String(profileCreator.reach || ''),
    profileLink: profileCreator.profileLink || '', ytChannel: profileCreator.ytChannel || '',
    categories: profileCreator.categories || [], promotionTypes: profileCreator.promotionTypes || [],
  });
  const setPField = (k) => (e) => setP((prev) => ({ ...prev, [k]: e.target.value }));
  const handleInstagramSynced = (instagram) => {
    setSyncedInstagram(instagram);
    setP((prev) => ({
      ...prev,
      name: instagram.name || prev.name,
      handle: instagram.username || prev.handle,
      bio: instagram.bio ?? prev.bio,
      followers: String(instagram.followersCount ?? prev.followers),
      engagement: String(instagram.engagementRate ?? prev.engagement),
      avgViews: String(instagram.avgViews ?? prev.avgViews),
      avgLikes: String(instagram.avgLikes ?? prev.avgLikes),
      reach: String(instagram.reach ?? prev.reach),
    }));
  };

  // ---- rate card state ----
  const [prices, setPrices] = useState(() => {
    const o = {};
    PRICE_KEYS.forEach((k) => { o[k] = profileCreator.prices?.[k] ? String(profileCreator.prices[k]) : ''; });
    return o;
  });
  const [dPrices, setDPrices] = useState(() => {
    const o = {};
    PRICE_KEYS.forEach((k) => { o[k] = profileCreator.discountedPrices?.[k] ? String(profileCreator.discountedPrices[k]) : ''; });
    return o;
  });
  // ---- package cards state (Collabstr-style) ----
  const [pkgMeta, setPkgMeta] = useState(() => {
    const o = {};
    PRICE_KEYS.forEach((k) => {
      const m = profileCreator.packages?.[k] || {};
      o[k] = {
        enabled: m.enabled !== false,
        description: m.description || '',
        deliveryDays: m.deliveryDays ? String(m.deliveryDays) : '',
      };
    });
    return o;
  });
  const setPkg = (k, field) => (e) => setPkgMeta((prev) => ({
    ...prev, [k]: { ...prev[k], [field]: e?.target ? e.target.value : e },
  }));

  // ---- account tab state ----
  const [a, setA] = useState({
    whatsapp: profileCreator.whatsapp || '', address: profileCreator.address || '',
    barterEligible: profileCreator.barterEligible !== false,
  });
  const setAField = (k) => (e) => setA((prev) => ({ ...prev, [k]: e.target ? e.target.value : e }));
  const [logoutOpen, setLogoutOpen] = useState(false);

  const uid = profileCreator.id;
  const igConnected = !!profileCreator.instagram;
  const handleChanged = !igConnected && normHandle(p.handle) !== (profileCreator.handleLower || normHandle(profileCreator.handle));

  const toggleArr = (key, val) => setP((prev) => {
    const arr = prev[key] || [];
    return { ...prev, [key]: arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val] };
  });

  async function saveProfile(e) {
    e?.preventDefault();
    setErr('');
    if (p.name.trim().length < 2) return setErr('Please enter your display name.');
    // Skip handle validation when Instagram is connected — handle comes from Instagram
    if (!igConnected && !handleOk(p.handle)) return setErr('Handle must be 3–30 characters: letters, numbers, dot or underscore.');
    const num = (v) => (v === '' ? 0 : Math.max(0, Math.round(Number(v) || 0)));
    // Instagram-synced details are never written from here — they are managed
    // by the Instagram account and updated server-side only.
    const profileUpd = igConnected ? {
      name: p.name.trim(), headline: p.headline.trim().slice(0, 80),
      platform: p.platform, niche: p.niche, city: p.city,
      engagement: Number(p.engagement) || 0,
      profileLink: p.profileLink.trim(), ytChannel: p.ytChannel.trim(),
      categories: p.categories, promotionTypes: p.promotionTypes,
      updatedAt: serverTimestamp(),
    } : {
      name: p.name.trim(), bio: p.bio.trim(), headline: p.headline.trim().slice(0, 80),
      platform: p.platform, niche: p.niche, city: p.city,
      followers: num(p.followers), engagement: Number(p.engagement) || 0,
      avgViews: num(p.avgViews), avgLikes: num(p.avgLikes), reach: num(p.reach),
      profileLink: p.profileLink.trim(), ytChannel: p.ytChannel.trim(),
      categories: p.categories, promotionTypes: p.promotionTypes,
      updatedAt: serverTimestamp(),
    };
    setBusy('profile');
    try {
      await ensureFirebase();
      if (handleChanged) {
        // Atomic handle reservation swap (audit §3.6).
        const newLower = normHandle(p.handle);
        const newHandle = p.handle.trim().replace(/^@/, '');
        const oldLower = profileCreator.handleLower || normHandle(profileCreator.handle);
        await runTransaction(db(), async (tx) => {
          const newRef = doc(db(), 'creatorHandles', newLower);
          const oldRef = doc(db(), 'creatorHandles', oldLower);
          const [newSnap, oldSnap] = await Promise.all([tx.get(newRef), tx.get(oldRef)]);
          if (newSnap.exists() && newSnap.data().creatorId !== uid) throw new Error('HANDLE_TAKEN');
          tx.set(newRef, { creatorId: uid, handle: newHandle, createdAt: serverTimestamp() });
          if (oldSnap.exists() && newLower !== oldLower) tx.delete(oldRef);
          tx.update(doc(db(), 'creators', uid), { ...profileUpd, handle: newHandle, handleLower: newLower });
        });
        toast.ok('Profile saved — new handle reserved.');
      } else {
        await updateDoc(doc(db(), 'creators', uid), profileUpd);
        toast.ok('Profile saved.');
      }
    } catch (e2) {
      if (String(e2?.message || '').includes('HANDLE_TAKEN')) setErr('This handle is already taken. Try another.');
      else setErr('Could not save your profile. Please try again.');
    } finally {
      setBusy(null);
    }
  }

  async function saveRates(e) {
    e?.preventDefault();
    setErr('');
    const clean = (o) => {
      const out = {};
      Object.entries(o).forEach(([k, v]) => { if (v !== '' && Number(v) > 0) out[k] = Math.round(Number(v)); });
      return out;
    };
    const cleanMeta = {};
    Object.entries(pkgMeta).forEach(([k, m]) => {
      cleanMeta[k] = {
        enabled: !!m.enabled,
        description: (m.description || '').slice(0, 300),
        deliveryDays: m.deliveryDays !== '' && Number(m.deliveryDays) > 0 ? Math.round(Number(m.deliveryDays)) : null,
      };
    });
    setBusy('rates');
    try {
      await ensureFirebase();
      await updateDoc(doc(db(), 'creators', uid), {
        prices: clean(prices), discountedPrices: clean(dPrices),
        packages: cleanMeta, updatedAt: serverTimestamp(),
      });
      toast.ok('Packages saved.');
    } catch (e2) {
      setErr('Could not save your packages. Please try again.');
    } finally {
      setBusy(null);
    }
  }

  async function saveAccount(e) {
    e?.preventDefault();
    setErr('');
    if (!/^[+\d][\d\s-]{7,15}$/.test(a.whatsapp.trim())) return setErr('Please enter a valid WhatsApp number.');
    if (a.address.trim().length < 10) return setErr('Please enter your full shipping address.');
    setBusy('account');
    try {
      await ensureFirebase();
      await updateDoc(doc(db(), 'creators', uid), {
        whatsapp: a.whatsapp.trim(), address: a.address.trim(),
        barterEligible: !!a.barterEligible, updatedAt: serverTimestamp(),
      });
      toast.ok('Account details saved.');
    } catch (e2) {
      setErr('Could not save account details. Please try again.');
    } finally {
      setBusy(null);
    }
  }

  async function changePhoto(file) {
    if (!file) return;
    setBusy('photo');
    try {
      await ensureFirebase();
      const blob = await compressImage(file, 800, 0.82);
      const { url } = await uploadToCloudinary(blob, 'image', 'collancer_pfps');
      await updateDoc(doc(db(), 'creators', uid), { pfp: url, updatedAt: serverTimestamp() });
      toast.ok('Profile photo updated.');
    } catch (e) {
      toast.err('Photo upload failed. Try a smaller image.');
    } finally {
      setBusy(null);
      if (photoRef.current) photoRef.current.value = '';
    }
  }

  const pct = completionPct(profileCreator);
  const live = isLive(profileCreator);

  return (
    <Page pageKey="creator-profile">
      <TopBar title="Profile" subtitle={igConnected ? `@${profileCreator.instagram.username}` : (profileCreator.handleLower ? `@${profileCreator.handleLower}` : '')}
        left={onBack ? <IconBtn icon={ArrowLeft} label="Back" onClick={onBack} /> : null} />
      <div className="cl-container" style={{ paddingTop: 14, paddingBottom: 24, display: 'grid', gap: 14 }}>
        <Card className="cl-glass" style={{ border: '1px solid var(--glass-border)', background: 'linear-gradient(135deg, var(--glass-hi), var(--glass-lo))' }}>
          <div className="cl-row" style={{ gap: 12 }}>
            <span style={{ width: 42, height: 42, borderRadius: 12, display: 'grid', placeItems: 'center', background: 'var(--surface-2)', color: 'var(--cyan-deep)', flexShrink: 0 }}><Instagram style={{ width: 20, height: 20 }} /></span>
            <div className="cl-grow"><div style={{ fontWeight: 800, fontSize: 14 }}>Instagram integration</div><div className="cl-small cl-muted" style={{ lineHeight: 1.5 }}>Live Instagram connection and syncing are temporarily unavailable during creator onboarding.</div></div>
            <Badge tone="amber">Coming Soon</Badge>
          </div>
        </Card>
        {/* Header card */}
        <Card className="cl-glass">
          <div className="cl-row" style={{ gap: 14 }}>
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <Avatar src={profileCreator.pfp} name={profileCreator.name} size={72} className="lg" pro={!!profileCreator.creatorIsPro} />
              {!igConnected && (
                <>
                  <button onClick={() => photoRef.current?.click()} aria-label="Change profile photo"
                    disabled={busy === 'photo'}
                    style={{
                      position: 'absolute', right: -2, bottom: -2, width: 28, height: 28, borderRadius: '50%',
                      border: '2px solid var(--surface)', background: 'var(--avatar-edit-bg)', color: '#fff', cursor: 'pointer',
                      display: 'grid', placeItems: 'center',
                    }}>
                    <Camera style={{ width: 13, height: 13 }} />
                  </button>
                  <input ref={photoRef} type="file" accept="image/*" style={{ display: 'none' }}
                    onChange={(e) => changePhoto(e.target.files?.[0])} />
                </>
              )}
            </div>
            <div className="cl-grow" style={{ minWidth: 0 }}>
              <div className="cl-row" style={{ gap: 8 }}>
                <h3 style={{ fontSize: 17, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{profileCreator.name}</h3>
                {profileCreator.verified && <BadgeCheck style={{ width: 18, height: 18, color: 'var(--cyan-deep)', flexShrink: 0 }} />}
              </div>
              <div className="cl-small cl-muted" style={{ marginTop: 2 }}>
                {compact(profileCreator.followers || 0)} followers · {profileCreator.platform} · {profileCreator.city}
              </div>
              <div className="cl-row" style={{ gap: 6, marginTop: 8 }}>
                {live ? <Badge tone="cyan">Live</Badge> : <Badge tone="grey">{pct}% complete</Badge>}
                {profileCreator.creatorIsPro && <Badge tone="dark">Pro</Badge>}
              </div>
            </div>
          </div>
        </Card>

        <Tabs
          tabs={[
            { key: 'profile', label: 'Profile', icon: UserIcon },
            { key: 'content', label: 'Content', icon: ImageIcon },
            { key: 'ratecard', label: 'Rate card', icon: Wallet },
            { key: 'account', label: 'Account', icon: Globe },
          ]}
          value={tab} onChange={setTab}
        />

        {tab === 'profile' && (
          <form onSubmit={saveProfile} className="cl-fade" style={{ display: 'grid', gap: 0 }}>
            <Card>
              <div className="cl-row" style={{ gap: 10 }}>
                <div className="cl-grow">
                  <Field label="Display name">
                    <Input value={p.name} onChange={setPField('name')} placeholder="Aarav Sharma" />
                  </Field>
                </div>
                <div className="cl-grow">
                  <Field label="Handle" hint={igConnected ? 'Synced from Instagram — managed there' : (handleChanged ? 'Will be reserved atomically on save' : 'Unique, case-insensitive')}>
                    <div style={{ position: 'relative' }}>
                      <AtSign style={{ position: 'absolute', left: 13, top: 14, width: 16, height: 16, color: 'var(--faint)' }} />
                      <Input value={igConnected ? (profileCreator.instagram.username || '') : p.handle}
                        onChange={setPField('handle')} placeholder="aarav.creates" style={{ paddingLeft: 38 }}
                        disabled={igConnected} />
                      {igConnected && (
                        <Lock style={{ position: 'absolute', right: 13, top: 15, width: 14, height: 14, color: 'var(--faint)' }} />
                      )}
                    </div>
                  </Field>
                </div>
              </div>
              <Field label="Bio" hint={igConnected ? 'Synced from Instagram — managed there' : 'Minimum 10 characters for a complete profile'}>
                <div style={{ position: 'relative' }}>
                  <TextArea value={igConnected ? (profileCreator.instagram.bio || '') : p.bio}
                    onChange={setPField('bio')} placeholder="Fashion + lifestyle creator from Mumbai…" maxLength={300}
                    disabled={igConnected} style={igConnected ? { paddingRight: 38 } : undefined} />
                  {igConnected && (
                    <Lock style={{ position: 'absolute', right: 13, top: 14, width: 14, height: 14, color: 'var(--faint)' }} />
                  )}
                </div>
              </Field>
              <Field label="Headline" hint="One-line tagline shown big on your public profile — e.g. FASHION, BEAUTY & LIFESTYLE CREATOR">
                <Input value={p.headline} onChange={setPField('headline')}
                  placeholder="FASHION, BEAUTY & LIFESTYLE CREATOR" maxLength={80} />
              </Field>
              <div className="cl-row" style={{ gap: 10 }}>
                <div className="cl-grow">
                  <Field label="Platform">
                    <Select value={p.platform} onChange={setPField('platform')}>
                      {PLATFORMS.map((x) => <option key={x} value={x}>{x}</option>)}
                    </Select>
                  </Field>
                </div>
                <div className="cl-grow">
                  <Field label="Niche">
                    <Select value={p.niche} onChange={setPField('niche')}>
                      {NICHES.map((x) => <option key={x} value={x}>{x}</option>)}
                    </Select>
                  </Field>
                </div>
                <div className="cl-grow">
                  <Field label="City">
                    <Select value={p.city} onChange={setPField('city')}>
                      {CITIES.map((x) => <option key={x} value={x}>{x}</option>)}
                    </Select>
                  </Field>
                </div>
              </div>
              <div className="cl-row" style={{ gap: 10 }}>
                <div className="cl-grow">
                  <Field label="Followers" hint={igConnected ? 'Live from Instagram' : undefined}>
                    <div style={{ position: 'relative' }}>
                      <Input value={igConnected ? String(profileCreator.instagram.followersCount || '') : p.followers}
                        onChange={setPField('followers')} inputMode="numeric" placeholder="25000"
                        disabled={igConnected} style={igConnected ? { paddingRight: 38 } : undefined} />
                      {igConnected && (
                        <Lock style={{ position: 'absolute', right: 13, top: 15, width: 14, height: 14, color: 'var(--faint)' }} />
                      )}
                    </div>
                  </Field>
                </div>
                <div className="cl-grow">
                  <Field label="Engagement %"><Input value={p.engagement} onChange={setPField('engagement')} inputMode="decimal" placeholder="3.2" /></Field>
                </div>
              </div>
              {!igConnected && (
                <div className="cl-row" style={{ gap: 10 }}>
                  <div className="cl-grow">
                    <Field label="Avg views"><Input value={p.avgViews} onChange={setPField('avgViews')} inputMode="numeric" placeholder="12000" /></Field>
                  </div>
                  <div className="cl-grow">
                    <Field label="Avg likes"><Input value={p.avgLikes} onChange={setPField('avgLikes')} inputMode="numeric" placeholder="900" /></Field>
                  </div>
                  <div className="cl-grow">
                    <Field label="Reach"><Input value={p.reach} onChange={setPField('reach')} inputMode="numeric" placeholder="40000" /></Field>
                  </div>
                </div>
              )}
              {igConnected && (
                <div className="cl-small cl-muted" style={{
                  background: 'var(--surface-2)', borderRadius: 8, padding: '10px 12px',
                  marginBottom: 4, lineHeight: 1.5, display: 'flex', gap: 8, alignItems: 'center',
                }}>
                  <Lock style={{ width: 14, height: 14, flexShrink: 0 }} />
                  <span>Views, likes & reach sync automatically from your Instagram — no need to enter them manually.</span>
                </div>
              )}
              <Field label="Social profile link">
                <div style={{ position: 'relative' }}>
                  <Link2 style={{ position: 'absolute', left: 13, top: 14, width: 16, height: 16, color: 'var(--faint)' }} />
                  <Input value={p.profileLink} onChange={setPField('profileLink')} placeholder="https://instagram.com/…" style={{ paddingLeft: 38 }} inputMode="url" />
                </div>
              </Field>
              <Field label="YouTube channel (optional)">
                <div style={{ position: 'relative' }}>
                  <Youtube style={{ position: 'absolute', left: 13, top: 14, width: 16, height: 16, color: 'var(--faint)' }} />
                  <Input value={p.ytChannel} onChange={setPField('ytChannel')} placeholder="https://youtube.com/@…" style={{ paddingLeft: 38 }} inputMode="url" />
                </div>
              </Field>
              <div className="cl-small" style={{ fontWeight: 700, margin: '6px 0 8px' }}>Categories</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
                {CATEGORIES.map((c) => (
                  <Chip key={c} on={p.categories.includes(c)} cyan={p.categories.includes(c)}
                    onClick={() => toggleArr('categories', c)} icon={Tag}>{c}</Chip>
                ))}
              </div>
              <div className="cl-small" style={{ fontWeight: 700, margin: '6px 0 8px' }}>Promotion types you offer</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 6 }}>
                {PROMO_TYPES.map((t) => (
                  <Chip key={t.key} on={p.promotionTypes.includes(t.key)} cyan={p.promotionTypes.includes(t.key)}
                    onClick={() => toggleArr('promotionTypes', t.key)}>{t.label}</Chip>
                ))}
              </div>
              {err && <div className="cl-error-text" style={{ margin: '10px 0' }}>{err}</div>}
              <Button block size="lg" loading={busy === 'profile'} type="submit" icon={CheckCircle2} style={{ marginTop: 12 }}>
                Save profile
              </Button>
            </Card>
          </form>
        )}

        {tab === 'content' && (
          <div className="cl-fade" style={{ display: 'grid', gap: 14 }}>
            <Card>
              <div className="cl-row" style={{ gap: 8, marginBottom: 12 }}>
                <Instagram style={{ width: 18, height: 18, color: '#E1306C' }} />
                <h3 style={{ fontSize: 16 }}>Instagram content</h3>
                {igConnected && profileCreator.instagram?.username && (
                  <span className="cl-small cl-muted">@{profileCreator.instagram.username}</span>
                )}
              </div>
              {!igConnected ? (
                <div style={{ textAlign: 'center', padding: '24px 16px' }}>
                  <ImageIcon style={{ width: 40, height: 40, color: 'var(--faint)', margin: '0 auto 12px' }} />
                  <p className="cl-small cl-muted" style={{ lineHeight: 1.6, marginBottom: 16 }}>
                    Connect your Instagram to automatically showcase your posts and reels here —
                    exactly what brands will see.
                  </p>
                  <Button size="sm" onClick={() => {
                  <Badge tone="amber" style={{ marginTop: 10 }}>Coming Soon</Badge>
                </div>
              ) : ((profileCreator.instagramClient?.recentMedia?.length || profileCreator.instagram?.recentMedia?.length) > 0 ? (
                <FeaturedContentPicker creator={profileCreator} toast={toast} />
              ) : (
                <div style={{ textAlign: 'center', padding: '24px 16px' }}>
                  <ImageIcon style={{ width: 40, height: 40, color: 'var(--faint)', margin: '0 auto 12px' }} />
                  <p className="cl-small cl-muted" style={{ lineHeight: 1.6 }}>
                    No posts found. Tap Sync on the Instagram banner above to refresh.
                  </p>
                </div>
              ))}
            </Card>
          </div>
        )}

        {tab === 'ratecard' && (
          <form onSubmit={saveRates} className="cl-fade">
            <Card>
              <h3 style={{ fontSize: 16, marginBottom: 4 }}>Your Packages</h3>
              <p className="cl-small cl-muted" style={{ marginBottom: 14, lineHeight: 1.6 }}>
                Brands hire you by package — like a shop. Enable the services you offer,
                write what each includes, and set your price. Set a discounted price to
                stand out in discovery.
              </p>
              <div style={{ display: 'grid', gap: 12 }}>
                {PROMO_TYPES.filter((p) => PRICE_KEYS.includes(p.key)).map((p) => {
                  const k = p.key;
                  const meta = pkgMeta[k] || {};
                  return (
                    <div key={k} style={{
                      border: '1px solid var(--line)', borderRadius: 12, padding: 12,
                      opacity: meta.enabled === false ? 0.55 : 1,
                      background: meta.enabled === false ? 'var(--wash)' : 'transparent',
                    }}>
                      <div className="cl-row" style={{ alignItems: 'center', marginBottom: 8 }}>
                        <Toggle on={meta.enabled !== false} onChange={(v) => setPkgMeta((pr) => ({ ...pr, [k]: { ...pr[k], enabled: v } }))} />
                        <div style={{ fontWeight: 700, fontSize: 14 }}>1 × {p.label}</div>
                      </div>
                      {meta.enabled !== false && (
                        <>
                          <div className="cl-small cl-muted" style={{ marginBottom: 8 }}>{p.desc}</div>
                          <TextArea
                            value={meta.description || ''}
                            onChange={setPkg(k, 'description')}
                            placeholder="What's included? e.g. 1 reel up to 60s, 2 revisions, posted within 5 days…"
                            rows={2}
                            style={{ marginBottom: 10 }}
                          />
                          <div className="cl-row" style={{ gap: 10, alignItems: 'flex-end' }}>
                            <div className="cl-grow">
                              <div className="cl-small" style={{ fontWeight: 700, marginBottom: 6 }}>Price (₹)</div>
                              <Input value={prices[k]} onChange={(e) => setPrices((p2) => ({ ...p2, [k]: e.target.value }))}
                                placeholder="e.g. 2500" inputMode="numeric" />
                            </div>
                            <div className="cl-grow">
                              <div className="cl-small cl-muted" style={{ fontWeight: 600, marginBottom: 6 }}>Sale price (₹)</div>
                              <Input value={dPrices[k]} onChange={(e) => setDPrices((p2) => ({ ...p2, [k]: e.target.value }))}
                                placeholder="Optional" inputMode="numeric" />
                            </div>
                            <div style={{ width: 90 }}>
                              <div className="cl-small cl-muted" style={{ fontWeight: 600, marginBottom: 6 }}>Delivery</div>
                              <Input value={meta.deliveryDays || ''} onChange={setPkg(k, 'deliveryDays')}
                                placeholder="Days" inputMode="numeric" />
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
              {err && <div className="cl-error-text" style={{ margin: '10px 0' }}>{err}</div>}
              <Button block size="lg" loading={busy === 'rates'} type="submit" icon={Wallet} style={{ marginTop: 14 }}>
                Save packages
              </Button>
            </Card>
          </form>
        )}

        {tab === 'account' && (
          <form onSubmit={saveAccount} className="cl-fade" style={{ display: 'grid', gap: 14 }}>
            <Card>
              <h3 style={{ fontSize: 16, marginBottom: 12 }}>Account</h3>
              <Field label="Email" hint="Login email — cannot be changed here">
                <Input value={profileCreator.email || ''} disabled style={{ opacity: 0.6 }} />
              </Field>
              <Field label="WhatsApp">
                <Input value={a.whatsapp} onChange={setAField('whatsapp')} placeholder="+91 98765 43210" inputMode="tel" />
              </Field>
              <Field label="Shipping address" hint="Shared with brands only after you accept a barter booking">
                <TextArea value={a.address} onChange={setAField('address')} placeholder="Flat, street, area, city, PIN" />
              </Field>
              <div className="cl-row" style={{ marginBottom: 4 }}>
                <Toggle on={a.barterEligible} onChange={(v) => setA((p2) => ({ ...p2, barterEligible: v }))} />
                <span className="cl-small" style={{ fontWeight: 600 }}>Open to barter collaborations</span>
              </div>
              {err && <div className="cl-error-text" style={{ margin: '10px 0' }}>{err}</div>}
              <Button block loading={busy === 'account'} type="submit" icon={CheckCircle2} style={{ marginTop: 10 }}>
                Save account details
              </Button>
            </Card>
            <Card>
              <ThemeToggle pro={isPro} />
              <Button variant="danger" block onClick={() => setLogoutOpen(true)} icon={LogOut} style={{ marginBottom: 76 }}>Log out</Button>
            </Card>
          </form>
        )}
      </div>
      <ConfirmDialog
        open={logoutOpen}
        onClose={() => setLogoutOpen(false)}
        title="Log out?"
        body="You will be signed out of your creator account on this device."
        confirmLabel="Log out"
        danger
        onConfirm={onLogout}
      />
    </Page>
  );
}
