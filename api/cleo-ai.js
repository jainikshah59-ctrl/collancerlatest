/* POST /api/cleo-ai
 * Deterministic Collancer AI endpoint (no paid LLM key required).
 * Input: { query, knowledge[], creators[], actionContext{} }
 * Output: { provider:'collancer-deterministic', confidence, answer, creators, actions }
 * Errors -> HTTP 200 with a safe fallback answer (never throws).
 */

const STOP = new Set(['what', 'how', 'does', 'the', 'and', 'for', 'with', 'about', 'your', 'you', 'can', 'are', 'this', 'that', 'from', 'have', 'has', 'will', 'when', 'where', 'who', 'why', 'which', 'there', 'their', 'been', 'into', 'than', 'then']);
const toks = (s) => String(s || '').toLowerCase().split(/[^a-z0-9₹+]+/).filter((w) => w.length > 2 && !STOP.has(w));

function overlapScore(q, d) {
  const ds = new Set(d);
  let o = 0;
  for (const w of q) if (ds.has(w)) o++;
  if (!o) return 0;
  return o / Math.max(1, Math.min(q.length, ds.size));
}

function findBestQA(query, knowledge) {
  const qt = toks(query);
  if (!qt.length || !Array.isArray(knowledge)) return null;
  let best = null, bestScore = 0;
  for (const e of knowledge) {
    if (!e || !e.a) continue;
    const s = overlapScore(qt, [...toks(e.q || ''), ...(Array.isArray(e.tags) ? e.tags.flatMap(toks) : [])]);
    if (s > bestScore) { bestScore = s; best = e; }
  }
  return bestScore >= 0.3 ? { entry: best, score: bestScore } : null;
}

/* --- minimal deterministic creator ranking (self-contained) --- */

const CITY_RE = /\b(mumbai|delhi|bengaluru|bangalore|hyderabad|chennai|kolkata|jaipur|pune|kochi|ahmedabad|rajkot|surat|vadodara)\b/i;
const NICHE_RE = /\b(fashion|beauty|fitness|food|travel|tech|lifestyle|finance|education|gaming|health|home|automobile|parenting)\b/i;

function moneyOf(s) {
  const m = String(s).match(/(?:₹|rs\.?|inr)?\s?([\d.,]+)\s?([kKmMlL])?/);
  if (!m) return null;
  const n = parseFloat(String(m[1]).replace(/,/g, ''));
  if (!Number.isFinite(n)) return null;
  const mult = { k: 1e3, K: 1e3, m: 1e6, M: 1e6, l: 1e5, L: 1e5 }[m[2]] || 1;
  return Math.round(n * mult);
}

function creatorMinPrice(c) {
  const prices = c.prices && typeof c.prices === 'object' ? Object.values(c.prices) : [c.price];
  let min = null;
  for (const v of prices) {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) min = min == null ? n : Math.min(min, n);
  }
  return min;
}

function rankCreators(query, creators) {
  const q = String(query || '').toLowerCase();
  const nicheM = q.match(NICHE_RE);
  const cityM = q.match(CITY_RE);
  const budgetM = q.match(/\b(?:under|within|below|budget)\b[^₹\d]{0,12}(?:₹|rs\.?|inr)?\s?[\d.,]+\s?[kkmmlL]?/i);
  const budget = budgetM ? moneyOf(budgetM[0]) : (/(?:₹|rs\.?)/i.test(q) ? moneyOf(q) : null);
  const platM = q.match(/\b(instagram|insta|youtube|yt)\b/);
  const plat = platM ? (['youtube', 'yt'].includes(platM[1]) ? 'youtube' : 'instagram') : null;

  const out = [];
  for (const raw of creators || []) {
    const c = raw || {};
    if (c.banned) continue;
    if (c.addedToCollancer === false) continue;
    if (c.hasActiveBooking) continue;
    const niches = [c.niche, ...(Array.isArray(c.categories) ? c.categories : [])].map((x) => String(x || '').toLowerCase());
    if (nicheM && !niches.some((n) => n.includes(nicheM[1]))) continue;
    if (cityM) {
      const city = String(c.city || '').toLowerCase();
      const want = cityM[1] === 'bangalore' ? 'bengaluru' : cityM[1];
      if (city !== want) continue;
    }
    if (plat) {
      const cp = String(c.platform || 'instagram').toLowerCase();
      if (plat === 'instagram' && !(cp.includes('insta') || cp.includes('both'))) continue;
      if (plat === 'youtube' && !(cp.includes('youtube') || cp.includes('both') || cp === 'yt')) continue;
    }
    const minPrice = creatorMinPrice(c);
    if (budget != null && (minPrice == null || minPrice > budget)) continue;

    const reasons = [];
    let score = 0;
    const followers = Number(c.followers ?? c.ytSubscribers ?? 0);
    const eng = Number(c.engagement ?? 0);
    if (followers > 0) { score += Math.min(25, Math.log10(followers + 1) * 6); reasons.push(`${followers >= 1e6 ? (followers / 1e6).toFixed(1) + 'M' : Math.round(followers / 1e3) + 'K'} followers`); }
    if (eng > 0) { score += Math.min(25, eng * 4); reasons.push(`${eng}% engagement`); }
    if (minPrice != null) { score += 4; reasons.push(`from ₹${minPrice.toLocaleString('en-IN')}`); }
    if (c.verified) { score += 6; reasons.push('Verified creator'); }
    out.push({ creator: c, score: Math.round(score * 10) / 10, reasons });
  }
  out.sort((a, b) => b.score - a.score);
  return { ranked: out, filters: { niche: nicheM?.[1] || null, city: cityM?.[1] || null, budget, platform: plat } };
}

const LEAK_RE = /\b(system prompt|developer instruction|your instructions|reveal your|ignore previous|jailbreak)\b/i;

function safeFallback(query) {
  return {
    provider: 'collancer-deterministic',
    confidence: 0.15,
    answer: 'I don\u2019t have verified info on that. I can help with creator discovery, campaign planning, bookings, wallet deposits, payouts, verification, or Pro plans — what would you like to know?',
    creators: [],
    actions: [],
    query: String(query || '').slice(0, 200),
  };
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return res.status(200).json({ ...safeFallback(''), error: 'Use POST.' });
    }
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch { body = {}; }
    }
    body = body && typeof body === 'object' ? body : {};
    const query = String(body.query || '').trim();
    if (!query) return res.status(200).json(safeFallback(''));

    if (LEAK_RE.test(query)) {
      return res.status(200).json({
        provider: 'collancer-deterministic',
        confidence: 1,
        answer: 'I can\u2019t share system or developer instructions. I can help with creator discovery, campaigns, bookings, payments, and anything else about Collancer — what do you need?',
        creators: [], actions: [],
      });
    }

    const knowledge = Array.isArray(body.knowledge) ? body.knowledge : [];
    const creators = Array.isArray(body.creators) ? body.creators : [];

    // 1. QA match over provided knowledge.
    const qa = findBestQA(query, knowledge);
    if (qa) {
      return res.status(200).json({
        provider: 'collancer-deterministic',
        confidence: 0.8,
        answer: qa.entry.a,
        creators: [], actions: [],
      });
    }

    // 2. Creator discovery when the query looks like a search.
    const looksLikeDiscovery = /(creator|influencer|find|search|looking for|recommend|suggest|show me|hire)/i.test(query)
      || NICHE_RE.test(query) || CITY_RE.test(query) || /(?:₹|rs\.?|inr|budget|followers)/i.test(query);
    if (looksLikeDiscovery && creators.length) {
      const { ranked, filters } = rankCreators(query, creators);
      if (!ranked.length) {
        return res.status(200).json({
          provider: 'collancer-deterministic',
          confidence: 0.65,
          answer: 'I couldn\u2019t find any Collancer creators matching those filters right now. I won\u2019t show unrelated alternatives — try widening the budget or removing a filter.',
          creators: [], actions: [{ type: 'open-requirements' }],
        });
      }
      const shown = ranked.slice(0, 8);
      return res.status(200).json({
        provider: 'collancer-deterministic',
        confidence: 0.85,
        answer: `Found ${ranked.length} exact match${ranked.length === 1 ? '' : 'es'}. Here are the top picks:`,
        creators: shown,
        actions: shown.map((r) => ({ type: 'book', creator: r.creator })),
        filters,
      });
    }

    return res.status(200).json(safeFallback(query));
  } catch {
    // Never expose exceptions to the caller.
    return res.status(200).json(safeFallback(req?.body?.query || ''));
  }
}
