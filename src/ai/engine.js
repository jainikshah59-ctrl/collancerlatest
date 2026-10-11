/* Cleo discovery + deterministic answer engine.
 * Pure logic, DOM-free (runs in node for tests and in the browser).
 * Grounding contract: NEVER invent creators, prices, availability, payments,
 * balances, bookings, policies or transaction state. Exact matches only on the
 * strict path — no unrelated alternatives when explicit hard constraints
 * yield nothing.
 */

import { CATEGORIES, CITIES, PLATFORMS } from '../lib/constants.js';
import { compact, inr } from '../lib/format.js';
import { findKnowledge } from './cleoKnowledgeBase.js';
import { findQA, findKB, scoreQA } from './knowledge.js';

/* ---------------- tokenisation helpers ---------------- */

const norm = (s) => String(s || '').toLowerCase().trim();
const wordsOf = (s) => norm(s).split(/[^a-z0-9₹+]+/).filter(Boolean);

/* ---------------- niche synonyms ---------------- */

const NICHE_SYNONYMS = {
  Fashion: ['fashion', 'apparel', 'clothing', 'style', 'outfit', 'ootd', 'modelling', 'modeling'],
  Beauty: ['beauty', 'makeup', 'skincare', 'cosmetics', 'haircare', 'grooming', 'make-up'],
  Fitness: ['fitness', 'gym', 'workout', 'bodybuilding', 'yoga', 'exercise', 'crossfit'],
  Food: ['food', 'foodie', 'recipe', 'cooking', 'restaurant', 'chef', 'baking', 'foodblogger'],
  Travel: ['travel', 'traveller', 'traveler', 'wanderlust', 'trip', 'tourism', 'vlog-travel'],
  Tech: ['tech', 'technology', 'gadgets', 'smartphone', 'ai', 'software', 'coding', 'review-tech'],
  Lifestyle: ['lifestyle', 'lifestyleblogger', 'daily-life', 'vlog'],
  Finance: ['finance', 'investing', 'money', 'stock', 'trading', 'crypto', 'personal-finance', 'finfluencer'],
  Education: ['education', 'study', 'coaching', 'exam', 'teacher', 'learning', 'edtech'],
  Gaming: ['gaming', 'gamer', 'esports', 'bgmi', 'streaming', 'streamer'],
  Health: ['health', 'wellness', 'nutrition', 'diet', 'mental-health', 'ayurveda'],
  Home: ['home', 'interior', 'decor', 'homedecor', 'real-estate-home', 'diy'],
  Automobile: ['automobile', 'car', 'bike', 'automotive', 'vehicle', 'car-review'],
  Parenting: ['parenting', 'mom', 'dad', 'kids', 'family', 'motherhood'],
};

const NICHE_BY_WORD = {};
for (const [niche, syns] of Object.entries(NICHE_SYNONYMS)) {
  for (const w of syns) NICHE_BY_WORD[w] = niche;
}
// Canonical names themselves always resolve.
for (const n of CATEGORIES) NICHE_BY_WORD[norm(n)] = n;

/* ---------------- money / follower parsing ---------------- */

const UNIT_MULT = { k: 1_000, K: 1_000, m: 1_000_000, M: 1_000_000, l: 100_000, L: 100_000 };

/** Parse "₹50,000" | "50k" | "5 lakh" | "1.5L" | "₹2,00,000" into a number. */
function parseAmount(fragment) {
  let f = String(fragment).replace(/[, ]/g, '');
  const m = f.match(/^([\d.]+)([kKmMlL])?(?:akh)?$/i);
  if (!m) return null;
  const base = parseFloat(m[1]);
  if (!Number.isFinite(base)) return null;
  const mult = m[2] ? (UNIT_MULT[m[2]] ?? 1) : 1;
  return Math.round(base * mult);
}

const RUPEE_RE = /(?:₹|rs\.?|inr|rupees?)\s?([\d.,]+(?:\s?[kKmMlL])?)/i;
const LAKH_RE = /([\d.]+)\s*(lakh|lacs?)/i;
const UNDER_BUDGET_RE = /\b(?:under|within|below|max|maximum|up\s?to|budget(?:\s+of)?|around|near|about|less\s+than)\s+(?:₹|rs\.?|inr)?\s?([\d.,]+(?:\s?[kKmMlL])?(?:\s*lakh)?)/i;

function extractBudget(q) {
  const out = { budget: null, maxBudget: null, priceUnit: null };
  const s = norm(q);
  let m = s.match(UNDER_BUDGET_RE);
  if (m) {
    const amt = parseAmount((m[1] || '').replace(/lakh/i, 'L'));
    if (amt) { out.maxBudget = amt; out.priceUnit = 'inr'; }
  }
  m = s.match(RUPEE_RE);
  if (m) {
    const amt = parseAmount(m[1]);
    if (amt) { out.budget = amt; out.priceUnit = 'inr'; }
  }
  m = s.match(LAKH_RE);
  if (m) {
    const amt = parseAmount(`${m[1]}L`);
    if (amt) { out.budget = amt; out.maxBudget = out.maxBudget ?? amt; out.priceUnit = 'inr'; }
  }
  if (out.budget && !out.maxBudget) out.maxBudget = out.budget;
  return out;
}

const FOLLOWERS_RE = /(?:at\s+least\s+|minimum\s+|min\.?\s+|over\s+|more\s+than\s+)?([\d.]+)\s?([kKmM])\+?\s*(?:followers?|subs(?:cribers?)?|audience|fans)/i;
const ENGAGEMENT_RE = /([\d.]+)\s?%\s*(?:\+?\s*)?(?:engagement|min\s*engagement|eng\.?\s*rate)/i;

const COUNT_RE = /\btop\s+(\d{1,2})\b/i;
const COUNT_RE2 = /\b(?:show|give|find|list|get)\s+(?:me\s+)?(\d{1,2})\s*(?:more\s+)?(?:creators?|influencers?|profiles?|options?|results?)/i;

const PLATFORM_WORDS = {
  instagram: ['instagram', 'insta', 'ig', 'reel', 'reels', 'story', 'stories'],
  youtube: ['youtube', 'yt', 'youtuber', 'shorts'],
};
const BOTH_WORDS = ['both', 'instagram and youtube', 'youtube and instagram'];

const CITY_ALIASES = { bengaluru: 'Bengaluru', bangalore: 'Bengaluru' };
const LANGUAGES = [
  'hindi', 'english', 'hinglish', 'tamil', 'telugu', 'malayalam', 'kannada',
  'bengali', 'marathi', 'gujarati', 'punjabi', 'odia', 'assamese',
];

/* ---------------- parseQuery ---------------- */

/**
 * parseQuery(q) -> { niche, budget, maxBudget, minFollowers, minEngagement,
 *                    count, platform, city, language, priceUnit }
 */
export function parseQuery(q) {
  const s = norm(q);
  const ws = new Set(wordsOf(s));
  const out = {
    niche: null, budget: null, maxBudget: null, minFollowers: null,
    minEngagement: null, count: null, platform: null, city: null,
    language: null, priceUnit: null,
  };

  for (const [word, niche] of Object.entries(NICHE_BY_WORD)) {
    if (ws.has(word) || (word.length > 4 && s.includes(word))) { out.niche = niche; break; }
  }

  const { budget, maxBudget, priceUnit } = extractBudget(q);
  out.budget = budget; out.maxBudget = maxBudget; out.priceUnit = priceUnit;

  const fm = s.match(FOLLOWERS_RE);
  if (fm) {
    const n = parseFloat(fm[1]);
    if (Number.isFinite(n)) out.minFollowers = Math.round(n * (UNIT_MULT[fm[2]] ?? 1));
  }

  const em = s.match(ENGAGEMENT_RE);
  if (em) {
    const n = parseFloat(em[1]);
    if (Number.isFinite(n) && n > 0 && n <= 100) out.minEngagement = n;
  }

  const cm = s.match(COUNT_RE) || s.match(COUNT_RE2);
  if (cm) {
    const n = parseInt(cm[1], 10);
    if (Number.isFinite(n) && n > 0 && n <= 50) out.count = n;
  }

  if (BOTH_WORDS.some((w) => s.includes(w))) out.platform = 'Both';
  else if (PLATFORM_WORDS.instagram.some((w) => ws.has(w) || s.includes(w))) out.platform = 'Instagram';
  else if (PLATFORM_WORDS.youtube.some((w) => ws.has(w) || s.includes(w))) out.platform = 'YouTube';

  for (const c of CITIES) {
    const cl = norm(c);
    if (s.includes(cl)) { out.city = c === 'Other' ? null : c; if (out.city) break; }
  }
  if (!out.city) {
    for (const [alias, canonical] of Object.entries(CITY_ALIASES)) {
      if (s.includes(alias)) { out.city = canonical; break; }
    }
  }

  for (const l of LANGUAGES) {
    if (ws.has(l)) { out.language = l[0].toUpperCase() + l.slice(1); break; }
  }

  return out;
}

/* ---------------- creator normalization ---------------- */

function num(v, dflt = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : dflt;
}

/** normalizeCreator(raw) -> canonical creator record */
export function normalizeCreator(raw) {
  const r = raw || {};
  const prices = r.prices && typeof r.prices === 'object' ? r.prices
    : (r.price != null ? { standard: num(r.price) } : {});
  let minPrice = null;
  for (const v of Object.values(prices)) {
    const n = num(v, null);
    if (n != null && n > 0) minPrice = minPrice == null ? n : Math.min(minPrice, n);
  }
  const categories = Array.isArray(r.categories) ? r.categories
    : (r.niche ? [r.niche] : []);
  const handle = String(r.handle || r.username || '').replace(/^@/, '');
  return {
    id: String(r.id || r.uid || handle || ''),
    name: String(r.name || r.displayName || handle || 'Creator'),
    handle,
    handleLower: String(r.handleLower || handle).toLowerCase(),
    niche: String(r.niche || categories[0] || ''),
    categories,
    platform: String(r.platform || 'Instagram'),
    city: String(r.city || ''),
    language: String(r.language || ''),
    followers: num(r.followers ?? r.ytSubscribers),
    engagement: num(r.engagement),
    avgViews: num(r.avgViews ?? r.reach),
    reach: num(r.reach ?? r.avgViews),
    rating: num(r.rating),
    prices,
    minPrice,
    pfp: r.pfp || r.photoURL || null,
    verified: !!r.verified,
    addedToCollancer: r.addedToCollancer !== false,
    hasActiveBooking: !!r.hasActiveBooking,
    banned: !!r.banned,
    _raw: r,
  };
}

/** dedupeCreators(list) — by id and handleLower (either seen skips the record) */
export function dedupeCreators(list) {
  const seenIds = new Set();
  const seenHandles = new Set();
  const out = [];
  for (const c of (list || []).map(normalizeCreator)) {
    const idKey = c.id || null;
    const hKey = c.handleLower || null;
    if (!idKey && !hKey) continue;
    if ((idKey && seenIds.has(idKey)) || (hKey && seenHandles.has(hKey))) continue;
    if (idKey) seenIds.add(idKey);
    if (hKey) seenHandles.add(hKey);
    out.push(c);
  }
  return out;
}

/* ---------------- ranking ---------------- */

function platformMatches(creatorPlatform, wanted) {
  if (!wanted || wanted === 'Both') return true;
  const cp = norm(creatorPlatform);
  if (wanted === 'Instagram') return cp.includes('insta') || cp.includes('both');
  if (wanted === 'YouTube') return cp.includes('youtube') || cp.includes('both') || cp.includes('yt');
  return true;
}

function nicheMatches(c, wanted) {
  if (!wanted) return true;
  const wl = norm(wanted);
  return [c.niche, ...c.categories].some((x) => norm(x) === wl || norm(x).includes(wl) || wl.includes(norm(x)));
}

/**
 * rankCreators(parsed, creators) -> [{ creator, score, reasons[] }]
 * Strict path: hard constraints filter; empty result => caller says so honestly.
 */
export function rankCreators(parsed, creators) {
  const p = parsed || {};
  const ceiling = p.maxBudget ?? p.budget;
  const results = [];

  for (const c of dedupeCreators(creators)) {
    if (c.banned) continue;
    if (!c.addedToCollancer) continue;
    if (c.hasActiveBooking) continue;
    if (p.niche && !nicheMatches(c, p.niche)) continue;
    if (p.platform && !platformMatches(c.platform, p.platform)) continue;
    if (p.city && norm(c.city) !== norm(p.city)) continue;
    if (p.language && c.language && norm(c.language) !== norm(p.language)) continue;
    if (p.minFollowers && c.followers < p.minFollowers) continue;
    if (p.minEngagement && c.engagement < p.minEngagement) continue;
    if (ceiling != null) {
      if (c.minPrice == null || c.minPrice > ceiling) continue;
    }

    const reasons = [];
    let score = 0;

    if (p.niche) { reasons.push(`Niche: ${c.niche || p.niche}`); score += 20; }
    if (p.platform) { reasons.push(`Platform: ${c.platform}`); score += 8; }
    if (p.city) { reasons.push(`Based in ${c.city}`); score += 10; }
    if (p.language) { reasons.push(`Language: ${c.language || p.language}`); score += 6; }

    if (c.followers > 0) {
      reasons.push(`${compact(c.followers)} followers`);
      score += Math.min(25, Math.log10(c.followers + 1) * 6);
    }
    if (c.engagement > 0) {
      reasons.push(`${c.engagement}% engagement`);
      score += Math.min(25, c.engagement * 4);
    }
    if (p.minFollowers) { reasons.push(`≥ ${compact(p.minFollowers)} followers required`); score += 6; }
    if (p.minEngagement) { reasons.push(`≥ ${p.minEngagement}% engagement required`); score += 6; }

    const reach = c.avgViews || c.reach;
    if (reach > 0) { reasons.push(`~${compact(reach)} avg views`); score += Math.min(12, Math.log10(reach + 1) * 3); }
    if (c.rating > 0) { reasons.push(`Rated ${c.rating.toFixed(1)}/5`); score += c.rating * 2; }

    if (ceiling != null && c.minPrice != null) {
      const value = (ceiling - c.minPrice) / ceiling; // cheaper within budget = better value
      reasons.push(`${inr(c.minPrice)} fits your budget`);
      score += 8 + Math.max(0, Math.min(12, value * 12));
    } else if (c.minPrice != null) {
      reasons.push(`From ${inr(c.minPrice)}`);
      score += 4;
    }

    if (c.verified) { reasons.push('Verified creator'); score += 6; }

    results.push({ creator: c, score: Math.round(score * 10) / 10, reasons });
  }

  results.sort((a, b) => b.score - a.score);
  return results;
}

/* ---------------- follow-up resolution ---------------- */

// Module cache of the last discovery so follow-ups resolve against it.
let _lastDiscovery = { parsed: null, ranked: [] };
export function _rememberDiscovery(parsed, ranked) {
  _lastDiscovery = { parsed, ranked: ranked || [] };
}

const ORDINALS = {
  first: 0, second: 1, third: 2, fourth: 3, fifth: 4,
  sixth: 5, seventh: 6, eighth: 7, ninth: 8, tenth: 9,
};

function lastTurnWithResults(convo) {
  const turns = (convo && convo.turns) || [];
  for (let i = turns.length - 1; i >= 0; i--) {
    if (turns[i].resultKeys && turns[i].resultKeys.length) return turns[i];
  }
  return null;
}

function formatPick(item) {
  const c = item.creator;
  const bits = [`${c.name}${c.handle ? ` (@${c.handle})` : ''}`];
  if (c.niche) bits.push(c.niche);
  if (c.followers) bits.push(`${compact(c.followers)} followers`);
  if (c.engagement) bits.push(`${c.engagement}% engagement`);
  if (c.minPrice != null) bits.push(`from ${inr(c.minPrice)}`);
  return bits.join(' · ');
}

/**
 * resolveFollowup(q, convo) -> null | followup descriptor.
 * Kinds: 'pick' (ordinal/superlative -> specific creator), 'refinement' (merged parsed for re-rank).
 */
export function resolveFollowup(q, convo) {
  const s = norm(q);
  const turn = lastTurnWithResults(convo);
  const ranked = _lastDiscovery.ranked || [];
  if (!turn || !ranked.length) return null;

  // Ordinal: "first one", "the second", "3rd one"
  let m = s.match(/\b(1st|2nd|3rd|\d+th|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\b/);
  if (m) {
    const word = m[1];
    const idx = ORDINALS[word] ?? (parseInt(word, 10) - 1);
    if (idx >= 0 && idx < ranked.length) {
      const item = ranked[idx];
      return {
        kind: 'pick',
        item,
        answer: `Here is the ${word} match from the list:\n${formatPick(item)}.\n\nTap Book to start a collaboration, or ask me to compare it with another.`,
      };
    }
    return { kind: 'pick', item: null, answer: `That number is outside the ${ranked.length} results I showed. Ask for a number between 1 and ${ranked.length}.` };
  }

  // Superlatives
  if (/\b(highest|most|best|top)\b.*\b(followers?|subs)/.test(s) || /\bmost popular\b/.test(s)) {
    const item = [...ranked].sort((a, b) => b.creator.followers - a.creator.followers)[0];
    return { kind: 'pick', item, answer: `Highest reach in this list: ${formatPick(item)}.` };
  }
  if (/\b(highest|best)\b.*\bengagement/.test(s)) {
    const item = [...ranked].sort((a, b) => b.creator.engagement - a.creator.engagement)[0];
    return { kind: 'pick', item, answer: `Highest engagement in this list: ${formatPick(item)}.` };
  }
  if (/\b(most affordable|cheapest|lowest price|best value|budget pick)\b/.test(s)) {
    const priced = ranked.filter((r) => r.creator.minPrice != null);
    if (priced.length) {
      const item = priced.sort((a, b) => a.creator.minPrice - b.creator.minPrice)[0];
      return { kind: 'pick', item, answer: `Most affordable in this list: ${formatPick(item)}.` };
    }
  }
  if (/\b(top rated|highest rated|best rated)\b/.test(s)) {
    const item = [...ranked].sort((a, b) => b.creator.rating - a.creator.rating)[0];
    return { kind: 'pick', item, answer: `Top rated in this list: ${formatPick(item)}.` };
  }

  // Refinements — merge new constraints onto the last parsed query.
  const prev = _lastDiscovery.parsed || {};
  const fresh = parseQuery(q);
  const hasRefinement =
    fresh.niche || fresh.platform || fresh.city || fresh.language ||
    fresh.maxBudget || fresh.budget || fresh.minFollowers != null ||
    fresh.minEngagement != null || /\bmore\b/.test(s);
  if (hasRefinement && (/\bonly\b/.test(s) || /\bunder\b/.test(s) || /\binstead\b/.test(s) ||
      /\bchange\b/.test(s) || /\bmore\b/.test(s) || fresh.niche || fresh.city || fresh.platform)) {
    const merged = {
      ...prev,
      niche: fresh.niche ?? prev.niche,
      platform: fresh.platform ?? prev.platform,
      city: fresh.city ?? prev.city,
      language: fresh.language ?? prev.language,
      budget: fresh.budget ?? prev.budget,
      maxBudget: fresh.maxBudget ?? prev.maxBudget,
      minFollowers: fresh.minFollowers ?? prev.minFollowers,
      minEngagement: fresh.minEngagement ?? prev.minEngagement,
      count: /\bmore\b/.test(s) ? (prev.count || 8) + 8 : (fresh.count ?? prev.count),
      priceUnit: fresh.priceUnit ?? prev.priceUnit,
    };
    return { kind: 'refinement', parsed: merged };
  }

  return null;
}

/* ---------------- campaign extraction ---------------- */

const DELIVERABLE_WORDS = [
  { key: 'reel', words: ['reel', 'reels'] },
  { key: 'story', words: ['story', 'stories'] },
  { key: 'video', words: ['video', 'videos'] },
  { key: 'post', words: ['post', 'posts', 'static post'] },
  { key: 'ytshorts', words: ['short', 'shorts'] },
  { key: 'personalad', words: ['ad shoot', 'dedicated ad'] },
];

function capPhrase(s) {
  const t = String(s || '').trim().replace(/\s+/g, ' ');
  // Reject sentence-sized values: too long or contains sentence punctuation.
  if (!t || t.length > 60 || /[.!?;]/.test(t)) return '';
  return t;
}

/**
 * extractCampaign(text) -> { brand, product, niche, region, platform,
 *   deliverables, budget, deadline, requirements }. Missing stays empty.
 */
export function extractCampaign(text) {
  const s = String(text || '');
  const sl = norm(s);
  const out = {
    brand: '', product: '', niche: '', region: '', platform: '',
    deliverables: '', budget: '', deadline: '', requirements: '',
  };

  const parsed = parseQuery(s);
  if (parsed.niche) out.niche = parsed.niche;
  if (parsed.city) out.region = parsed.city;
  if (parsed.platform && parsed.platform !== 'Both') out.platform = parsed.platform;
  if (parsed.budget || parsed.maxBudget) out.budget = inr(parsed.maxBudget ?? parsed.budget);

  let m = sl.match(/\bbrand\s+(?:is|called)\s+([a-z0-9&'’\-]+(?:\s+[a-z0-9&'’\-]+){0,2})/);
  if (m) out.brand = capPhrase(m[1]);
  if (!out.brand) {
    m = sl.match(/\b(?:for|with)\s+brand\s+([a-z0-9&'’\-]+(?:\s+[a-z0-9&'’\-]+){0,2})/);
    if (m) out.brand = capPhrase(m[1]);
  }
  m = sl.match(/\bproduct\s+(?:is|called)\s+([a-z0-9&'’\-]+(?:\s+[a-z0-9&'’\-]+){0,2})/);
  if (m) out.product = capPhrase(m[1]);
  if (!out.product) {
    m = sl.match(/\b(?:launching|launch|promote|promoting|sell|selling)\s+(?:our\s+|their\s+|the\s+|a\s+|an\s+)?([a-z0-9&'’\-, ]{2,40}?)(?:\s*,|\s+(?:with|for|through|across|campaign|and)|\.|$)/);
    if (m) out.product = capPhrase(m[1].split(',')[0]);
  }

  const found = [];
  for (const d of DELIVERABLE_WORDS) {
    if (d.words.some((w) => sl.includes(w))) found.push(d.key);
  }
  if (found.length) out.deliverables = [...new Set(found)].join(', ');

  m = sl.match(/\b(?:by|before|deadline:?|due:?)\s+([a-z0-9 ,\/\-]{2,40}?)(?:\.|$)/);
  if (m && /\d|week|month|day|friday|monday|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec/i.test(m[1])) {
    out.deadline = capPhrase(m[1]);
  }

  // Requirements: leftover sentences that are not brand/product claims.
  const sentences = s.split(/[.!?\n]+/).map((x) => x.trim()).filter((x) => x.length > 12 && x.length < 200);
  const req = sentences.filter((x) => !/brand is|product is/i.test(x)).slice(0, 3).join('. ');
  if (req) out.requirements = req;

  return out;
}

/* ---------------- requirement generation ---------------- */

function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/**
 * generateRequirement(nlText, biz) -> Requirements Marketplace post object.
 * biz: { uid, bizName, pfp, isPro }
 */
export function generateRequirement(nlText, biz) {
  const camp = extractCampaign(nlText);
  const b = biz || {};
  const subject = camp.product || camp.brand || camp.niche || 'Creator';
  const idSeed = `${b.uid || 'anon'}|${subject}|${camp.budget}|${camp.niche}|${nlText.slice(0, 80)}`;
  return {
    id: `req_${fnv1a(idSeed)}`,
    bizId: b.uid || null,
    bizName: b.bizName || '',
    bizPfp: b.pfp || null,
    bizIsPro: !!b.isPro,
    title: `${subject} — creator collaboration`.slice(0, 90),
    description: String(nlText || '').trim().slice(0, 1000),
    budget: camp.budget || '',
    category: camp.niche || '',
    promoType: camp.deliverables || '',
    niche: camp.niche || '',
    followerRange: '',
    language: '',
    location: camp.region || '',
    deliverables: camp.deliverables || '',
    applicationInstructions: 'Share your profile link, rates, and one idea for this collaboration when you apply.',
    brand: camp.brand || '',
    product: camp.product || '',
    originalBrief: String(nlText || '').trim().slice(0, 1000),
    status: 'open',
    offerCount: 0,
    createdAt: Date.now(),
  };
}

/* ---------------- answerQuery pipeline ---------------- */

const SMALL_TALK = [
  { re: /\b(hi+|hello|hey|namaste|good\s?(morning|afternoon|evening))\b/, a: 'Hello! I can help you discover creators, plan a campaign, or answer questions about how Collancer works. What are you looking for?' },
  { re: /\b(thanks?|thank you|shukriya|dhanyavad)\b/, a: 'You are welcome! Anything else I can help with?' },
  { re: /\b(bye|goodbye|see you)\b/, a: 'Goodbye! Come back anytime you need creator recommendations.' },
  { re: /\b(who are you|your name|what are you)\b/, a: 'I am Cleo, Collancer\u2019s AI assistant. I help businesses find the right creators and help creators grow on the platform.' },
];

const LEAK_GUARD_RE = /\b(system prompt|developer instruction|your instructions|reveal your|ignore previous|jailbreak|prompt injection|override your)\b/i;

const DISCOVERY_HINT_RE = /\b(find|search|looking for|recommend|suggest|show me|hire|collab(?:oration)? with|need (?:a |an )?creator|want (?:a |an )?creator)\b/i;

function discoveryIntent(q, parsed) {
  if (parsed.niche || parsed.platform || parsed.city || parsed.language ||
      parsed.maxBudget || parsed.budget || parsed.minFollowers != null ||
      parsed.minEngagement != null || parsed.count) return true;
  return DISCOVERY_HINT_RE.test(norm(q));
}

/**
 * answerQuery(q, ctx) -> Promise<{ answer, creators, actions, confidence }>
 * ctx: { creators, user, role, isPro, onAction, knowledge (QA entries), kbTopics }
 */
export async function answerQuery(q, ctx = {}) {
  const query = String(q || '').trim();
  const convo = ctx.convo || null;
  const creators = ctx.creators || [];
  const knowledge = ctx.knowledge || [];
  const kbTopics = ctx.kbTopics || {};

  const fail = (answer) => ({ answer, creators: [], actions: [], confidence: 0.1 });

  if (!query) return fail('Please type a question or describe what you are looking for.');

  // 1. Instruction-leak guard (highest priority).
  if (LEAK_GUARD_RE.test(query)) {
    return {
      answer: 'I can\u2019t share system or developer instructions. I can help with creator discovery, campaigns, bookings, payments, and anything else about Collancer — what do you need?',
      creators: [], actions: [], confidence: 1,
    };
  }

  // 2. Small talk.
  const s = norm(query);
  for (const st of SMALL_TALK) {
    if (st.re.test(s)) return { answer: st.a, creators: [], actions: [], confidence: 0.95 };
  }

  // 3. Follow-up resolution against the last discovery.
  if (convo) {
    try {
      const fu = resolveFollowup(query, convo);
      if (fu && fu.kind === 'pick') {
        const item = fu.item;
        return {
          answer: fu.answer,
          creators: item ? [item] : [],
          actions: item ? [{ type: 'book', creator: item.creator }] : [],
          confidence: item ? 0.9 : 0.7,
        };
      }
      if (fu && fu.kind === 'refinement') {
        const ranked = rankCreators(fu.parsed, creators);
        _rememberDiscovery(fu.parsed, ranked);
        if (!ranked.length) {
          return {
            answer: 'No creators match those refined filters on Collancer right now. Try widening the budget or removing a filter, and I\u2019ll search again.',
            creators: [], actions: [], confidence: 0.6,
          };
        }
        const shown = ranked.slice(0, fu.parsed.count || 8);
        return {
          answer: `Refined search — ${ranked.length} exact match${ranked.length === 1 ? '' : 'es'} found:`,
          creators: shown,
          actions: shown.map((r) => ({ type: 'book', creator: r.creator })),
          confidence: 0.85,
        };
      }
    } catch { /* fall through to normal pipeline */ }
  }

  // 4. Discovery: parse + rank. Skipped when the Live toggle is off —
  // then only the knowledge base answers. Discovery also requires at least
  // one concrete constraint — a bare "how to find …" question with no
  // filters is a knowledge question, not a creator search.
  const parsed = parseQuery(query);
  const hasDiscoveryConstraints = !!(parsed.niche || parsed.platform || parsed.city || parsed.language ||
    parsed.maxBudget || parsed.budget || parsed.minFollowers != null ||
    parsed.minEngagement != null || parsed.count);
  if (ctx.live !== false && hasDiscoveryConstraints && discoveryIntent(query, parsed)) {
    const ranked = rankCreators(parsed, creators);
    _rememberDiscovery(parsed, ranked);
    if (!ranked.length) {
      const bits = [];
      if (parsed.niche) bits.push(`niche "${parsed.niche}"`);
      if (parsed.platform) bits.push(`platform "${parsed.platform}"`);
      if (parsed.city) bits.push(`city "${parsed.city}"`);
      if (parsed.maxBudget) bits.push(`budget under ${inr(parsed.maxBudget)}`);
      if (parsed.minFollowers) bits.push(`≥ ${compact(parsed.minFollowers)} followers`);
      return {
        answer: `I couldn\u2019t find any Collancer creators matching ${bits.length ? bits.join(', ') : 'those filters'} right now. I won\u2019t show unrelated alternatives — try widening the budget, removing a filter, or posting this as a requirement in the marketplace so creators can apply to you.`,
        creators: [],
        actions: [{ type: 'open-requirements' }],
        confidence: 0.7,
      };
    }
    const shown = ranked.slice(0, parsed.count || 8);
    const summary = [];
    if (parsed.niche) summary.push(parsed.niche);
    if (parsed.platform) summary.push(parsed.platform);
    if (parsed.city) summary.push(parsed.city);
    if (parsed.maxBudget) summary.push(`under ${inr(parsed.maxBudget)}`);
    return {
      answer: `Found ${ranked.length} exact match${ranked.length === 1 ? '' : 'es'}${summary.length ? ` for ${summary.join(' · ')}` : ''}. Here are the top picks:`,
      creators: shown,
      actions: shown.map((r) => ({ type: 'book', creator: r.creator })),
      confidence: 0.88,
    };
  }

  // 5. QA lookup over provided knowledge (weighted: question x3, tags x2).
  // A strong QA hit answers immediately; a weak one waits — the 276-entry
  // brain gets first chance and QA is the fallback for product facts.
  let qaFallback = null;
  if (knowledge.length) {
    const qr = scoreQA(query);
    if (qr && qr.score >= 2.0) {
      return { answer: qr.entry.a, creators: [], actions: [], confidence: 0.85 };
    }
    qaFallback = qr && qr.score >= 1.2 ? qr.entry : null;
  }

  // 5b. Expanded Cleo knowledge base (276 entries: structured collaboration
  // knowledge + Collancer brand/campaign/playbook expansion). Shared brain
  // for chat and voice — voice transcripts enter the same pipeline.
  {
    const kb = findKnowledge(query, ctx.role === 'creator' ? 'creator' : ctx.role === 'business' ? 'brand' : 'both');
    if (kb) {
      return { answer: kb.entry.answer, creators: [], actions: [], confidence: kb.confidence };
    }
  }

  // 5c. Weak QA fallback (product facts the brain doesn't cover well).
  if (qaFallback) {
    return { answer: qaFallback.a, creators: [], actions: [], confidence: 0.8 };
  }

  // 6. KB topic lookup.
  if (Object.keys(kbTopics).length) {
    const topic = findKB(query);
    if (topic) {
      return { answer: String(topic).slice(0, 1200), creators: [], actions: [], confidence: 0.65 };
    }
  }

  // 7. Safe fallback — never invent.
  return fail('I don\u2019t have verified info on that. I can help with creator discovery, campaign planning, bookings, wallet deposits, payouts, verification, or Pro plans — what would you like to know?');
}
