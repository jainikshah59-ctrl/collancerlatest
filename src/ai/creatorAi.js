/* Creator AI engine — deterministic, local, no network calls.
 * askCreatorAI(q, ctx) -> Promise<{ answer, actions[] }>
 * ctx: { creator, bookings, payouts, verification }
 *
 * Never invents: bookings, earnings, payouts, verification state all come from
 * ctx. Pricing guidance is stated as suggested market ranges, not guarantees.
 */

import { inr, compact } from '../lib/format.js';
import { CREATOR_SHARE_PCT, MIN_FOLLOWERS } from '../lib/constants.js';
import { findKnowledge } from './cleoKnowledgeBase.js';

const norm = (s) => String(s || '').toLowerCase().trim();

/* ---------------- profile completeness ---------------- */

const COMPLETENESS_CHECKS = [
  { key: 'name', label: 'Display name', test: (c) => !!norm(c.name) },
  { key: 'handle', label: 'Handle / username', test: (c) => !!norm(c.handle || c.username) },
  { key: 'bio', label: 'Bio (at least 20 characters)', test: (c) => norm(c.bio).length >= 20 },
  { key: 'platform', label: 'Platform (Instagram/YouTube)', test: (c) => !!norm(c.platform) },
  { key: 'niche', label: 'Niche / category', test: (c) => !!norm(c.niche || (c.categories || [])[0]) },
  { key: 'city', label: 'City', test: (c) => !!norm(c.city) },
  {
    key: 'followers', label: `At least ${compact(MIN_FOLLOWERS)} followers`,
    test: (c) => Number(c.followers ?? c.ytSubscribers ?? 0) >= MIN_FOLLOWERS,
  },
  {
    key: 'price', label: 'At least one package price',
    test: (c) => {
      if (c.prices && typeof c.prices === 'object') return Object.values(c.prices).some((v) => Number(v) > 0);
      return Number(c.price) > 0;
    },
  },
];

export function profileCompleteness(creator) {
  const c = creator || {};
  const checks = COMPLETENESS_CHECKS.map((ch) => ({ ...ch, done: !!ch.test(c) }));
  const done = checks.filter((x) => x.done).length;
  return { checks, done, total: checks.length, pct: Math.round((done / checks.length) * 100) };
}

/* ---------------- pricing guidance ---------------- */

const PRICING_TIERS = [
  { max: 10_000, label: 'Under 10K followers', reel: [1500, 3000], story: [500, 1500] },
  { max: 50_000, label: '10K–50K followers', reel: [3000, 8000], story: [1500, 4000] },
  { max: 200_000, label: '50K–200K followers', reel: [8000, 20000], story: [4000, 10000] },
  { max: 1_000_000, label: '200K–1M followers', reel: [20000, 60000], story: [10000, 25000] },
  { max: Infinity, label: '1M+ followers', reel: [60000, null], story: [25000, null] },
];

export function pricingTierFor(followers) {
  const f = Number(followers) || 0;
  return PRICING_TIERS.find((t) => f < t.max) || PRICING_TIERS[PRICING_TIERS.length - 1];
}

function rangeStr([lo, hi]) {
  return hi ? `${inr(lo)}–${inr(hi)}` : `${inr(lo)}+`;
}

/* ---------------- deliverable checklists ---------------- */

export const DELIVERABLE_CHECKLISTS = {
  'reel': {
    label: 'Instagram Reel',
    items: [
      'Hook in the first 2 seconds — show the product or result immediately',
      'Shoot vertical 9:16, well-lit, stable framing',
      'Natural product usage — avoid hard-sell scripts',
      'Add captions/subtitles for sound-off viewers',
      'Include the brand tag and agreed hashtags',
      'Keep to the agreed duration and deliver by the deadline',
      'Share the draft link with the business before posting if required',
    ],
  },
  'story set': {
    label: 'Story Set',
    items: [
      '3–5 story frames telling one mini-narrative',
      'First frame: hook + product reveal',
      'Middle frames: usage, benefits, unboxing or demo',
      'Last frame: swipe-up/link sticker + CTA',
      'Tag the brand on every frame',
      'Keep text readable — large fonts, high contrast',
    ],
  },
  'static post': {
    label: 'Static Post',
    items: [
      'High-resolution image, well-composed and on-brand',
      'Product clearly visible, not buried in the frame',
      'Caption with genuine experience + brand tag + hashtags',
      'Disclose the partnership (#ad) as required',
      'Match the agreed posting date',
    ],
  },
  'youtube video': {
    label: 'YouTube Video',
    items: [
      'Dedicated segment or integration as agreed — no skipping the brief',
      'Mention + link the brand in the description box',
      'Chapters/timestamps if it is a long video',
      'Thumbnail should not misrepresent the product',
      'Confirm usage rights (can the brand repost clips?) before delivery',
    ],
  },
  'ugc': {
    label: 'UGC (brand-use content)',
    items: [
      'Raw, authentic style — UGC should not look like a polished ad',
      'Deliver the agreed number of raw clips + edited cut',
      'No watermarks or personal branding overlays',
      'Confirm usage rights, duration, and paid-ads permission in writing',
      'Deliver source files (not just compressed previews)',
    ],
  },
};

function findChecklist(q) {
  const s = norm(q);
  if (/\bstory\b/.test(s)) return DELIVERABLE_CHECKLISTS['story set'];
  if (/\breel\b/.test(s)) return DELIVERABLE_CHECKLISTS['reel'];
  if (/\bstatic\b|\bpost\b/.test(s)) return DELIVERABLE_CHECKLISTS['static post'];
  if (/\byoutube\b/.test(s)) return DELIVERABLE_CHECKLISTS['youtube video'];
  if (/\bugc\b/.test(s)) return DELIVERABLE_CHECKLISTS['ugc'];
  return null;
}

/* ---------------- brief interpreter ---------------- */

export function interpretBrief(text) {
  const s = norm(text);
  const out = { deliverables: [], deadline: '', usageRights: '', revisions: '', payment: '', guidelines: [] };
  const words = [
    ['reel', 'Reel'], ['story', 'Story Set'], ['static post', 'Static Post'],
    ['video', 'Video'], ['short', 'YouTube Short'], ['ugc', 'UGC'], ['post', 'Post'],
  ];
  for (const [w, label] of words) if (s.includes(w) && !out.deliverables.includes(label)) out.deliverables.push(label);
  const dm = s.match(/\b(?:by|before|deadline:?|due:?)\s+([a-z0-9 ,\/\-]{2,40}?)(?:\.|$)/);
  if (dm) out.deadline = dm[1].trim();
  if (/\busage rights?\b/.test(s)) {
    const um = s.match(/usage rights?[^.!?]{0,120}/);
    out.usageRights = um ? um[0].trim() : 'mentioned — confirm duration and paid-ads permission in writing';
  }
  const rm = s.match(/(\d+)\s+revisions?/);
  if (rm) out.revisions = `${rm[1]} revision(s)`;
  if (/\bbarter\b/.test(s)) out.payment = 'Barter (product exchange, no money)';
  else {
    const pm = s.match(/(?:₹|rs\.?)\s?[\d.,]+(?:\s?[kklm])?/i);
    if (pm) out.payment = pm[0];
  }
  const guideHints = ['#ad', 'disclos', 'hashtag', 'tag the brand', 'no competitor', 'exclusivity', 'raw footage', 'draft approval'];
  for (const g of guideHints) if (s.includes(g)) out.guidelines.push(g);
  return out;
}

/* ---------------- pitch drafting ---------------- */

export function draftPitch(creator, brief) {
  const c = creator || {};
  const b = brief || {};
  const name = c.name || 'there';
  const handle = c.handle ? `@${String(c.handle).replace(/^@/, '')}` : '';
  const followers = Number(c.followers ?? c.ytSubscribers ?? 0);
  const niche = c.niche || (c.categories || [])[0] || 'lifestyle';
  const city = c.city || '';
  const brand = b.brand || 'your brand';
  const product = b.product || 'your product';
  const deliverable = b.deliverable || 'collaboration';
  return (
    `Hi ${brand} team,\n\n` +
    `I'm ${name} ${handle} — a ${niche} creator${city ? ` based in ${city}` : ''}` +
    `${followers ? ` with ${compact(followers)} followers` : ''}.\n\n` +
    `I'd love to create a ${deliverable} for ${product}. My audience actively engages with ${niche} content, and I focus on authentic, high-retention storytelling rather than hard selling.\n\n` +
    `What I can deliver:\n` +
    `- ${deliverable} tailored to your campaign goal\n` +
    `- Draft shared for approval before posting\n` +
    `- Posting within your timeline\n\n` +
    `Happy to share past work and analytics on request. Looking forward to collaborating!\n\n` +
    `Best,\n${name}`
  );
}

/* ---------------- main entry ---------------- */

const LEAK_GUARD_RE = /\b(system prompt|developer instruction|your instructions|reveal your|ignore previous|jailbreak)\b/i;

/**
 * askCreatorAI(q, ctx) -> Promise<{ answer, actions[] }>
 */
export async function askCreatorAI(q, ctx = {}) {
  const query = String(q || '').trim();
  const creator = ctx.creator || {};
  const bookings = Array.isArray(ctx.bookings) ? ctx.bookings : [];
  const payouts = Array.isArray(ctx.payouts) ? ctx.payouts : [];
  const verification = ctx.verification || creator.verificationStatus || creator.verification || null;
  const s = norm(query);
  const actions = [];

  if (!query) return { answer: 'Ask me about your bookings, earnings, payouts, verification, pricing, or content — for example "how complete is my profile?"', actions };

  if (LEAK_GUARD_RE.test(query)) {
    return { answer: 'I can\u2019t share system or developer instructions. Ask me about your creator account instead.', actions };
  }

  // --- profile completeness ---
  if (/complet|profile.*(ready|score|check)|missing.*field/.test(s)) {
    const pc = profileCompleteness(creator);
    const lines = pc.checks.map((c) => `${c.done ? '✓' : '✗'} ${c.label}`);
    return {
      answer: `Your profile is ${pc.pct}% complete (${pc.done}/${pc.total}):\n\n${lines.join('\n')}\n\n${pc.done < pc.total ? 'Finish the unchecked items to become eligible for discovery.' : 'Your profile is complete — you are eligible for business discovery.'}`,
      actions: [{ type: 'open-profile' }],
    };
  }

  // --- profile tips ---
  if (/tip|improve.*profile|bio/.test(s) && !/bookings|earnings/.test(s)) {
    const tips = [];
    if (norm(creator.bio).length < 20) tips.push('Write a bio of at least 20 characters that says who you help and what you post.');
    if (!creator.pfp && !creator.photoURL) tips.push('Add a clear profile photo — profiles with photos get booked more.');
    if (norm(creator.bio).length < 80) tips.push('A longer bio (80+ characters) with your niche keywords helps search matching.');
    const hasPrice = creator.prices && Object.values(creator.prices).some((v) => Number(v) > 0);
    if (!hasPrice) tips.push('Set at least one package price — businesses cannot book creators without prices.');
    if (!creator.profileLink) tips.push('Add your profile link so businesses can verify your content instantly.');
    tips.push('Keep your niche consistent — mixed niches lower your match score.');
    return { answer: `Profile tips for you:\n\n${tips.map((t, i) => `${i + 1}. ${t}`).join('\n')}`, actions };
  }

  // --- pricing guidance ---
  if (/pric|rate|charge|how much.*(ask|set)/.test(s)) {
    const followers = Number(creator.followers ?? creator.ytSubscribers ?? 0);
    const tier = pricingTierFor(followers);
    const lines = PRICING_TIERS.map((t) =>
      `- ${t.label}: Reel ${rangeStr(t.reel)} · Story ${rangeStr(t.story)}`);
    return {
      answer: `Pricing guidance (suggested market ranges, not guarantees):\n\n${lines.join('\n')}\n\nYour tier (${compact(followers)} followers): ${tier.label} — suggested Reel ${rangeStr(tier.reel)}, Story ${rangeStr(tier.story)}.\n\nRemember: your set price is locked at booking, and you earn ${CREATOR_SHARE_PCT}% of it. Price for value, not just followers — engagement matters.`,
      actions: [{ type: 'open-profile' }],
    };
  }

  // --- live bookings ---
  if (/booking/.test(s)) {
    if (!bookings.length) {
      return { answer: 'You have no bookings yet. Complete your profile and get verified to appear in business discovery.', actions: [{ type: 'open-profile' }] };
    }
    const byStatus = {};
    for (const b of bookings) {
      const st = String(b.status || 'Unknown');
      byStatus[st] = (byStatus[st] || 0) + 1;
    }
    const lines = Object.entries(byStatus).map(([st, n]) => `- ${st}: ${n}`);
    const pending = bookings.filter((b) => norm(b.status) === 'pending');
    const hint = pending.length
      ? `\n\nYou have ${pending.length} pending request(s) waiting for your accept/reject — respond quickly, businesses book fast responders.`
      : '';
    return { answer: `Your bookings (${bookings.length} total):\n\n${lines.join('\n')}${hint}`, actions: [{ type: 'open-bookings' }] };
  }

  // --- earnings ---
  if (/earning|income|revenue|how much.*(made|earned)/.test(s)) {
    if (!bookings.length) {
      return { answer: 'No earnings yet — you earn when bookings are completed and the admin releases escrow (95% of the creator price).', actions };
    }
    let pending = 0, completed = 0, paid = 0;
    for (const b of bookings) {
      const share = Math.round(Number(b.creatorPrice ?? b.amount ?? 0) * (CREATOR_SHARE_PCT / 100));
      const st = norm(b.status);
      if (st === 'completed') completed += share;
      else if (st === 'paid' || b.paidOut) paid += share;
      else if (['active', 'pendingcompletion', 'accepted'].includes(st)) pending += share;
    }
    return {
      answer: `Your earnings (your ${CREATOR_SHARE_PCT}% share):\n\n- In escrow / in-progress: ${inr(pending)}\n- Completed (awaiting release): ${inr(completed)}\n- Paid out: ${inr(paid)}\n\nEscrow is released by the admin after delivery approval.`,
      actions: [{ type: 'open-earnings' }],
    };
  }

  // --- payouts ---
  if (/payout|withdraw/.test(s)) {
    const latest = payouts[0] || null;
    const statusLine = latest
      ? `Latest payout: ${inr(latest.amount)} — status "${latest.status}".`
      : 'No payout requests yet.';
    return {
      answer: `${statusLine}\n\nRules: minimum ${inr(100)} per payout, one pending/approved request at a time, via UPI or bank transfer (account + IFSC). Request from the Earnings page.`,
      actions: [{ type: 'open-earnings' }],
    };
  }

  // --- verification ---
  if (/verif/.test(s)) {
    const v = norm(typeof verification === 'string' ? verification : verification?.status || '');
    const state = v || (creator.verified ? 'verified' : 'not submitted');
    const guidance = state.includes('verif') && !state.includes('not') && !state.includes('reject') && !state.includes('pend')
      ? 'You are verified.'
      : state.includes('pend')
        ? 'Your verification is pending admin review.'
        : state.includes('reject')
          ? 'Your last request was rejected — check the reason, fix it, and resubmit.'
          : 'Submit verification from the verification section with your platform, followers, profile URL, niche, and city.';
    return { answer: `Verification status: ${state}.\n\n${guidance}`, actions: [{ type: 'open-verification' }] };
  }

  // --- pitch drafting ---
  if (/pitch|proposal|draft.*(message|mail|brand)/.test(s)) {
    const brand = (s.match(/\bfor\s+([a-z0-9&'’\- ]{2,30})/) || [])[1] || '';
    const product = (s.match(/\b(?:product|launching)\s+([a-z0-9&'’\- ]{2,30})/) || [])[1] || '';
    const deliverable = /reel/.test(s) ? 'Instagram Reel' : /story/.test(s) ? 'Story Set' : /youtube/.test(s) ? 'YouTube video' : 'collaboration';
    const pitch = draftPitch(creator, {
      brand: brand.trim() || 'your brand',
      product: product.trim() || 'your product',
      deliverable,
    });
    return { answer: `Here is a pitch draft — personalize the bracketed details before sending:\n\n${pitch}`, actions: [{ type: 'copy-text', text: pitch }] };
  }

  // --- brief interpreter ---
  if (/brief|interpret|explain.*brief|understand.*brief/.test(s)) {
    const inter = interpretBrief(query);
    const lines = [
      `Deliverables: ${inter.deliverables.join(', ') || 'not specified — ask the business'}`,
      `Deadline: ${inter.deadline || 'not specified — confirm in writing'}`,
      `Usage rights: ${inter.usageRights || 'not specified — confirm duration + paid-ads permission'}`,
      `Revisions: ${inter.revisions || 'not specified — agree upfront'}`,
      `Payment: ${inter.payment || 'not specified in the text you shared'}`,
    ];
    if (inter.guidelines.length) lines.push(`Guidelines mentioned: ${inter.guidelines.join(', ')}`);
    return { answer: `Brief breakdown:\n\n${lines.map((l) => `- ${l}`).join('\n')}\n\nNever invent missing terms — confirm anything unspecified with the business before accepting.`, actions };
  }

  // --- deliverable checklists ---
  const checklist = findChecklist(s);
  if (checklist || /checklist/.test(s)) {
    const cl = checklist || DELIVERABLE_CHECKLISTS['reel'];
    return {
      answer: `${cl.label} checklist:\n\n${cl.items.map((it, i) => `${i + 1}. ${it}`).join('\n')}`,
      actions,
    };
  }

  // --- small talk ---
  if (/\b(hi+|hello|hey)\b/.test(s)) {
    return { answer: `Hello ${creator.name ? creator.name.split(' ')[0] : 'creator'}! Ask me about your bookings, earnings, payouts, verification, pricing, or content checklists.`, actions };
  }
  if (/\b(thanks?|thank you)\b/.test(s)) return { answer: 'You are welcome! Good luck with your collaborations.', actions };

  // --- shared brain: domain knowledge for creator-audience questions ---
  const kb = findKnowledge(query, 'creator');
  if (kb) {
    return { answer: kb.entry.answer, actions };
  }

  // --- safe fallback ---
  return {
    answer: 'I don\u2019t have verified info on that. I can help with your profile completeness, bookings, earnings, payouts, verification status, pricing guidance, pitch drafts, brief breakdowns, and content checklists — what do you need?',
    actions,
  };
}
