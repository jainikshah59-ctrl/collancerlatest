/* Business Discover — creator discovery with search, filters and Be On Top boosts.
   Source: live Firestore `creators` (addedToCollancer, not banned, no active booking),
   deduped; boosted creators from active adCampaigns surface first. */
import React, { useMemo, useState } from 'react';
import {
  Sparkles, Star, Users, MapPin, SlidersHorizontal, X, Flame, ChevronRight,
} from 'lucide-react';
import { useBiz } from './ctx.jsx';
import { PLATFORMS, CITIES, CATEGORIES } from '../lib/constants.js';
import { compact, inr } from '../lib/format.js';
import {
  Card, Avatar, Badge, Chip, SearchInput, Select, Field,
  EmptyState, SkeletonCard, Button, IconBtn, Page, VerifiedTick,
} from '../components/ui.jsx';

const FOLLOWER_BANDS = [
  { key: 'any', label: 'Any audience', test: () => true },
  { key: 'micro', label: 'Under 50K', test: (f) => f < 50000 },
  { key: 'mid', label: '50K – 200K', test: (f) => f >= 50000 && f < 200000 },
  { key: 'macro', label: '200K – 1M', test: (f) => f >= 200000 && f < 1000000 },
  { key: 'mega', label: '1M+', test: (f) => f >= 1000000 },
];
const RATING_BANDS = [
  { key: 'any', label: 'Any rating', test: () => true },
  { key: 'r35', label: '3.5+', test: (r) => r >= 3.5 },
  { key: 'r40', label: '4.0+', test: (r) => r >= 4 },
  { key: 'r45', label: '4.5+', test: (r) => r >= 4.5 },
];
const BUDGET_BANDS = [
  { key: 'any', label: 'Any budget', test: () => true },
  { key: 'b5', label: 'Up to ₹5K', test: (p) => p <= 5000 },
  { key: 'b15', label: 'Up to ₹15K', test: (p) => p <= 15000 },
  { key: 'b30', label: 'Up to ₹30K', test: (p) => p <= 30000 },
  { key: 'b75', label: 'Up to ₹75K', test: (p) => p <= 75000 },
];

function minPrice(c) {
  if (c.prices) {
    const vals = Object.values(c.prices).map(Number).filter((v) => v > 0);
    if (vals.length) return Math.min(...vals);
  }
  if (c.discountedPrices) {
    const vals = Object.values(c.discountedPrices).map(Number).filter((v) => v > 0);
    if (vals.length) return Math.min(...vals);
  }
  return Number(c.price) || 0;
}

function CreatorCard({ creator, boosted, onOpen, onBook }) {
  const price = minPrice(creator);
  return (
    <Card pressable lift onClick={() => onOpen(creator.id)} className="cl-fade" style={{ marginBottom: 12 }}>
      <div className="cl-row">
        <Avatar src={creator.pfp} name={creator.name} size={54} pro={!!creator.creatorIsPro} />
        <div className="cl-grow" style={{ minWidth: 0 }}>
          <div className="cl-row" style={{ gap: 6 }}>
            <strong style={{ fontSize: 15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {creator.name || 'Creator'}
            </strong>
            {creator.verified && <VerifiedTick size={16} />}
          </div>
          <div className="cl-small cl-muted" style={{ marginTop: 2 }}>
            @{creator.handle || 'creator'} · {creator.platform || 'Instagram'}
          </div>
          <div className="cl-row" style={{ gap: 10, marginTop: 6 }}>
            <span className="cl-small cl-muted" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Users style={{ width: 13, height: 13 }} /> {compact(creator.followers || creator.ytSubscribers || 0)}
            </span>
            <span className="cl-small cl-muted" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Star style={{ width: 13, height: 13, color: 'var(--amber)' }} /> {(Number(creator.rating) || 0).toFixed(1)}
            </span>
            {creator.city && (
              <span className="cl-small cl-muted" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <MapPin style={{ width: 13, height: 13 }} /> {creator.city}
              </span>
            )}
          </div>
        </div>
        <ChevronRight style={{ width: 18, height: 18, color: 'var(--faint)', flexShrink: 0 }} />
      </div>
      <div className="cl-row" style={{ marginTop: 12, justifyContent: 'space-between' }}>
        <div className="cl-row" style={{ gap: 6 }}>
          {boosted && <Badge tone="cyan" icon={Flame}>Be On Top</Badge>}
          {creator.niche && <Chip tag>{creator.niche}</Chip>}
          {price > 0 && <span className="cl-small cl-muted">from <strong className="cl-money" style={{ color: 'var(--ink)' }}>{inr(price)}</strong></span>}
        </div>
        <Button size="sm" onClick={(e) => { e.stopPropagation(); onBook(creator); }}>Book</Button>
      </div>
    </Card>
  );
}

export default function DiscoverPage() {
  const { creators, boostedIds, loadingCreators, openCreator, openBooking } = useBiz();
  const [q, setQ] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [platform, setPlatform] = useState('any');
  const [band, setBand] = useState('any');
  const [ratingBand, setRatingBand] = useState('any');
  const [city, setCity] = useState('any');
  const [budget, setBudget] = useState('any');
  const [niche, setNiche] = useState('any');

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const bandTest = FOLLOWER_BANDS.find((b) => b.key === band)?.test || (() => true);
    const rateTest = RATING_BANDS.find((b) => b.key === ratingBand)?.test || (() => true);
    const budgetTest = BUDGET_BANDS.find((b) => b.key === budget)?.test || (() => true);
    let list = (creators || []).filter((c) => {
      if (needle) {
        const hay = `${c.name || ''} ${c.handle || ''} ${c.niche || ''} ${(c.categories || []).join(' ')}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      if (platform !== 'any' && (c.platform || 'Instagram') !== platform && c.platform !== 'Both') return false;
      const f = Number(c.followers || c.ytSubscribers || 0);
      if (!bandTest(f)) return false;
      if (!rateTest(Number(c.rating) || 0)) return false;
      if (city !== 'any' && (c.city || '') !== city) return false;
      if (budget !== 'any' && !budgetTest(minPrice(c))) return false;
      if (niche !== 'any') {
        const niches = [c.niche, ...(c.categories || [])].filter(Boolean);
        if (!niches.includes(niche)) return false;
      }
      return true;
    });
    list = [...list].sort((a, b) => {
      const ab = boostedIds.has(a.id) ? 0 : 1;
      const bb = boostedIds.has(b.id) ? 0 : 1;
      if (ab !== bb) return ab - bb;
      return (Number(b.rating) || 0) - (Number(a.rating) || 0);
    });
    return list;
  }, [creators, q, platform, band, ratingBand, city, budget, niche, boostedIds]);

  const activeFilterCount = [platform, band, ratingBand, city, budget, niche].filter((v) => v !== 'any').length;
  const clearFilters = () => {
    setPlatform('any'); setBand('any'); setRatingBand('any');
    setCity('any'); setBudget('any'); setNiche('any'); setQ('');
  };

  return (
    <Page pageKey="discover">
      <div className="cl-container" style={{ paddingTop: 16 }}>
        <div className="cl-row" style={{ gap: 10, marginBottom: 12 }}>
          <div className="cl-grow">
            <SearchInput value={q} onChange={setQ} placeholder="Search name, handle, niche…" />
          </div>
          <IconBtn
            icon={showFilters ? X : SlidersHorizontal}
            label="Filters"
            onClick={() => setShowFilters((s) => !s)}
            style={activeFilterCount ? { borderColor: 'var(--cyan)', color: 'var(--cyan-deep)' } : undefined}
          />
        </div>

        {showFilters && (
          <Card className="cl-fade" style={{ marginBottom: 14 }}>
            <div className="cl-row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
              <strong style={{ fontSize: 14 }}>Filters</strong>
              {activeFilterCount > 0 && (
                <button className="cl-link" style={{ background: 'none', border: 0, cursor: 'pointer', fontWeight: 700 }} onClick={clearFilters}>
                  Clear all ({activeFilterCount})
                </button>
              )}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Field label="Platform">
                <Select value={platform} onChange={(e) => setPlatform(e.target.value)}>
                  <option value="any">All platforms</option>
                  {PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
                </Select>
              </Field>
              <Field label="Audience">
                <Select value={band} onChange={(e) => setBand(e.target.value)}>
                  {FOLLOWER_BANDS.map((b) => <option key={b.key} value={b.key}>{b.label}</option>)}
                </Select>
              </Field>
              <Field label="Rating">
                <Select value={ratingBand} onChange={(e) => setRatingBand(e.target.value)}>
                  {RATING_BANDS.map((b) => <option key={b.key} value={b.key}>{b.label}</option>)}
                </Select>
              </Field>
              <Field label="City">
                <Select value={city} onChange={(e) => setCity(e.target.value)}>
                  <option value="any">All cities</option>
                  {CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </Select>
              </Field>
              <Field label="Budget">
                <Select value={budget} onChange={(e) => setBudget(e.target.value)}>
                  {BUDGET_BANDS.map((b) => <option key={b.key} value={b.key}>{b.label}</option>)}
                </Select>
              </Field>
              <Field label="Niche">
                <Select value={niche} onChange={(e) => setNiche(e.target.value)}>
                  <option value="any">All niches</option>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </Select>
              </Field>
            </div>
          </Card>
        )}

        {/* niche quick chips */}
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 12, scrollbarWidth: 'none' }}>
          <Chip on={niche === 'any'} onClick={() => setNiche('any')}>All</Chip>
          {CATEGORIES.slice(0, 10).map((c) => (
            <Chip key={c} on={niche === c} cyan={niche === c} onClick={() => setNiche(niche === c ? 'any' : c)}>{c}</Chip>
          ))}
        </div>

        {loadingCreators ? (
          <><SkeletonCard /><SkeletonCard /><SkeletonCard /></>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Sparkles}
            title="No creators found"
            body="Try widening your filters or search — new creators join Collancer every day."
            action={<Button variant="light" onClick={clearFilters}>Clear filters</Button>}
          />
        ) : (
          <>
            <p className="cl-small cl-muted" style={{ marginBottom: 10 }}>
              {filtered.length} creator{filtered.length === 1 ? '' : 's'} available
              {boostedIds.size > 0 && ' · boosted profiles appear first'}
            </p>
            {filtered.map((c) => (
              <CreatorCard
                key={c.id}
                creator={c}
                boosted={boostedIds.has(c.id)}
                onOpen={openCreator}
                onBook={(cr) => { openBooking(cr); }}
              />
            ))}
          </>
        )}
      </div>
    </Page>
  );
}
