/* Scope guard for Collancer Ai — topic restriction (fail-closed).
 *
 * Business (brand) side: ONLY creator-collaboration + Collancer-app questions.
 * Creator side:          ONLY brand-collaboration + Collancer-app questions.
 * Anything else -> a fixed refusal message. Runs BEFORE the LLM pool and the
 * deterministic brain, so off-topic questions never reach any answer source.
 *
 * Allowed through (not "questions"):
 *  - greetings / thanks / acknowledgments -> brief friendly reply + scope reminder
 *  - discovery follow-ups ("the second one", "cheapest") -> resolved via convo
 *
 * In-scope detection (any one passes):
 *  1. Discovery follow-up resolvable from conversation context.
 *  2. Matches a Collancer brain entry (findKnowledge, confidence >= threshold).
 *  3. Contains a collaboration / Collancer-app keyword (stemmed).
 *
 * DOM-free: safe to import in node tests and the browser.
 */

import { findKnowledge } from './cleoKnowledgeBase.js';
import { resolveFollowup } from './engine.js';

/* ---------- conversational (non-question) patterns ---------- */

const GREETING_RE = /^(hi+|hii+|hello|hey+|namaste|namaskar|good\s?(morning|afternoon|evening|day)|yo|sup)\b[!.?…\s]*$/i;
const THANKS_RE = /\b(thank\s?you|thanks|thx|shukriya|dhanyavaad|dhanyavad)\b/i;
const ACK_RE = /^(ok|okay|okayy+|got\s?it|understood|nice|great|cool|awesome|perfect|sure|yes+|yeah+|no+|hmm+|alright)\b[!.?…\s]*$/i;

/* ---------- scope vocabulary (stemmed, lowercase) ---------- */

/* Collancer-app words — both sides. */
const APP_WORDS = [
  'collanc', 'account', 'login', 'signin', 'signup', 'regist', 'password',
  'otp', 'profil', 'verifi', 'wallet', 'payout', 'transact', 'refund',
  'deposit', 'withdraw', 'notif', 'subscription', 'invoice', 'gst',
  'kyc', 'escrow',
];

/* Collaboration words — both sides (campaigns, content, metrics, legal, ops).
   Kept specific: generic question words (how/what/help/...) are deliberately
   excluded — the knowledge brain catches those phrasings instead. */
const COLLAB_WORDS = [
  'collabor', 'campaign', 'brief', 'book', 'reel', 'influenc', 'creat',
  'brand', 'compan', 'startup', 'youtub', 'instagram', 'tiktok', 'vlog',
  'commiss', 'sponsor', 'promot', 'advert',
  'reach', 'engag', 'follow', 'subscrib', 'niche', 'audienc', 'demograph',
  'insight', 'analy', 'metric', 'roi', 'impress', 'conversion',
  'rating', 'disput', 'marketplac', 'requirement', 'offer', 'pitch',
  'propos', 'negoti', 'discount', 'barter', 'deliver', 'deadlin',
  'contract', 'agreement', 'usage', 'licens', 'disclos', 'guidelin',
  'strateg', 'funnel', 'aware', 'launch', 'festiv', 'trend', 'viral',
  'script', 'shoot', 'caption', 'hashtag', 'mention', 'exclusiv',
  'whitelist', 'boost', 'discov', 'quot', 'budget', 'fraud', 'fake',
  'onboard', 'tutorial', 'earn', 'monet', 'growth',
];

const SCOPE_WORDS = [...APP_WORDS, ...COLLAB_WORDS];

/* ---------- helpers ---------- */

function stem(w) {
  if (w.length <= 3) return w;
  if (w.endsWith('ies') && w.length > 5) return w.slice(0, -3) + 'y';
  if (w.endsWith('ing') && w.length > 6) return w.slice(0, -3);
  if (w.endsWith('es') && w.length > 5) return w.slice(0, -2);
  if (w.endsWith('s') && w.length > 4) return w.slice(0, -1);
  return w;
}

function tokensOf(s) {
  return String(s || '').toLowerCase().split(/[^a-z0-9₹+]+/)
    .filter((w) => w.length > 2)
    .map(stem);
}

/* ---------- public API ---------- */

/**
 * checkScope(question, isCreator, convo) ->
 *   { inScope: true, kind: 'social' | 'followup' | 'topic' } |
 *   { inScope: false }
 * `isCreator` selects the refusal wording; the topic vocabulary is shared
 * because collaboration language overlaps both sides.
 */
export function checkScope(question, isCreator, convo) {
  const q = String(question || '').trim();
  if (!q) return { inScope: false };

  // 1. Social: greetings / thanks / acks are conversational, not questions.
  if (GREETING_RE.test(q) || THANKS_RE.test(q) || ACK_RE.test(q)) {
    return { inScope: true, kind: 'social' };
  }

  // 2. Discovery follow-up resolvable from conversation ("the second one").
  try {
    if (convo && resolveFollowup(q, convo)) return { inScope: true, kind: 'followup' };
  } catch { /* fall through */ }

  // 3. Matches the Collancer knowledge brain with high confidence.
  // Note: threshold is stricter (0.8) than the brain's own answer threshold
  // (0.6), because single-word overlaps ("love", "price") can produce
  // mid-confidence matches on off-topic questions.
  try {
    const hit = findKnowledge(q, 'both');
    if (hit && hit.confidence >= 0.8) return { inScope: true, kind: 'topic' };
  } catch { /* fall through */ }

  // 4. Keyword signal: any collaboration or Collancer-app word (prefix match
  // so "creator"/"creators" and "collaboration"/"collaborations" all hit).
  const toks = tokensOf(q);
  for (const t of toks) {
    for (const w of SCOPE_WORDS) {
      if (t.startsWith(w) || (w.length > 4 && w.startsWith(t))) return { inScope: true, kind: 'topic' };
    }
  }

  return { inScope: false };
}

/** Fixed refusal message, worded per side. Never varies, never leaks. */
export function scopeRefusal(isCreator) {
  if (isCreator) {
    return 'I\u2019m Collancer Ai for creators \u2014 I only help with brand collaborations and Collancer app questions. Ask me about finding brands, bookings, earnings, payouts, or anything about using Collancer.';
  }
  return 'I\u2019m Collancer Ai for brands \u2014 I only help with creator collaborations and Collancer app questions. Ask me about finding creators, campaigns, bookings, pricing, or anything about using Collancer.';
}

/** Friendly reply for greetings / thanks, with a scope reminder. */
export function socialReply(question, isCreator) {
  const q = String(question || '').trim();
  const scope = isCreator ? 'brand collaborations' : 'creator collaborations';
  if (THANKS_RE.test(q)) {
    return `You\u2019re welcome! I\u2019m here for ${scope} and Collancer app questions \u2014 just ask.`;
  }
  return `Hi! I\u2019m Collancer Ai \u2014 I help with ${scope} and Collancer app questions. What would you like to know?`;
}

/* ---------- creator pool routing ---------- */

/**
 * isCreatorDataQuery(q) — true when the question needs the creator's LIVE
 * personal data or personalization (bookings, payouts, earnings, verification
 * status, profile completeness/tips, personalized pricing). These must stay
 * on the deterministic brain (askCreatorAI) and never go to the LLM pool,
 * which has no access to user data. Mirrors askCreatorAI's own routing.
 */
export function isCreatorDataQuery(question) {
  const s = String(question || '').toLowerCase();
  if (/\b(bookings?|payouts?|earnings?|earn\w*|income|withdrawals?|verification|verified|profile)\b/.test(s)) return true;
  if (/\b(my|mine)\b.*\b(pric\w*|rates?|charge)\b/.test(s)) return true;
  if (/\b(pric\w*|rates?|charge)\b.*\b(my|mine|i)\b/.test(s)) return true;
  if (/how much.*\b(i|should i)\b.*\b(charge|ask|set|earn)\b/.test(s)) return true;
  return false;
}
