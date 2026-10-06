/* Creator profile editor — tabs: profile / rate card / account (audit §7.5).
   Handle changes use the atomic reservation swap (reserve new -> verify -> delete old
   -> update profile) per audit §3.6. Photo: compress -> Cloudinary -> pfp URL. */
import React, { useRef, useState } from 'react';
import {
  User as UserIcon, ArrowLeft, Camera, AtSign, MapPin, Globe, Youtube,
  Wallet, LogOut, RefreshCw, CheckCircle2, BadgeCheck, Tag, Link2, Percent,
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
import { completionPct, isLive } from './DashboardPage.jsx';

const normHandle = (h) => String(h || '').trim().replace(/^@/, '').toLowerCase();
const handleOk = (h) => /^[a-z0-9._]{3,30}$/.test(normHandle(h));

const PRICE_KEYS = ['story', 'reel', 'video', 'personalad', 'ytshorts'];

export default function ProfilePageH({ creator, onBack, onLogout, initialTab, isPro }) {
  const toast = useToast();
  const photoRef = useRef(null);
  const [tab, setTab] = useState(initialTab === 'ratecard' ? 'ratecard' : 'profile');
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState('');

  // ---- profile tab state ----
  const [p, setP] = useState({
    name: creator.name || '', handle: creator.handle || '', bio: creator.bio || '',
    platform: creator.platform || 'Instagram', niche: creator.niche || NICHES[0],
    city: creator.city || 'Mumbai', followers: String(creator.followers || ''),
    engagement: String(creator.engagement || ''), avgViews: String(creator.avgViews || ''),
    avgLikes: String(creator.avgLikes || ''), reach: String(creator.reach || ''),
    profileLink: creator.profileLink || '', ytChannel: creator.ytChannel || '',
    categories: creator.categories || [], promotionTypes: creator.promotionTypes || [],
  });
  const setPField = (k) => (e) => setP((prev) => ({ ...prev, [k]: e.target.value }));

  // ---- rate card state ----
  const [prices, setPrices] = useState(() => {
    const o = {};
    PRICE_KEYS.forEach((k) => { o[k] = creator.prices?.[k] ? String(creator.prices[k]) : ''; });
    return o;
  });
  const [dPrices, setDPrices] = useState(() => {
    const o = {};
    PRICE_KEYS.forEach((k) => { o[k] = creator.discountedPrices?.[k] ? String(creator.discountedPrices[k]) : ''; });
    return o;
  });

  // ---- account tab state ----
  const [a, setA] = useState({
    whatsapp: creator.whatsapp || '', address: creator.address || '',
    barterEligible: creator.barterEligible !== false,
  });
  const setAField = (k) => (e) => setA((prev) => ({ ...prev, [k]: e.target ? e.target.value : e }));
  const [logoutOpen, setLogoutOpen] = useState(false);

  const uid = creator.id;
  const handleChanged = normHandle(p.handle) !== (creator.handleLower || normHandle(creator.handle));

  const toggleArr = (key, val) => setP((prev) => {
    const arr = prev[key] || [];
    return { ...prev, [key]: arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val] };
  });

  async function saveProfile(e) {
    e?.preventDefault();
    setErr('');
    if (p.name.trim().length < 2) return setErr('Please enter your display name.');
    if (!handleOk(p.handle)) return setErr('Handle must be 3–30 characters: letters, numbers, dot or underscore.');
    const num = (v) => (v === '' ? 0 : Math.max(0, Math.round(Number(v) || 0)));
    const profileUpd = {
      name: p.name.trim(), bio: p.bio.trim(), platform: p.platform, niche: p.niche, city: p.city,
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
        const oldLower = creator.handleLower || normHandle(creator.handle);
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
    setBusy('rates');
    try {
      await ensureFirebase();
      await updateDoc(doc(db(), 'creators', uid), {
        prices: clean(prices), discountedPrices: clean(dPrices), updatedAt: serverTimestamp(),
      });
      toast.ok('Rate card saved.');
    } catch (e2) {
      setErr('Could not save your rate card. Please try again.');
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

  const pct = completionPct(creator);
  const live = isLive(creator);

  return (
    <Page pageKey="creator-profile">
      <TopBar title="Profile" subtitle={`@${creator.handleLower || normHandle(creator.handle)}`}
        left={onBack ? <IconBtn icon={ArrowLeft} label="Back" onClick={onBack} /> : null} />
      <div className="cl-container" style={{ paddingTop: 14, paddingBottom: 24, display: 'grid', gap: 14 }}>
        {/* Header card */}
        <Card className="cl-glass">
          <div className="cl-row" style={{ gap: 14 }}>
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <Avatar src={creator.pfp} name={creator.name} size={72} className="lg" pro={!!creator.creatorIsPro} />
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
            </div>
            <div className="cl-grow" style={{ minWidth: 0 }}>
              <div className="cl-row" style={{ gap: 8 }}>
                <h3 style={{ fontSize: 17, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{creator.name}</h3>
                {creator.verified && <BadgeCheck style={{ width: 18, height: 18, color: 'var(--cyan-deep)', flexShrink: 0 }} />}
              </div>
              <div className="cl-small cl-muted" style={{ marginTop: 2 }}>
                {compact(creator.followers || 0)} followers · {creator.platform} · {creator.city}
              </div>
              <div className="cl-row" style={{ gap: 6, marginTop: 8 }}>
                {live ? <Badge tone="cyan">Live</Badge> : <Badge tone="grey">{pct}% complete</Badge>}
                {creator.creatorIsPro && <Badge tone="dark">Pro</Badge>}
              </div>
            </div>
          </div>
        </Card>

        <Tabs
          tabs={[
            { key: 'profile', label: 'Profile', icon: UserIcon },
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
                  <Field label="Handle" hint={handleChanged ? 'Will be reserved atomically on save' : 'Unique, case-insensitive'}>
                    <div style={{ position: 'relative' }}>
                      <AtSign style={{ position: 'absolute', left: 13, top: 14, width: 16, height: 16, color: 'var(--faint)' }} />
                      <Input value={p.handle} onChange={setPField('handle')} placeholder="aarav.creates" style={{ paddingLeft: 38 }} />
                    </div>
                  </Field>
                </div>
              </div>
              <Field label="Bio" hint="Minimum 10 characters for a complete profile">
                <TextArea value={p.bio} onChange={setPField('bio')} placeholder="Fashion + lifestyle creator from Mumbai…" maxLength={300} />
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
                  <Field label="Followers"><Input value={p.followers} onChange={setPField('followers')} inputMode="numeric" placeholder="25000" /></Field>
                </div>
                <div className="cl-grow">
                  <Field label="Engagement %"><Input value={p.engagement} onChange={setPField('engagement')} inputMode="decimal" placeholder="3.2" /></Field>
                </div>
              </div>
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

        {tab === 'ratecard' && (
          <form onSubmit={saveRates} className="cl-fade">
            <Card>
              <h3 style={{ fontSize: 16, marginBottom: 4 }}>Rate card</h3>
              <p className="cl-small cl-muted" style={{ marginBottom: 14, lineHeight: 1.6 }}>
                Brands book at these prices — they cannot be edited during booking. Set a discounted
                price to stand out in Pro discovery.
              </p>
              <div style={{ display: 'grid', gap: 12 }}>
                {PRICE_KEYS.map((k) => (
                  <div key={k} className="cl-row" style={{ gap: 10, alignItems: 'flex-end' }}>
                    <div className="cl-grow">
                      <div className="cl-small" style={{ fontWeight: 700, marginBottom: 6 }}>{promoLabel(k)}</div>
                      <Input value={prices[k]} onChange={(e) => setPrices((p2) => ({ ...p2, [k]: e.target.value }))}
                        placeholder="MRP" inputMode="numeric" />
                    </div>
                    <div style={{ width: 26, textAlign: 'center', paddingBottom: 12, color: 'var(--faint)' }}>
                      <Percent style={{ width: 14, height: 14 }} />
                    </div>
                    <div className="cl-grow">
                      <div className="cl-small cl-muted" style={{ fontWeight: 600, marginBottom: 6 }}>Discounted</div>
                      <Input value={dPrices[k]} onChange={(e) => setDPrices((p2) => ({ ...p2, [k]: e.target.value }))}
                        placeholder="Optional" inputMode="numeric" />
                    </div>
                  </div>
                ))}
              </div>
              {err && <div className="cl-error-text" style={{ margin: '10px 0' }}>{err}</div>}
              <Button block size="lg" loading={busy === 'rates'} type="submit" icon={Wallet} style={{ marginTop: 14 }}>
                Save rate card
              </Button>
            </Card>
          </form>
        )}

        {tab === 'account' && (
          <form onSubmit={saveAccount} className="cl-fade" style={{ display: 'grid', gap: 14 }}>
            <Card>
              <h3 style={{ fontSize: 16, marginBottom: 12 }}>Account</h3>
              <Field label="Email" hint="Login email — cannot be changed here">
                <Input value={creator.email || ''} disabled style={{ opacity: 0.6 }} />
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
              <Button variant="danger" block onClick={() => setLogoutOpen(true)} icon={LogOut}>Log out</Button>
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
