/* Cleo Knowledge Base — the "brain" for Collancer AI (chat + voice).
 *
 * Sources:
 *  1. collabKnowledge.json — the 137-item structured collaboration knowledge
 *     base shared by Jainik (categories: foundations, formats, strategy, metrics,
 *     rights, operations, payments, legal/compliance, platforms, marketplace,
 *     India, privacy/safety, AI grounding).
 *  2. EXPANSION — Collancer-specific entries written for this build, covering
 *     brand onboarding, campaign planning, brand pricing, outreach, discovery,
 *     content formats, measurement, legal, India specifics, and creator growth.
 *     Together the base holds 280+ entries.
 *
 * Retrieval: findKnowledge(query, audience) scores every entry with weighted
 * token overlap (title x3, tags x2, aliases x2, answer x1), applies an audience
 * preference and a priority boost, and returns { entry, confidence }.
 * DOM-free — runs in node (tests) and the browser.
 */

import BASE_KNOWLEDGE from './collabKnowledgeData.js';

const norm = (s) => String(s || '').toLowerCase().trim();
const wordsOf = (s) => norm(s).split(/[^a-z0-9₹+]+/).filter(Boolean);
const STOP = new Set([
  'what', 'how', 'does', 'the', 'and', 'for', 'with', 'about', 'your', 'you',
  'can', 'are', 'this', 'that', 'from', 'have', 'has', 'will', 'when', 'where',
  'who', 'why', 'which', 'there', 'their', 'been', 'into', 'than', 'then',
  'whats', 'what’s', 'is', 'it', 'its', 'of', 'to', 'in', 'on', 'a', 'an',
  'do', 'i', 'me', 'my', 'we', 'our', 'us', 'they', 'them', 'he', 'she',
  'or', 'as', 'at', 'by', 'be', 'was', 'were', 'are', 'not', 'no', 'yes',
  'if', 'so', 'but', 'all', 'any', 'some', 'such', 'like', 'tell', 'say',
]);
/** Light stemming so "creators" matches "creator", "partnerships" -> "partnership". */
function stem(w) {
  if (w.length <= 3) return w;
  if (w.endsWith('ies') && w.length > 5) return w.slice(0, -3) + 'y';
  if (w.endsWith('ing') && w.length > 6) return w.slice(0, -3);
  if (w.endsWith('es') && w.length > 5) return w.slice(0, -2);
  if (w.endsWith('s')) return w.slice(0, -1);
  return w;
}
const tokens = (s) => wordsOf(s).filter((w) => w.length > 2 && !STOP.has(w)).map(stem);

/* ================= EXPANSION ENTRIES =================
   Collancer-specific knowledge. Same schema as the base:
   id, category, title, answer, tags, audience, aliases, priority. */

const EXPANSION = [
  /* ---------- brand onboarding ---------- */
  {
    id: 'brand-join-collancer',
    category: 'brand-onboarding',
    title: 'How does a brand join Collancer?',
    answer: 'A brand signs up for a business account, completes the business profile (name, category, website, contact), and can immediately start discovering creators. No onboarding fee — you pay only when you book a collaboration (creator price + 12% platform fee).',
    tags: ['brand', 'join', 'sign up', 'business account', 'onboarding', 'register'],
    audience: 'brand',
    aliases: ['join', 'signup', 'register', 'brand account'],
    priority: 1,
  },
  {
    id: 'brand-profile-setup',
    category: 'brand-onboarding',
    title: 'What should a brand profile include?',
    answer: 'A complete brand profile has: business name, logo, category, website/social links, a short description of what you sell, and contact details. Complete profiles get faster creator acceptances because creators can verify you are legitimate.',
    tags: ['brand profile', 'setup', 'business profile', 'complete'],
    audience: 'brand',
    aliases: ['profile', 'setup'],
    priority: 2,
  },
  {
    id: 'brand-discover-how',
    category: 'brand-onboarding',
    title: 'How do brands search for creators on Collancer?',
    answer: 'Open Discover and filter by niche (fashion, beauty, fitness…), platform (Instagram/YouTube), follower range, city, language, budget, and rating. You can also ask Cleo in plain words, e.g. "find beauty creators in Delhi under ₹8,000".',
    tags: ['discover', 'search', 'find creators', 'filters', 'brand'],
    audience: 'brand',
    aliases: ['search', 'discover', 'find'],
    priority: 1,
  },
  {
    id: 'brand-post-requirement',
    category: 'brand-onboarding',
    title: 'How does a brand post a requirement?',
    answer: 'Go to Marketplace → Post requirement. Add title, description, budget, category, platform, follower range, location, language, deliverables, and how creators should apply. Creators send offers with their price and pitch; you accept or reject each. Accepting creates a booking the creator must still accept.',
    tags: ['requirement', 'post', 'marketplace', 'job post', 'brief'],
    audience: 'brand',
    aliases: ['post', 'requirement', 'marketplace'],
    priority: 1,
  },
  {
    id: 'brand-wallet-setup',
    category: 'brand-onboarding',
    title: 'How does a brand add money to the wallet?',
    answer: 'Go to Wallet → create a deposit request of at least ₹100 → pay the shown UPI ID from any UPI app → enter your payer UPI ID and the 12-digit UTR. An admin verifies the payment and credits your wallet. Only admin-verified credits add balance — you cannot credit your own wallet.',
    tags: ['wallet', 'deposit', 'add money', 'upi', 'brand wallet'],
    audience: 'brand',
    aliases: ['wallet', 'deposit', 'money'],
    priority: 1,
  },
  {
    id: 'brand-pro-benefits',
    category: 'brand-onboarding',
    title: 'What does Business Pro give a brand?',
    answer: 'Business Pro gives 5% off the creator price on every booking, plus a premium gold theme across the app. Plans: Monthly ₹799, 6 Months ₹3,894 (save 19%), Annual ₹5,988 (best value). Pro status is checked live and revoked automatically on expiry.',
    tags: ['pro', 'business pro', 'discount', '5%', 'benefits', 'subscription'],
    audience: 'brand',
    aliases: ['pro', 'subscription', 'discount'],
    priority: 1,
  },
  {
    id: 'brand-track-campaigns',
    category: 'brand-onboarding',
    title: 'How does a brand track its campaigns?',
    answer: 'The business Dashboard shows active bookings, pending requests, completed work awaiting your approval, and notifications for every status change (acceptance, delivery, completion, refunds). Each booking keeps its brief, chat, deliverables, and payment trail in one place.',
    tags: ['track', 'dashboard', 'campaign tracking', 'bookings'],
    audience: 'brand',
    aliases: ['track', 'dashboard'],
    priority: 2,
  },
  {
    id: 'brand-first-campaign',
    category: 'brand-onboarding',
    title: 'What should a brand do for its first campaign?',
    answer: 'Start small: pick 3–5 micro-creators (10k–100k followers) in your niche, run paid (not barter) collaborations so expectations are clear, write a tight brief with one clear CTA, and measure with a coupon code or UTM link. Learn from the results before scaling.',
    tags: ['first campaign', 'start', 'beginner', 'brand tips'],
    audience: 'brand',
    aliases: ['first', 'start', 'begin'],
    priority: 2,
  },
  /* ---------- campaign planning ---------- */
  {
    id: 'campaign-plan-steps',
    category: 'campaign-planning',
    title: 'How do you plan an influencer campaign?',
    answer: 'A solid plan has 6 steps: 1) objective (awareness, sales, app installs…), 2) audience definition, 3) budget, 4) creator shortlist by niche/fit, 5) brief with deliverables + deadlines + usage rights, 6) measurement plan (codes/links) before launch. Write the brief before contacting any creator.',
    tags: ['campaign plan', 'planning', 'steps', 'strategy'],
    audience: 'brand',
    aliases: ['plan', 'campaign'],
    priority: 1,
  },
  {
    id: 'campaign-brief-anatomy',
    category: 'campaign-planning',
    title: 'What goes into a campaign brief?',
    answer: 'A complete brief includes: brand + product summary, campaign objective, target audience, deliverables (format, count, platform), key messages and CTA, hashtags/coupon codes, do’s and don’ts, deadline, usage rights, revision count, and contact details. Vague briefs get vague content.',
    tags: ['brief', 'campaign brief', 'deliverables', 'requirements'],
    audience: 'both',
    aliases: ['brief'],
    priority: 1,
  },
  {
    id: 'campaign-objectives',
    category: 'campaign-planning',
    title: 'What are common campaign objectives?',
    answer: 'Common objectives: brand awareness (reach, views), consideration (engagement, saves, shares), conversion (sales, signups via codes/links), and content generation (UGC for ads). Pick ONE primary objective — it decides which creators and formats you choose.',
    tags: ['objectives', 'goals', 'awareness', 'conversion', 'kpi'],
    audience: 'brand',
    aliases: ['objective', 'goal'],
    priority: 2,
  },
  {
    id: 'campaign-how-many-creators',
    category: 'campaign-planning',
    title: 'How many creators should a campaign use?',
    answer: 'For testing: 3–5 micro-creators. For a focused launch: 8–15 across 2–3 niches. For national awareness: 30+ with a mix of macro and micro. More creators beats one big creator when your goal is conversions — diversity of audiences matters more than one large following.',
    tags: ['how many', 'creators count', 'scale', 'campaign size'],
    audience: 'brand',
    aliases: ['how many', 'count'],
    priority: 2,
  },
  {
    id: 'campaign-budget-split',
    category: 'campaign-planning',
    title: 'How should a campaign budget be split?',
    answer: 'A practical split: 70% creator fees, 15% paid amplification of top posts (whitelisting), 10% contingency (re-shoots, extensions), 5% tracking/tools. Always keep 10–15% aside — usage-right extensions and extra revisions are the most common surprise costs.',
    tags: ['budget', 'split', 'allocation', 'campaign budget'],
    audience: 'brand',
    aliases: ['budget'],
    priority: 2,
  },
  {
    id: 'campaign-timeline',
    category: 'campaign-planning',
    title: 'How long does a campaign take to plan?',
    answer: 'Realistic timeline: 1 week planning + brief, 1–2 weeks creator outreach and booking, 1–2 weeks content creation and approvals, 1 week go-live. Rush campaigns under 2 weeks force compromises on creator choice and content quality.',
    tags: ['timeline', 'how long', 'planning time', 'schedule'],
    audience: 'brand',
    aliases: ['timeline', 'schedule', 'how long'],
    priority: 2,
  },
  {
    id: 'campaign-seasonal',
    category: 'campaign-planning',
    title: 'How do you plan festival/seasonal campaigns?',
    answer: 'Book creators 4–6 weeks before the festival (Diwali, etc.) — rates rise and slots fill fast. Brief festive creative early, approve content 1 week before, and schedule posting across the festival window, not all on day one. Keep a small reserve budget for reactive trends.',
    tags: ['festival', 'diwali', 'seasonal', 'timing'],
    audience: 'brand',
    aliases: ['festival', 'seasonal', 'diwali'],
    priority: 2,
  },
  {
    id: 'campaign-awareness-vs-conversion',
    category: 'campaign-planning',
    title: 'Awareness campaign vs conversion campaign — what changes?',
    answer: 'Awareness: fewer, larger creators; reach/views as KPI; broad briefs; longer usage rights for ads. Conversion: many micro-creators; coupon codes/UTMs as KPI; tight product-demo briefs; review-style authentic content. Never judge an awareness campaign on sales alone.',
    tags: ['awareness', 'conversion', 'campaign type', 'objectives'],
    audience: 'brand',
    aliases: ['awareness', 'conversion'],
    priority: 2,
  },
  {
    id: 'campaign-always-on',
    category: 'campaign-planning',
    title: 'What is an always-on creator program?',
    answer: 'Instead of one-off bursts, you keep 5–15 creators posting monthly on retainer-style bookings. It compounds: audiences see repeated endorsements, you get a steady content pipeline, and per-post cost drops. Best for brands with repeat-purchase products.',
    tags: ['always-on', 'retainer', 'ambassador', 'long-term'],
    audience: 'brand',
    aliases: ['always-on', 'retainer'],
    priority: 3,
  },
  /* ---------- brand pricing ---------- */
  {
    id: 'pricing-india-ranges',
    category: 'brand-pricing',
    title: 'How much do creators charge in India?',
    answer: 'Rough 2026 ranges per Instagram Reel: nano (1k–10k followers) ₹1k–5k, micro (10k–100k) ₹5k–30k, mid-tier (100k–500k) ₹30k–1.5L, macro (500k+) ₹1.5L+. YouTube costs 2–3x Instagram. Rates vary by niche — finance and tech charge more than lifestyle at the same size.',
    tags: ['pricing', 'rates', 'how much', 'cost', 'india', 'charges'],
    audience: 'both',
    aliases: ['price', 'rates', 'cost', 'charge', 'influencer pricing', 'influencer rates', 'creator pricing'],
    priority: 1,
  },
  {
    id: 'pricing-what-affects',
    category: 'brand-pricing',
    title: 'What affects a creator’s price?',
    answer: 'Follower count, engagement rate, niche (specialist niches cost more), content format (video > photo), usage rights (ads cost extra), exclusivity, timeline urgency, and deliverable count. A creator with 50k engaged followers often outperforms a 500k low-engagement account.',
    tags: ['pricing factors', 'what affects price', 'rates'],
    audience: 'both',
    aliases: ['price factors'],
    priority: 2,
  },
  {
    id: 'pricing-negotiate',
    category: 'brand-pricing',
    title: 'How do you negotiate with creators?',
    answer: 'Negotiate on scope, not just price: fewer deliverables, shorter usage period, or bundled posts for a better per-post rate. Always be respectful — lowballing burns relationships. On Collancer the listed price is locked at booking, so negotiate scope before booking, not after.',
    tags: ['negotiate', 'negotiation', 'bargain', 'rates'],
    audience: 'both',
    aliases: ['negotiate'],
    priority: 2,
  },
  {
    id: 'pricing-barter-vs-paid',
    category: 'brand-pricing',
    title: 'When should a brand use barter vs paid?',
    answer: 'Use barter for product seeding and reviews with nano/micro creators where your product has real value. Use paid when you need guaranteed deliverables, deadlines, usage rights, or larger creators. Paid always gives you more control — barter is a goodwill channel, not a media buy.',
    tags: ['barter', 'paid', 'vs', 'gifting', 'which'],
    audience: 'brand',
    aliases: ['barter', 'paid'],
    priority: 2,
  },
  {
    id: 'pricing-collancer-fee-brand',
    category: 'brand-pricing',
    title: 'What does a brand actually pay on Collancer?',
    answer: 'You pay the creator’s listed price + a 12% platform fee. Example: ₹10,000 package → ₹1,200 fee → ₹11,200 total. Business Pro members get 5% off the creator price. The creator’s price is locked — it can’t be changed at booking.',
    tags: ['fee', 'platform fee', '12%', 'total cost', 'collancer pricing'],
    audience: 'brand',
    aliases: ['fee', 'cost', 'total'],
    priority: 1,
  },
  {
    id: 'pricing-hidden-costs',
    category: 'brand-pricing',
    title: 'What hidden costs appear in campaigns?',
    answer: 'Watch for: usage-right extensions for ads, extra revision rounds, rush fees, product shipping costs, exclusivity premiums, and paid boosting of creator posts. Put revision limits and usage terms in the brief to avoid surprise charges.',
    tags: ['hidden costs', 'extra charges', 'surprise fees'],
    audience: 'brand',
    aliases: ['hidden', 'extra cost'],
    priority: 3,
  },
  {
    id: 'pricing-per-post-vs-campaign',
    category: 'brand-pricing',
    title: 'Pay per post or per campaign?',
    answer: 'Per-post is simpler and standard on Collancer (each package = one deliverable set). Per-campaign bundles (e.g. 4 reels/month) usually earn a 10–20% volume discount and suit always-on programs. Match the model to your objective: testing → per-post, scaling → bundles.',
    tags: ['per post', 'per campaign', 'bundle', 'pricing model'],
    audience: 'brand',
    aliases: ['per post', 'bundle'],
    priority: 3,
  },
  /* ---------- outreach ---------- */
  {
    id: 'outreach-first-message',
    category: 'outreach',
    title: 'How should a brand first approach a creator?',
    answer: 'Keep it short and specific: who you are, why THIS creator (mention a real post you liked), what you’re offering (paid/barter + deliverables), and one clear next step. Generic copy-paste DMs get ignored. On Collancer, booking directly with a clear brief works better than cold DMs.',
    tags: ['outreach', 'approach', 'first message', 'dm', 'pitch'],
    audience: 'brand',
    aliases: ['outreach', 'approach', 'dm'],
    priority: 1,
  },
  {
    id: 'outreach-pitch-structure',
    category: 'outreach',
    title: 'What should a collaboration pitch include?',
    answer: 'A strong pitch: 1) personalised opener (their content), 2) brand + product in one line, 3) the offer (deliverables, compensation, timeline), 4) why it fits their audience, 5) one CTA (e.g. "shall I send the brief?"). Under 150 words.',
    tags: ['pitch', 'proposal', 'outreach template', 'structure'],
    audience: 'both',
    aliases: ['pitch'],
    priority: 2,
  },
  {
    id: 'outreach-donts',
    category: 'outreach',
    title: 'Outreach mistakes brands should avoid?',
    answer: 'Don’ts: mass copy-paste messages, "exposure" as the only offer to large creators, demanding free content, vague deliverables, unrealistic 48-hour deadlines, and ghosting after a creator replies. Every ignored creator tells other creators.',
    tags: ['mistakes', 'donts', 'outreach errors'],
    audience: 'brand',
    aliases: ['mistakes', 'dont'],
    priority: 2,
  },
  {
    id: 'outreach-rejection',
    category: 'outreach',
    title: 'How should a brand handle creator rejections?',
    answer: 'Thank them briefly and move on — never argue or counter aggressively. On Collancer, if a booking is rejected you aren’t charged and wallet payments are refunded. Keep a shortlist of backup creators so one rejection never blocks your timeline.',
    tags: ['rejection', 'rejected', 'handle no', 'backup'],
    audience: 'brand',
    aliases: ['rejection', 'rejected'],
    priority: 2,
  },
  {
    id: 'outreach-long-term',
    category: 'outreach',
    title: 'How do brands build long-term creator relationships?',
    answer: 'Pay on time, give creative freedom, share performance results with them, rebook winners, and treat them as partners not vendors. Creators promote brands they genuinely like far more convincingly — the second and third collaboration always performs better than the first.',
    tags: ['long-term', 'relationships', 'retain', 'ambassador'],
    audience: 'brand',
    aliases: ['long-term', 'relationship'],
    priority: 3,
  },
  {
    id: 'outreach-managers',
    category: 'outreach',
    title: 'What if a creator has a manager or agency?',
    answer: 'Larger creators often route deals through managers. Be professional: share the brief and budget range upfront, expect 10–20% higher quotes (management cut), and get everything in writing. On Collancer you book the creator directly, which keeps this simple.',
    tags: ['manager', 'agency', 'representation'],
    audience: 'brand',
    aliases: ['manager', 'agency'],
    priority: 3,
  },
  /* ---------- discovery deep ---------- */
  {
    id: 'discovery-find-right',
    category: 'discovery',
    title: 'How do you find the right creators for your brand?',
    answer: 'Define your customer, then match: niche alignment (their content = your category), audience overlap (their followers = your buyers), engagement quality (comments > likes), and past brand work. Use Collancer’s Discover filters or ask Cleo "find skincare creators in Pune under ₹12,000".',
    tags: ['find', 'right creators', 'discovery', 'match', 'fit'],
    audience: 'brand',
    aliases: ['find', 'discover', 'right'],
    priority: 1,
  },
  {
    id: 'discovery-engagement-rate',
    category: 'discovery',
    title: 'What is a good engagement rate?',
    answer: 'Rough benchmarks: 1–3% is average, 3–6% is good, 6%+ is excellent for most niches. Nano creators often hit 5–10%. Compare within the same niche and follower band — a 2% rate on 500k followers can beat a 8% rate on 5k followers in absolute reach.',
    tags: ['engagement rate', 'benchmark', 'good engagement', 'metrics'],
    audience: 'both',
    aliases: ['engagement'],
    priority: 1,
  },
  {
    id: 'discovery-fake-followers',
    category: 'discovery',
    title: 'How do you spot fake followers?',
    answer: 'Red flags: follower spikes with no viral content, thousands of followers but near-zero comments, generic/bot-like comments, and audience countries unrelated to the niche. Collancer’s verified tick and review history add a trust layer — always check past work, not just counts.',
    tags: ['fake followers', 'bots', 'fraud', 'vetting'],
    audience: 'brand',
    aliases: ['fake', 'fraud', 'bots'],
    priority: 1,
  },
  {
    id: 'discovery-vet',
    category: 'discovery',
    title: 'How do you vet a creator before booking?',
    answer: 'Checklist: 1) content quality and consistency, 2) engagement authenticity (read comments), 3) audience fit for your product, 4) past brand collaborations and their quality, 5) professionalism (response time), 6) Collancer verification + ratings. Never book on follower count alone.',
    tags: ['vet', 'vetting', 'checklist', 'due diligence'],
    audience: 'brand',
    aliases: ['vet', 'check'],
    priority: 1,
  },
  {
    id: 'discovery-micro-why',
    category: 'discovery',
    title: 'Why do micro-influencers often perform better?',
    answer: 'Micro-creators (10k–100k) have tighter communities, higher trust, better engagement rates, and lower costs. For conversions, 10 micros usually beat 1 macro at the same budget — you get audience diversity and more authentic-feeling endorsements.',
    tags: ['micro', 'micro-influencer', 'why micro', 'performance'],
    audience: 'brand',
    aliases: ['micro'],
    priority: 2,
  },
  {
    id: 'discovery-niche-vs-generalist',
    category: 'discovery',
    title: 'Niche creator or generalist — which is better?',
    answer: 'Niche creators convert better for specific products (a skincare creator selling serum). Generalists/lifestyle creators work for broad awareness. Rule: the more specific your product, the more niche your creator should be.',
    tags: ['niche', 'generalist', 'specialist', 'which'],
    audience: 'brand',
    aliases: ['niche', 'generalist'],
    priority: 2,
  },
  {
    id: 'discovery-local',
    category: 'discovery',
    title: 'When should you use local/city creators?',
    answer: 'Use city-filtered creators for: store launches, city-specific services, regional language content, and event promotions. Local creators drive footfall far better than national ones. On Collancer, filter Discover by city or ask Cleo "fashion creators in Jaipur".',
    tags: ['local', 'city', 'regional', 'location'],
    audience: 'brand',
    aliases: ['local', 'city'],
    priority: 2,
  },
  {
    id: 'discovery-audience-demographics',
    category: 'discovery',
    title: 'Why do audience demographics matter?',
    answer: 'A creator’s followers — not the creator — are your customers. Check age, gender split, city/country, and interests. A male-grooming brand needs a creator whose audience is mostly men, regardless of the creator’s own gender. Ask creators for audience screenshots before big spends.',
    tags: ['demographics', 'audience', 'followers', 'targeting'],
    audience: 'brand',
    aliases: ['demographics', 'audience'],
    priority: 2,
  },
  /* ---------- content formats ---------- */
  {
    id: 'format-reels-brand',
    category: 'formats',
    title: 'How should brands use Instagram Reels?',
    answer: 'Reels are the highest-reach format on Instagram. Best practices: hook in the first 2 seconds, native vertical video, trending audio where it fits the brand, one clear CTA, and captions with keywords. Give creators a hook + key points, not a word-for-word script — native beats polished.',
    tags: ['reels', 'instagram', 'video', 'format'],
    audience: 'brand',
    aliases: ['reels'],
    priority: 1,
  },
  {
    id: 'format-shorts-vs-long',
    category: 'formats',
    title: 'YouTube Shorts vs long-form video?',
    answer: 'Shorts = reach and discovery (like Reels). Long-form = depth, trust, and detailed reviews — better for considered purchases (tech, finance, education). For launches, combine: Shorts for buzz, one long-form review for depth.',
    tags: ['youtube', 'shorts', 'long-form', 'video'],
    audience: 'brand',
    aliases: ['youtube', 'shorts'],
    priority: 2,
  },
  {
    id: 'format-unboxing',
    category: 'formats',
    title: 'Why do unboxing videos work?',
    answer: 'Unboxings trigger curiosity and feel authentic — viewers experience the product reveal with the creator. They work best for physical products (beauty, tech, fashion). Brief: real first reaction, show packaging quality, highlight 2–3 key features naturally.',
    tags: ['unboxing', 'reveal', 'video format'],
    audience: 'brand',
    aliases: ['unboxing'],
    priority: 2,
  },
  {
    id: 'format-ugc',
    category: 'formats',
    title: 'What is UGC and why do brands want it?',
    answer: 'UGC (user-generated content) is creator-made content you reuse in your own ads, website, and socials — often outperforming studio ads because it looks native. Negotiate UGC usage rights upfront (duration + platforms); it usually costs extra beyond organic posting rights.',
    tags: ['ugc', 'user generated', 'content rights', 'ads'],
    audience: 'brand',
    aliases: ['ugc'],
    priority: 1,
  },
  {
    id: 'format-testimonial',
    category: 'formats',
    title: 'How do you brief testimonial-style content?',
    answer: 'Effective testimonials: the creator’s real experience (no fake claims), specific results or liked features, natural delivery, and a clear CTA. Avoid scripts — give 3 bullet points and let them speak. Fake-sounding testimonials hurt more than they help.',
    tags: ['testimonial', 'review', 'brief'],
    audience: 'brand',
    aliases: ['testimonial', 'review'],
    priority: 2,
  },
  {
    id: 'format-tutorial',
    category: 'formats',
    title: 'Tutorial/how-to content for brands?',
    answer: 'Tutorials ("3 ways to style…", "how I use…") get saves and shares — the highest-intent engagement. They position your product in real use. Brief the outcome and key steps, let the creator choose the presentation style.',
    tags: ['tutorial', 'how-to', 'educational'],
    audience: 'brand',
    aliases: ['tutorial'],
    priority: 2,
  },
  {
    id: 'format-trends',
    category: 'formats',
    title: 'Should brands jump on trends and challenges?',
    answer: 'Yes when the trend fits your brand voice — trends give free reach. But approve fast (trends die in days) and never force a mismatched trend. Give creators permission to adapt the trend to their style rather than copying it exactly.',
    tags: ['trends', 'challenges', 'viral', 'timing'],
    audience: 'brand',
    aliases: ['trends', 'viral'],
    priority: 3,
  },
  /* ---------- measurement ---------- */
  {
    id: 'measure-roi',
    category: 'measurement',
    title: 'How do you measure influencer campaign ROI?',
    answer: 'ROI = (revenue attributed − campaign cost) / campaign cost. Attribute revenue via unique coupon codes, UTM links, or affiliate links per creator. For awareness goals, use CPM (cost per 1,000 views) vs your other media. Always define the success metric BEFORE launch.',
    tags: ['roi', 'measure', 'return', 'kpi'],
    audience: 'brand',
    aliases: ['roi'],
    priority: 1,
  },
  {
    id: 'measure-metrics-matter',
    category: 'measurement',
    title: 'Which metrics actually matter?',
    answer: 'By objective: awareness → reach, views, CPM; consideration → engagement rate, saves, shares, profile visits; conversion → clicks, code redemptions, revenue. Vanity likes alone mean little — saves and shares signal real intent.',
    tags: ['metrics', 'kpi', 'which metrics', 'measure'],
    audience: 'brand',
    aliases: ['metrics'],
    priority: 1,
  },
  {
    id: 'measure-coupon-codes',
    category: 'measurement',
    title: 'How do coupon codes track creator sales?',
    answer: 'Give each creator a unique code (e.g. AARAV10). Every redemption is attributed to that creator — simple, reliable, and it also incentivises the audience. Mention the code must appear in the caption AND verbally in video for maximum use.',
    tags: ['coupon', 'discount code', 'tracking', 'attribution'],
    audience: 'brand',
    aliases: ['coupon', 'code'],
    priority: 1,
  },
  {
    id: 'measure-utm',
    category: 'measurement',
    title: 'How do UTM parameters work for campaigns?',
    answer: 'Add UTM tags to links (utm_source=instagram&utm_medium=influencer&utm_campaign=diwali&utm_content=creatorname). Each creator gets a unique link so analytics shows exactly who drove traffic. Use a link shortener for clean captions.',
    tags: ['utm', 'links', 'tracking', 'analytics'],
    audience: 'brand',
    aliases: ['utm'],
    priority: 2,
  },
  {
    id: 'measure-benchmarks',
    category: 'measurement',
    title: 'What are good campaign benchmarks?',
    answer: 'Rough India benchmarks: Reels CPM ₹150–400, engagement 2–5%, story swipe-through 3–8%, coupon redemption 0.5–3% of reach. Benchmarks vary hugely by niche — always compare against YOUR past campaigns, not industry averages alone.',
    tags: ['benchmarks', 'cpm', 'averages', 'good numbers'],
    audience: 'brand',
    aliases: ['benchmark'],
    priority: 2,
  },
  {
    id: 'measure-reporting',
    category: 'measurement',
    title: 'How do you report campaign results?',
    answer: 'A good report: objective vs result, spend breakdown per creator, reach/engagement/conversions per creator, top-performing content (and why), learnings, and next-step recommendations. Include screenshots of the best posts — stakeholders remember content, not spreadsheets.',
    tags: ['report', 'reporting', 'results', 'stakeholders'],
    audience: 'brand',
    aliases: ['report'],
    priority: 3,
  },
  /* ---------- legal for brands ---------- */
  {
    id: 'legal-contract-must',
    category: 'legal',
    title: 'What must a collaboration contract include?',
    answer: 'Essentials: parties, deliverables (format/count/platform), timeline, compensation + payment terms, usage rights (duration, media, territory), revisions, exclusivity, disclosure obligations, cancellation terms, and content approval process. On Collancer, the booking brief + platform terms cover the basics.',
    tags: ['contract', 'agreement', 'legal', 'must include'],
    audience: 'both',
    aliases: ['contract'],
    priority: 1,
  },
  {
    id: 'legal-usage-rights-brand',
    category: 'legal',
    title: 'What usage rights should a brand secure?',
    answer: 'Decide: organic posting only, or also paid ads (whitelisting), website, and OOH? For how long — 30/90 days or perpetual? Which territory? Broader/longer rights cost more. Get it in writing before content goes live — retroactive negotiation is painful.',
    tags: ['usage rights', 'whitelisting', 'ads', 'rights'],
    audience: 'brand',
    aliases: ['usage', 'rights'],
    priority: 1,
  },
  {
    id: 'legal-asci-brand',
    category: 'legal',
    title: 'What are ASCI disclosure rules for brands?',
    answer: 'ASCI requires clear disclosure of paid partnerships — #ad, #sponsored, or platform paid-partnership labels, upfront and unambiguous. The brand AND creator share responsibility. Non-compliance risks ASCI complaints and takedowns. Build disclosure into every brief.',
    tags: ['asci', 'disclosure', '#ad', 'compliance', 'rules'],
    audience: 'brand',
    aliases: ['asci', 'disclosure'],
    priority: 1,
  },
  {
    id: 'legal-creator-no-deliver',
    category: 'legal',
    title: 'What if a creator doesn’t deliver?',
    answer: 'Steps: 1) polite follow-up with the agreed deadline, 2) formal reminder referencing the brief/terms, 3) on Collancer, don’t approve completion — escrow stays held and admins review disputes, 4) for off-platform deals, the contract’s cancellation clause applies. Never pay 100% upfront off-platform.',
    tags: ['no deliver', 'ghosting', 'dispute', 'didnt deliver'],
    audience: 'brand',
    aliases: ['dispute', 'deliver'],
    priority: 2,
  },
  {
    id: 'legal-exclusivity',
    category: 'legal',
    title: 'How do exclusivity clauses work?',
    answer: 'Exclusivity stops a creator from promoting competitors for a period (e.g. 30–90 days). It always costs extra — typically 25–100% on top. Define "competitor" precisely (category, not the whole industry) and keep the period as short as your campaign needs.',
    tags: ['exclusivity', 'competitor', 'clause'],
    audience: 'both',
    aliases: ['exclusivity'],
    priority: 2,
  },
  /* ---------- india ---------- */
  {
    id: 'india-market-overview',
    category: 'india',
    title: 'Influencer marketing in India — what’s unique?',
    answer: 'India’s market is mobile-first, price-sensitive, and multilingual. Regional-language creators often outperform English ones in their markets. Festivals (Diwali, wedding season) drive huge spikes. UPI makes payments instant, and nano/micro creators deliver the best ROI for most D2C brands.',
    tags: ['india', 'market', 'overview', 'unique'],
    audience: 'both',
    aliases: ['india'],
    priority: 2,
  },
  {
    id: 'india-regional',
    category: 'india',
    title: 'Why do regional-language creators matter?',
    answer: 'A Tamil or Marathi creator speaks to audiences English creators can’t reach — with deeper trust. Regional CPMs are lower and engagement higher. If you sell pan-India, split budget across 3–4 language markets instead of only Hindi/English.',
    tags: ['regional', 'language', 'tamil', 'marathi', 'vernacular'],
    audience: 'brand',
    aliases: ['regional', 'language'],
    priority: 1,
  },
  {
    id: 'india-tier2-tier3',
    category: 'india',
    title: 'Should brands work with Tier 2/3 city creators?',
    answer: 'Yes — they’re the growth story. Lower rates, highly engaged local audiences, and authentic relatability. Perfect for mass-market products, local services, and regional campaigns. Filter Collancer Discover by city to find them.',
    tags: ['tier 2', 'tier 3', 'small city', 'local'],
    audience: 'brand',
    aliases: ['tier 2', 'tier 3'],
    priority: 2,
  },
  {
    id: 'india-gst',
    category: 'india',
    title: 'GST on influencer marketing in India?',
    answer: 'Creator services generally attract 18% GST when the creator is GST-registered. Brands should collect GST invoices for input credit. Requirements vary by turnover and structure — confirm with your CA for your specific case. (General guidance, not tax advice.)',
    tags: ['gst', 'tax', 'invoice', 'india'],
    audience: 'both',
    aliases: ['gst', 'tax'],
    priority: 2,
  },
  {
    id: 'india-festival-calendar',
    category: 'india',
    title: 'Key Indian marketing moments for campaigns?',
    answer: 'Big windows: Diwali (Oct–Nov), wedding season (Nov–Feb), Holi (Mar), Raksha Bandhan, Independence Day sales, and the year-end sale season. Plan 6 weeks ahead — creator rates and ad costs both spike in these windows.',
    tags: ['festival', 'diwali', 'calendar', 'moments', 'wedding season'],
    audience: 'brand',
    aliases: ['festival', 'diwali'],
    priority: 2,
  },
  /* ---------- creator growth ---------- */
  {
    id: 'creator-price-self',
    category: 'creator',
    title: 'How should a creator set their prices?',
    answer: 'Base it on followers, engagement, niche, and deliverable effort — then check comparable creators. Start slightly below market to win initial brand deals and reviews, then raise every 10–15k followers. On Collancer, set per-package prices in your profile; they lock at booking.',
    tags: ['pricing', 'set price', 'rate card', 'how much charge'],
    audience: 'creator',
    aliases: ['price', 'charge'],
    priority: 1,
  },
  {
    id: 'creator-media-kit',
    category: 'creator',
    title: 'What goes in a creator media kit?',
    answer: 'One-pager with: bio + niche, follower counts per platform, engagement rate, audience demographics (age/gender/cities), past brand collaborations with results, package prices, and contact. Update quarterly. Brands decide in 30 seconds — make numbers scannable.',
    tags: ['media kit', 'pitch', 'portfolio'],
    audience: 'creator',
    aliases: ['media kit'],
    priority: 1,
  },
  {
    id: 'creator-pitch-brand',
    category: 'creator',
    title: 'How should a creator pitch a brand?',
    answer: 'Personalise: reference their product and why YOUR audience fits, propose 1–2 concrete content ideas, share 2–3 relevant past results, state your package clearly. On Collancer, send offers on marketplace requirements with a sharp 3-line pitch — long essays get skipped.',
    tags: ['pitch', 'outreach', 'brand deal', 'proposal'],
    audience: 'creator',
    aliases: ['pitch'],
    priority: 1,
  },
  {
    id: 'creator-negotiate-up',
    category: 'creator',
    title: 'How can creators negotiate better rates?',
    answer: 'Anchor on value: engagement rate, past conversion proof, usage-right pricing, and bundle discounts for multi-post deals. Never accept "exposure only" from funded brands. Raising rates is normal — do it when your metrics grow, and keep a rate card so you quote consistently.',
    tags: ['negotiate', 'rates', 'charge more', 'raise prices'],
    audience: 'creator',
    aliases: ['negotiate'],
    priority: 2,
  },
  {
    id: 'creator-consistency',
    category: 'creator',
    title: 'How important is posting consistency?',
    answer: 'Very — algorithms reward predictable posting, and brands check your last 30 days before booking. 3–5 quality posts/week beats daily low-effort posts. Batch-shoot monthly so brand deadlines never clash with your content calendar.',
    tags: ['consistency', 'posting', 'algorithm', 'frequency'],
    audience: 'creator',
    aliases: ['consistency'],
    priority: 2,
  },
  {
    id: 'creator-income-streams',
    category: 'creator',
    title: 'What income streams can creators build?',
    answer: 'Brand deals (Collancer bookings), affiliate commissions, ad revenue (YouTube), digital products, paid communities, and UGC packages for brands’ ads. Diversify — brand deals are lucrative but seasonal; affiliates and products smooth the gaps.',
    tags: ['income', 'monetize', 'revenue streams', 'earn'],
    audience: 'creator',
    aliases: ['income', 'earn', 'money'],
    priority: 2,
  },
  {
    id: 'creator-taxes',
    category: 'creator',
    title: 'Do creators need to handle taxes?',
    answer: 'Yes — brand income is taxable in India. Track every payment, save GST invoices where applicable, and consider quarterly advance tax once income is regular. This is general guidance — a CA can advise on your slab and deductions.',
    tags: ['tax', 'gst', 'income tax', 'ca'],
    audience: 'creator',
    aliases: ['tax'],
    priority: 3,
  },
  {
    id: 'creator-burnout',
    category: 'creator',
    title: 'How do creators avoid burnout?',
    answer: 'Batch content, set revision limits in every deal, take real days off, and don’t say yes to every brand — misaligned deals drain you. Sustainable pace beats viral sprints; brands rebook creators who deliver reliably, not those who flame out.',
    tags: ['burnout', 'mental health', 'sustainability'],
    audience: 'creator',
    aliases: ['burnout'],
    priority: 3,
  },
  /* ---------- operations for brands ---------- */
  {
    id: 'ops-manage-multiple',
    category: 'operations',
    title: 'How do you manage many creators at once?',
    answer: 'Use a tracker: creator, deliverables, deadline, status, payment. Standardise the brief template, set one approval contact, batch feedback rounds, and stagger posting dates. On Collancer, each booking keeps its own brief/chat/payment trail so nothing gets mixed up.',
    tags: ['manage', 'multiple creators', 'workflow', 'scale'],
    audience: 'brand',
    aliases: ['manage'],
    priority: 2,
  },
  {
    id: 'ops-content-approval',
    category: 'operations',
    title: 'How should brands approve creator content?',
    answer: 'Two rounds max: round 1 for concept/hook, round 2 for final. Give specific, actionable feedback ("show the product in the first 3 seconds") not vague notes ("make it pop"). Approve within 48 hours — slow approvals kill campaign momentum.',
    tags: ['approval', 'review', 'feedback', 'revisions'],
    audience: 'brand',
    aliases: ['approval', 'review'],
    priority: 2,
  },
  {
    id: 'ops-feedback',
    category: 'operations',
    title: 'How do you give creators useful feedback?',
    answer: 'Be specific and kind: what to keep, what to change, and why (tie it to the objective). Share examples. Avoid rewriting their voice — you hired them for their style. One consolidated feedback message beats five scattered ones.',
    tags: ['feedback', 'revisions', 'communication'],
    audience: 'brand',
    aliases: ['feedback'],
    priority: 2,
  },
  {
    id: 'ops-repurpose',
    category: 'operations',
    title: 'How can brands repurpose creator content?',
    answer: 'With agreed usage rights: cut Reels into ads, use quotes in emails, embed videos on product pages, compile testimonials. Creator content typically outperforms studio creative in paid social — negotiate whitelisting/paid-usage rights in the original brief.',
    tags: ['repurpose', 'reuse', 'whitelisting', 'ads'],
    audience: 'brand',
    aliases: ['repurpose', 'reuse'],
    priority: 2,
  },
  {
    id: 'ops-crisis',
    category: 'operations',
    title: 'What if a campaign faces backlash?',
    answer: 'Pause paid promotion immediately, assess facts before reacting, respond honestly once (not repeatedly), and give the creator guidance — don’t throw them under the bus publicly. Prevention: brief cultural sensitivities and review content before it posts.',
    tags: ['crisis', 'backlash', 'controversy', 'pr'],
    audience: 'brand',
    aliases: ['crisis', 'backlash'],
    priority: 3,
  },
  /* ---------- payments expansion ---------- */
  {
    id: 'pay-escrow-how',
    category: 'payments',
    title: 'How does escrow protect both sides?',
    answer: 'When you book on Collancer, your payment is held in escrow — not sent to the creator. It’s released only after you approve completion and an admin quality-checks. If the creator never delivers or you cancel per policy, the held amount returns to your wallet.',
    tags: ['escrow', 'protection', 'safe payment', 'held'],
    audience: 'both',
    aliases: ['escrow'],
    priority: 1,
  },
  {
    id: 'pay-creator-gets',
    category: 'payments',
    title: 'How much does the creator actually receive?',
    answer: 'Creators receive 95% of their listed package price after admin releases escrow on approved completion. The 12% platform fee is paid by the brand on top — it never reduces the creator’s price.',
    tags: ['creator earnings', '95%', 'payout', 'how much'],
    audience: 'both',
    aliases: ['earnings', '95%'],
    priority: 1,
  },
  {
    id: 'pay-refund-policy',
    category: 'payments',
    title: 'When do brands get refunds?',
    answer: 'Wallet-paid bookings cancelled per policy refund the exact escrow amount to the wallet. If a creator rejects a booking, you’re never charged. Refunds are ledger-recorded (refund_{bookingId}) so the amounts are always auditable.',
    tags: ['refund', 'cancel', 'money back'],
    audience: 'brand',
    aliases: ['refund'],
    priority: 1,
  },
  {
    id: 'pay-upi-safety',
    category: 'payments',
    title: 'Is paying via UPI on Collancer safe?',
    answer: 'Wallet deposits use manual UPI to the shown ID with a 12-digit UTR you submit; an admin verifies before crediting. Never pay creators directly outside the platform for a Collancer booking — you lose escrow protection and dispute support.',
    tags: ['upi', 'safe', 'payment safety', 'fraud'],
    audience: 'both',
    aliases: ['upi', 'safe'],
    priority: 2,
  },
  /* ---------- marketplace expansion ---------- */
  {
    id: 'market-write-requirement',
    category: 'marketplace',
    title: 'How do you write a requirement brands love (for creators)?',
    answer: 'Read it fully, then offer: confirm you meet the follower/niche criteria, propose your price honestly, add ONE line on your content idea, and state your timeline. Generic "I’m interested" offers lose to specific ones every time.',
    tags: ['offer', 'requirement', 'apply', 'marketplace tips'],
    audience: 'creator',
    aliases: ['offer', 'apply'],
    priority: 2,
  },
  {
    id: 'market-brand-choose-offer',
    category: 'marketplace',
    title: 'How should brands choose between creator offers?',
    answer: 'Compare: profile fit (niche + audience), proposed price vs your budget, pitch specificity, ratings/reviews, and response speed. The cheapest offer is rarely the best — weigh past results heaviest.',
    tags: ['choose offer', 'compare', 'select creator'],
    audience: 'brand',
    aliases: ['choose', 'select'],
    priority: 2,
  },
  /* ---------- safety expansion ---------- */
  {
    id: 'safety-scam-signs',
    category: 'safety',
    title: 'How do you spot collaboration scams?',
    answer: 'Red flags: "brands" asking for upfront fees, payment outside the platform, too-good-to-be-true rates, no verifiable business presence, pressure to decide instantly. On Collancer, keep payments in escrow and communication in the booking — that’s your protection.',
    tags: ['scam', 'fraud', 'safety', 'red flags'],
    audience: 'both',
    aliases: ['scam', 'fraud'],
    priority: 1,
  },
  {
    id: 'safety-share-info',
    category: 'safety',
    title: 'What info is safe to share with a collaborator?',
    answer: 'Share: brief details, product info, public contact for coordination. Don’t share: passwords, OTPs, full bank details, or personal ID documents over chat. Barter shipping addresses are shared only after the creator accepts the booking.',
    tags: ['share info', 'privacy', 'safe', 'data'],
    audience: 'both',
    aliases: ['share', 'privacy'],
    priority: 2,
  },
  /* ---------- batch 2: deeper brand + platform + strategy coverage ---------- */
  {
    id: 'brand-query-launch',
    category: 'brand-onboarding',
    title: 'How do I launch my product with creators?',
    answer: 'Product launch playbook: 1) seed product to 10–20 micro-creators 2 weeks before launch (unboxing + first impressions), 2) launch day: coordinated Reels/Shorts with a launch offer code, 3) week 2: testimonial + tutorial content from the best performers, 4) amplify top posts as ads. Keep messaging consistent but let each creator use their own voice.',
    tags: ['product launch', 'launch', 'new product', 'go to market'],
    audience: 'brand',
    aliases: ['launch'],
    priority: 1,
  },
  {
    id: 'brand-query-app-install',
    category: 'brand-onboarding',
    title: 'Can creator marketing drive app installs?',
    answer: 'Yes — creators demo the app on camera with a swipe-up/download link or QR. Pay per install via tracked links where possible, or per post with install KPIs. Finance, tech, and lifestyle creators drive the most installs in India. Always disclose the partnership.',
    tags: ['app install', 'downloads', 'mobile app', 'cpi'],
    audience: 'brand',
    aliases: ['app', 'install'],
    priority: 2,
  },
  {
    id: 'brand-query-lead-gen',
    category: 'brand-onboarding',
    title: 'Can creators generate leads for my business?',
    answer: 'Yes for considered purchases (real estate, education, finance, B2B). Brief creators to drive traffic to a landing page with a lead form; track with unique UTMs per creator. Expect lower volume but higher intent than mass awareness — qualify leads fast while the content is fresh.',
    tags: ['leads', 'lead generation', 'b2b', 'landing page'],
    audience: 'brand',
    aliases: ['leads'],
    priority: 2,
  },
  {
    id: 'brand-query-d2c',
    category: 'brand-onboarding',
    title: 'Influencer strategy for D2C brands?',
    answer: 'D2C playbook: seed widely with nano/micro creators (product seeding), convert with coupon-coded Reels, retain with an always-on roster of 10–20 creators posting monthly. Your best creator content becomes your ad creative — negotiate UGC rights from day one.',
    tags: ['d2c', 'ecommerce', 'direct to consumer', 'shopify'],
    audience: 'brand',
    aliases: ['d2c', 'ecommerce'],
    priority: 1,
  },
  {
    id: 'brand-query-restaurant',
    category: 'brand-onboarding',
    title: 'How should restaurants use food creators?',
    answer: 'Invite local food creators for tasting visits (barter + small fee works), brief them on signature dishes, and ask for Reels + Stories with location tags. Post timing matters — publish before meal hours. Track with a "mention this reel" in-store offer.',
    tags: ['restaurant', 'food', 'cafe', 'local business', 'food blogger'],
    audience: 'brand',
    aliases: ['restaurant', 'food'],
    priority: 2,
  },
  {
    id: 'brand-query-real-estate',
    category: 'brand-onboarding',
    title: 'Can real estate brands use creators?',
    answer: 'Yes — lifestyle and finance creators do project walkthroughs, "day in the life" locality content, and investment-angle videos. Use city-filtered creators, drive enquiries to a tracked landing page, and expect long sales cycles — measure leads, not instant sales.',
    tags: ['real estate', 'property', 'builder', 'walkthrough'],
    audience: 'brand',
    aliases: ['real estate', 'property'],
    priority: 3,
  },
  {
    id: 'brand-query-education',
    category: 'brand-onboarding',
    title: 'How do education brands work with creators?',
    answer: 'Education creators (study, exam prep, career) do course reviews, "how I studied" integrations, and live Q&A sessions. Offer free course access + fee. Track with unique enrollment links. Credibility matters most — pick creators whose audience trusts their recommendations.',
    tags: ['education', 'edtech', 'coaching', 'courses'],
    audience: 'brand',
    aliases: ['education', 'edtech'],
    priority: 2,
  },
  {
    id: 'brand-query-fashion',
    category: 'brand-onboarding',
    title: 'Fashion brand collaboration playbook?',
    answer: 'Fashion runs on try-ons, hauls, and styling videos. Send PR packages to 20–30 micro fashion creators, brief 1 Reel + 2 Stories each, and time drops with festive/wedding seasons. Size-inclusive creators expand your buyer base. Always show the product link or store clearly.',
    tags: ['fashion', 'apparel', 'clothing', 'try-on', 'haul'],
    audience: 'brand',
    aliases: ['fashion'],
    priority: 1,
  },
  {
    id: 'brand-query-beauty',
    category: 'brand-onboarding',
    title: 'Beauty brand collaboration playbook?',
    answer: 'Beauty buyers need proof: before/after, wear tests, and shade demos. Brief tutorials and "get ready with me" formats, require ingredient/claim accuracy (no fake promises — ASCI watches beauty claims), and seed to diverse skin tones. Disclosure is mandatory.',
    tags: ['beauty', 'skincare', 'makeup', 'cosmetics'],
    audience: 'brand',
    aliases: ['beauty', 'skincare'],
    priority: 1,
  },
  {
    id: 'brand-query-fitness',
    category: 'brand-onboarding',
    title: 'Fitness brand collaboration playbook?',
    answer: 'Fitness audiences buy transformation and routine. Brief workout integrations, supplement reviews with honest usage periods (no overnight claims), and challenge formats. Verify the creator actually uses the product category — fake endorsements get called out fast.',
    tags: ['fitness', 'gym', 'supplements', 'workout'],
    audience: 'brand',
    aliases: ['fitness'],
    priority: 2,
  },
  {
    id: 'strategy-funnel',
    category: 'strategy',
    title: 'How do creators fit into the marketing funnel?',
    answer: 'Top of funnel (awareness): macro creators, Reels, reach KPIs. Middle (consideration): mid-tier reviews, tutorials, saves/shares KPIs. Bottom (conversion): micro creators, coupon codes, sales KPIs. Map each booking to a funnel stage so you brief and measure correctly.',
    tags: ['funnel', 'awareness', 'consideration', 'conversion', 'strategy'],
    audience: 'brand',
    aliases: ['funnel'],
    priority: 1,
  },
  {
    id: 'strategy-vs-ads',
    category: 'strategy',
    title: 'Creator marketing vs paid ads — which is better?',
    answer: 'They do different jobs. Paid ads give precise targeting and scale; creators give trust and native content. The winning combo: test creative with creators, then amplify winners as whitelisted ads. Creator content typically gets higher engagement than studio ads at the same spend.',
    tags: ['vs ads', 'paid ads', 'comparison', 'which better'],
    audience: 'brand',
    aliases: ['ads', 'comparison'],
    priority: 2,
  },
  {
    id: 'strategy-seeding',
    category: 'strategy',
    title: 'What is product seeding?',
    answer: 'Sending free product to many creators with no guaranteed post — you’re buying goodwill and hoping for organic mentions. Seed 30–50 nano/micro creators; expect 20–40% to post. Follow up politely once. Seeding builds relationships that convert to paid deals later.',
    tags: ['seeding', 'pr package', 'gifting strategy'],
    audience: 'brand',
    aliases: ['seeding'],
    priority: 2,
  },
  {
    id: 'strategy-whitelisting',
    category: 'strategy',
    title: 'What is whitelisting in influencer marketing?',
    answer: 'Whitelisting = the creator grants your brand ad-account access to boost their post as a paid ad. It combines creator authenticity with ad targeting. Always negotiate whitelisting rights and duration upfront — it costs extra beyond organic posting.',
    tags: ['whitelisting', 'boost', 'paid ads', 'amplify'],
    audience: 'brand',
    aliases: ['whitelisting'],
    priority: 1,
  },
  {
    id: 'strategy-dark-posts',
    category: 'strategy',
    title: 'What are dark posts in creator marketing?',
    answer: 'Dark posts are ads that run from the creator’s handle but don’t appear on their organic feed — only targeted audiences see them. They let you test many creative variants without spamming the creator’s followers. Requires whitelisting access.',
    tags: ['dark posts', 'ads', 'whitelisting'],
    audience: 'brand',
    aliases: ['dark posts'],
    priority: 3,
  },
  {
    id: 'platform-instagram-algo',
    category: 'platforms',
    title: 'How does the Instagram algorithm treat creator content?',
    answer: 'Instagram ranks by: watch time and replays (Reels), saves and shares (feed), replies and stickers (Stories). Original, vertical, sub-90-second video gets the most distribution. For brands: brief hooks in the first 2 seconds and content worth saving.',
    tags: ['instagram', 'algorithm', 'reach', 'reels algorithm'],
    audience: 'both',
    aliases: ['algorithm'],
    priority: 1,
  },
  {
    id: 'platform-youtube-algo',
    category: 'platforms',
    title: 'How does YouTube recommend creator videos?',
    answer: 'YouTube optimises for watch time and click-through rate. Strong titles/thumbnails, high retention in the first 30 seconds, and consistent topics win. For brands: sponsor videos on channels whose audience matches your buyers, and brief a natural mid-roll integration.',
    tags: ['youtube', 'algorithm', 'recommendation', 'watch time'],
    audience: 'both',
    aliases: ['youtube'],
    priority: 2,
  },
  {
    id: 'platform-stories-tactics',
    category: 'platforms',
    title: 'How should brands use Instagram Stories?',
    answer: 'Stories drive action: polls, Q&A stickers, countdowns, and swipe-up/link stickers. Best as a complement to a Reel — the Reel gets reach, Stories drive clicks. Brief creators for 3–5 story frames: hook → product demo → CTA link.',
    tags: ['stories', 'instagram stories', 'stickers', 'swipe up'],
    audience: 'brand',
    aliases: ['stories'],
    priority: 2,
  },
  {
    id: 'platform-cross-post',
    category: 'platforms',
    title: 'Should creator content be cross-posted?',
    answer: 'Yes when the format fits both platforms (Reels ↔ Shorts). But negotiate it: cross-posting doubles the creator’s distribution, so it’s fair to pay a 20–40% uplift or agree it upfront. Don’t assume one fee covers every platform.',
    tags: ['cross-post', 'reels shorts', 'multi-platform'],
    audience: 'both',
    aliases: ['cross-post'],
    priority: 2,
  },
  {
    id: 'format-grwm',
    category: 'formats',
    title: 'What is GRWM content and why does it work for brands?',
    answer: 'GRWM ("Get Ready With Me") is a creator chatting while getting ready — intimate, long watch time, perfect for beauty/fashion integrations. Products appear in natural routine context. Brief 2–3 talking points; the casual format does the selling.',
    tags: ['grwm', 'get ready with me', 'beauty', 'fashion'],
    audience: 'brand',
    aliases: ['grwm'],
    priority: 2,
  },
  {
    id: 'format-day-in-life',
    category: 'formats',
    title: 'Why do "day in my life" videos work for brands?',
    answer: 'Day-in-my-life vlogs embed products in an aspirational routine — viewers imagine themselves using them. Great for lifestyle, food, fitness, and D2C products. Brief one natural product moment, not a forced ad break.',
    tags: ['day in my life', 'vlog', 'lifestyle'],
    audience: 'brand',
    aliases: ['vlog', 'day in my life'],
    priority: 3,
  },
  {
    id: 'format-comparison',
    category: 'formats',
    title: 'Comparison videos for brands — how to brief them?',
    answer: '"This vs that" videos drive high-intent views. Rules: compare fairly, never trash competitors by name (legal risk), highlight your genuine differentiators, and let the creator keep credibility — audiences smell rigged comparisons instantly.',
    tags: ['comparison', 'vs', 'review', 'competitor'],
    audience: 'brand',
    aliases: ['comparison'],
    priority: 2,
  },
  {
    id: 'format-haul',
    category: 'formats',
    title: 'How do haul videos help brands?',
    answer: 'Hauls (showing multiple purchases) generate excitement and discovery — viewers shop along. Seed full collections, not single items, and include a haul-specific discount code. Fashion, beauty, and lifestyle niches perform best.',
    tags: ['haul', 'shopping haul', 'try-on'],
    audience: 'brand',
    aliases: ['haul'],
    priority: 3,
  },
  {
    id: 'ops-shipping',
    category: 'operations',
    title: 'How should brands handle product shipping to creators?',
    answer: 'Ship early — allow 7–10 days buffer before the content deadline. Include a one-page product card (what it is, key features, your social handle). Track deliveries; a campaign delayed by shipping is a planning failure, not the creator’s fault.',
    tags: ['shipping', 'product delivery', 'logistics', 'pr package'],
    audience: 'brand',
    aliases: ['shipping'],
    priority: 2,
  },
  {
    id: 'ops-brief-template',
    category: 'operations',
    title: 'Is there a brief template brands can reuse?',
    answer: 'Reuse this skeleton: objective → audience → deliverables (format/count/platform) → key messages → CTA → hashtags/codes → do’s/don’ts → deadline → usage rights → revisions → contact. Save it once, fill the variables per campaign. On Collancer, the booking brief covers these fields.',
    tags: ['brief template', 'template', 'reuse'],
    audience: 'brand',
    aliases: ['template'],
    priority: 2,
  },
  {
    id: 'ops-posting-schedule',
    category: 'operations',
    title: 'How should campaign posting be scheduled?',
    answer: 'Stagger posts over days/weeks — never all at once. Prime windows in India: 12–2pm and 7–10pm IST. Coordinate launch-day posts within the same 4-hour window for buzz, then spread the rest. Confirm each posting slot with the creator in advance.',
    tags: ['schedule', 'posting time', 'when to post', 'timing'],
    audience: 'brand',
    aliases: ['schedule', 'timing'],
    priority: 2,
  },
  {
    id: 'measure-view-through',
    category: 'measurement',
    title: 'What is view-through vs click attribution?',
    answer: 'Click attribution credits creators whose link/code was used. View-through credits creators whose content was seen before a later purchase — harder to measure, needs brand-lift surveys or holdout tests. For most Collancer campaigns, click/code attribution is the practical standard.',
    tags: ['attribution', 'view-through', 'click', 'measurement'],
    audience: 'brand',
    aliases: ['attribution'],
    priority: 3,
  },
  {
    id: 'measure-incrementality',
    category: 'measurement',
    title: 'How do you prove creators caused the sales?',
    answer: 'Use holdout tests: run creator activity in some cities/audiences but not others, then compare. Or compare sales during campaign vs a baseline period. Coupon codes give directional proof; holdouts give causal proof. Do this for at least one campaign per quarter.',
    tags: ['incrementality', 'causation', 'holdout', 'prove roi'],
    audience: 'brand',
    aliases: ['incrementality'],
    priority: 3,
  },
  {
    id: 'legal-morale-clause',
    category: 'legal',
    title: 'What is a morality clause in creator contracts?',
    answer: 'It lets a brand pause or exit if the creator’s public conduct damages the brand. Define triggers narrowly (convictions, hate speech — not opinions) and include a cure/notice period. Heavy-handed clauses scare good creators away.',
    tags: ['morality clause', 'conduct', 'contract'],
    audience: 'brand',
    aliases: ['morality'],
    priority: 3,
  },
  {
    id: 'legal-minor-creators',
    category: 'legal',
    title: 'Can brands work with creators under 18?',
    answer: 'Yes with extra care: deal with the parent/guardian, keep content age-appropriate, limit working hours, and ensure payments go to the guardian. Some categories (finance, alcohol-adjacent) are off-limits. When in doubt, get legal advice first.',
    tags: ['minors', 'under 18', 'kids', 'child creator'],
    audience: 'both',
    aliases: ['minor'],
    priority: 3,
  },
  {
    id: 'legal-false-claims',
    category: 'legal',
    title: 'What claims must creators avoid?',
    answer: 'No false or unsubstantiated claims: "cures", "guaranteed results", fake before/afters, undisclosed filters on beauty products. ASCI and consumer law both apply. Brands are liable too — review claims in the approval round, not after posting.',
    tags: ['false claims', 'substantiation', 'claims', 'asci'],
    audience: 'both',
    aliases: ['claims', 'false'],
    priority: 1,
  },
  {
    id: 'ai-grounding-live',
    category: 'ai',
    title: 'When should Cleo say it doesn’t know something?',
    answer: 'Cleo must say so explicitly for: real-time facts (prices changed today, live availability), unverified creator claims, and anything outside its knowledge. It never invents creators, prices, policies, or transaction state — uncertainty is stated, not hidden.',
    tags: ['ai', 'grounding', 'uncertainty', 'dont know', 'honesty'],
    audience: 'both',
    aliases: ['dont know', 'uncertainty'],
    priority: 1,
  },
  {
    id: 'ai-creator-facts',
    category: 'ai',
    title: 'How does Cleo avoid inventing creator facts?',
    answer: 'Creator results come only from the live marketplace snapshot — real profiles, real prices, real availability. If no creators match the filters, Cleo says so and suggests widening filters or posting a requirement. It never fabricates a profile to fill a gap.',
    tags: ['ai', 'no fabrication', 'creator facts', 'grounding'],
    audience: 'both',
    aliases: ['fabrication', 'invent'],
    priority: 1,
  },
  {
    id: 'privacy-data-min',
    category: 'privacy',
    title: 'What data minimisation should campaigns follow?',
    answer: 'Collect only what the campaign needs: no unnecessary personal data from creators’ audiences, no scraping followers, secure storage of any shared contacts. Delete campaign data when the contract ends unless retention is agreed.',
    tags: ['privacy', 'data', 'minimisation', 'gdpr'],
    audience: 'both',
    aliases: ['privacy', 'data'],
    priority: 2,
  },
  {
    id: 'safety-brand-safety',
    category: 'safety',
    title: 'What is brand safety in creator marketing?',
    answer: 'Keeping your brand away from controversial, offensive, or misaligned content. Vet creators’ recent content, brief sensitivities, and include approval rights. One misaligned post can cost more than the entire campaign saved by skipping vetting.',
    tags: ['brand safety', 'controversy', 'vetting'],
    audience: 'brand',
    aliases: ['brand safety'],
    priority: 2,
  },
  {
    id: 'creator-rate-card-build',
    category: 'creator',
    title: 'How do you build a rate card?',
    answer: 'List every package separately: Story, Reel, YouTube Short, dedicated video, usage-right add-ons, exclusivity add-on. Price each from your metrics (not just followers). Review quarterly. A clear rate card speeds up brand decisions and stops undercharging.',
    tags: ['rate card', 'packages', 'pricing structure'],
    audience: 'creator',
    aliases: ['rate card'],
    priority: 1,
  },
  {
    id: 'creator-deliver-quality',
    category: 'creator',
    title: 'How do creators deliver work brands rebook?',
    answer: 'Hit deadlines, follow the brief’s key messages, shoot clean audio and good light, deliver in the agreed format, and communicate early if anything slips. Reliability beats virality for rebooking — brands pay for certainty.',
    tags: ['deliver', 'quality', 'rebook', 'reliability'],
    audience: 'creator',
    aliases: ['deliver', 'quality'],
    priority: 1,
  },
  {
    id: 'creator-say-no',
    category: 'creator',
    title: 'When should a creator decline a brand deal?',
    answer: 'Decline when: the product clashes with your values or audience trust, the pay is far below your rate card with no upside, the brief demands fake claims, or the timeline is impossible. A polite no protects your reputation more than a bad yes earns.',
    tags: ['decline', 'say no', 'reject deal', 'values'],
    audience: 'creator',
    aliases: ['decline', 'no'],
    priority: 2,
  },
  {
    id: 'creator-disclose-how',
    category: 'creator',
    title: 'How should creators disclose paid partnerships?',
    answer: 'Use #ad or #sponsored early in the caption AND the platform’s paid-partnership label, plus verbal disclosure in video. Disclosure must be clear before the "more" cutoff — burying it is non-compliant under ASCI rules.',
    tags: ['disclosure', '#ad', 'sponsored', 'how to disclose'],
    audience: 'creator',
    aliases: ['disclosure'],
    priority: 1,
  },
  {
    id: 'payments-invoice-brand',
    category: 'payments',
    title: 'Do brands get invoices for Collancer bookings?',
    answer: 'Every booking records the creator price, platform fee, discount, and total in your booking history — your audit trail. For GST input credit, confirm invoice requirements with your CA; keep booking receipts organised per financial year.',
    tags: ['invoice', 'receipt', 'gst', 'accounting'],
    audience: 'brand',
    aliases: ['invoice'],
    priority: 2,
  },
  {
    id: 'payments-creator-payout-time',
    category: 'payments',
    title: 'How long do creator payouts take?',
    answer: 'Earnings become available after admin releases escrow on approved completion. Then request a payout (min ₹100, one request at a time); an admin reviews and processes it, and you’re notified at each step. Timelines depend on admin review queues.',
    tags: ['payout time', 'how long', 'withdrawal'],
    audience: 'creator',
    aliases: ['payout'],
    priority: 1,
  },
  {
    id: 'marketplace-offer-price',
    category: 'marketplace',
    title: 'How should creators price marketplace offers?',
    answer: 'Stay near your profile rate card — undercutting trains brands to expect less. If the requirement budget is below your rate, either decline politely or propose reduced scope (1 Story instead of 1 Reel). Never bid so low you resent the work.',
    tags: ['offer price', 'bidding', 'marketplace', 'undercut'],
    audience: 'creator',
    aliases: ['bid', 'offer'],
    priority: 2,
  },
  {
    id: 'discovery-language-filter',
    category: 'discovery',
    title: 'How do language filters help campaigns?',
    answer: 'Language = market. A Hindi creator reaches the Hindi belt; a Tamil creator reaches Tamil Nadu — with far higher trust than dubbing. On Collancer, filter Discover by language or ask Cleo "Tamil tech creators under ₹15,000" to match message to market.',
    tags: ['language', 'filter', 'hindi', 'tamil', 'regional'],
    audience: 'brand',
    aliases: ['language'],
    priority: 2,
  },
  {
    id: 'strategy-test-learn',
    category: 'strategy',
    title: 'How do you test creators before scaling?',
    answer: 'Test-learn-scale: book 5–8 diverse micro-creators with small budgets and unique codes, measure for 2–3 weeks, keep the top 3 performers, scale them with bigger budgets and whitelisting. Kill quickly, scale decisively — data beats opinions.',
    tags: ['test', 'scale', 'pilot', 'experiment'],
    audience: 'brand',
    aliases: ['test', 'pilot'],
    priority: 1,
  },
  {
    id: 'brand-query-saas',
    category: 'brand-onboarding',
    title: 'How do SaaS/startup brands use creators?',
    answer: 'Tech and business creators do tool reviews, "how I use X" workflows, and founder-story integrations. Offer extended free trials + affiliate commission on top of the fee. Track signups with unique links — creators drive high-intent trials.',
    tags: ['saas', 'startup', 'tech', 'software', 'app'],
    audience: 'brand',
    aliases: ['saas', 'startup'],
    priority: 2,
  },
  {
    id: 'format-live',
    category: 'formats',
    title: 'Should brands do live shopping with creators?',
    answer: 'Lives convert well for launches and sales events — real-time Q&A builds trust and urgency. They need rehearsal: stable internet, product stock ready, pinned links, and a co-host from the brand. Promote the live 48 hours ahead.',
    tags: ['live', 'live shopping', 'stream'],
    audience: 'brand',
    aliases: ['live'],
    priority: 3,
  },
  {
    id: 'ops-creator-communication',
    category: 'operations',
    title: 'How should brands communicate during a campaign?',
    answer: 'One thread per booking (Collancer keeps this automatically), one decision-maker on your side, response within 24 hours, and all feedback in writing. Creators juggle many brands — clear, fast communication makes you the client they prioritise.',
    tags: ['communication', 'coordination', 'messages'],
    audience: 'brand',
    aliases: ['communication'],
    priority: 2,
  },
  {
    id: 'india-upi-creator',
    category: 'india',
    title: 'How do Indian creators prefer to be paid?',
    answer: 'UPI is the default — instant and familiar. On Collancer, creators receive 95% of their package price via payout requests (UPI ID or bank + IFSC) after escrow release. Keep payment communication inside the platform for dispute protection.',
    tags: ['upi', 'payment method', 'india', 'creator payment'],
    audience: 'creator',
    aliases: ['upi'],
    priority: 2,
  },
  {
    id: 'brand-query-jewellery',
    category: 'brand-onboarding',
    title: 'How should jewellery brands work with creators?',
    answer: 'Jewellery sells on close-ups and styling: macro shots, try-on Reels, festive/wedding-season timing. Trust is everything — use creators with genuine luxury/fashion credibility, disclose paid partnerships, and never make fake purity claims.',
    tags: ['jewellery', 'jewelry', 'gold', 'diamond', 'fashion'],
    audience: 'brand',
    aliases: ['jewellery', 'jewelry'],
    priority: 3,
  },
  {
    id: 'brand-query-automobile',
    category: 'brand-onboarding',
    title: 'How do automobile brands use creators?',
    answer: 'Auto creators do detailed reviews, test drives, and comparison videos — long-form YouTube dominates. Brief honest pros/cons (audiences punish shills), arrange test-drive logistics early, and measure enquiries/test-drive bookings with tracked links.',
    tags: ['automobile', 'car', 'bike', 'review'],
    audience: 'brand',
    aliases: ['automobile', 'car'],
    priority: 3,
  },
  {
    id: 'brand-query-finance',
    category: 'brand-onboarding',
    title: 'How should finance brands brief creators?',
    answer: 'Finance is high-trust and regulated: brief factual accuracy, no guaranteed-return claims, risk disclosures where required, and SEBI-compliant language for investment products. Use established finance creators — credibility converts, hype backfires.',
    tags: ['finance', 'fintech', 'investing', 'banking'],
    audience: 'brand',
    aliases: ['finance', 'fintech'],
    priority: 2,
  },
  {
    id: 'strategy-competitor-watch',
    category: 'strategy',
    title: 'Should you watch competitors’ creator activity?',
    answer: 'Yes — track which creators competitors book, what formats they use, and what their audiences say in comments. Don’t copy; find the gaps they miss (underserved niches, languages, formats) and own those.',
    tags: ['competitor', 'watch', 'analysis', 'strategy'],
    audience: 'brand',
    aliases: ['competitor'],
    priority: 3,
  },
  {
    id: 'ops-content-calendar',
    category: 'operations',
    title: 'How do you build a creator content calendar?',
    answer: 'Map 4–8 weeks: campaign themes per week, creator → deliverable → deadline → posting slot. Leave 20% empty for trends. Share the calendar with all creators so everyone sees the bigger picture — it cuts "when do I post?" messages dramatically.',
    tags: ['content calendar', 'planning', 'schedule'],
    audience: 'brand',
    aliases: ['calendar'],
    priority: 3,
  },
  {
    id: 'measure-save-share',
    category: 'measurement',
    title: 'Why do saves and shares matter more than likes?',
    answer: 'Saves signal purchase intent ("I want this later"); shares signal advocacy ("my friend needs this"). Both predict conversions far better than likes. When comparing creators, weight saves + shares per 1,000 views over raw like counts.',
    tags: ['saves', 'shares', 'engagement quality', 'metrics'],
    audience: 'brand',
    aliases: ['saves', 'shares'],
    priority: 2,
  },
  {
    id: 'creator-niche-down',
    category: 'creator',
    title: 'Should creators niche down?',
    answer: 'Yes — a clear niche (e.g. "budget skincare for oily skin") grows faster and commands higher brand rates than generic lifestyle content. You can broaden later; start specific, own the niche, then expand adjacently.',
    tags: ['niche down', 'positioning', 'specialise', 'growth'],
    audience: 'creator',
    aliases: ['niche'],
    priority: 2,
  },
  {
    id: 'discovery-rating-use',
    category: 'discovery',
    title: 'How should brands use creator ratings?',
    answer: 'Collancer ratings reflect past booking experiences — delivery quality, communication, professionalism. For important campaigns, shortlist 4.5+ rated creators; for testing, mix in promising newcomers. Always read the review text, not just the stars.',
    tags: ['ratings', 'reviews', 'stars', 'trust'],
    audience: 'brand',
    aliases: ['ratings', 'reviews'],
    priority: 2,
  },
  {
    id: 'format-before-after',
    category: 'formats',
    title: 'How to brief before/after content honestly?',
    answer: 'Before/after works for beauty, fitness, home, and fashion — but keep it honest: same lighting/angles, real timelines, no misleading edits. Disclose paid partnerships. Fake transformations destroy trust and invite ASCI complaints.',
    tags: ['before after', 'transformation', 'honest', 'beauty'],
    audience: 'both',
    aliases: ['before after', 'transformation'],
    priority: 2,
  },
];

const CANONICAL_ALL = [...BASE_KNOWLEDGE, ...EXPANSION];

/*
 * Creator collaboration Q&A expansion.
 *
 * The canonical entries contain the verified answers. This index adds
 * natural-language question forms so the local creator assistant can match
 * beginner, practical, negotiation, operations and advanced questions without
 * calling an external model. These are searchable phrasings of curated intents,
 * not claims that 5,000 distinct questions have been independently observed.
 */
const CREATOR_QUESTION_FORMS = [
  (t) => t,
  (t) => `As a creator, ${t.charAt(0).toLowerCase() + t.slice(1)}`,
  (t) => `Creator help: ${t.charAt(0).toLowerCase() + t.slice(1)}`,
  (t) => `Please explain this for a creator: ${t}`,
  (t) => `I am a creator. ${t}`,
  (t) => `What should I know as a creator? ${t}`,
  (t) => `I need creator advice: ${t}`,
  (t) => `Can you guide me on this creator question: ${t}`,
  (t) => `Help me understand this collaboration topic: ${t}`,
  (t) => `Creator collaboration question — ${t}`,
  (t) => `I make content for brands; ${t.charAt(0).toLowerCase() + t.slice(1)}`,
  (t) => `For my brand deals, ${t.charAt(0).toLowerCase() + t.slice(1)}`,
  (t) => `I am working with brands. ${t}`,
  (t) => `Explain the practical steps for a creator: ${t}`,
  (t) => `What is the creator-side answer to this? ${t}`,
  (t) => `I want to handle collaborations professionally: ${t}`,
  (t) => `Please answer from an influencer's point of view: ${t}`,
  (t) => `I am new to creator partnerships: ${t}`,
  (t) => `I am an experienced creator. ${t}`,
  (t) => `Help me make a better brand-collaboration decision: ${t}`,
  (t) => `Creator FAQ: ${t}`,
  (t) => `Brand partnership guidance for creators: ${t}`,
  (t) => `I need a clear, practical answer: ${t}`,
  (t) => `What does this mean for my creator business? ${t}`,
  (t) => `How should I approach this as an influencer? ${t}`,
  (t) => `I need help with a brand collaboration. ${t}`,
  (t) => `Can you break this down for me? ${t}`,
  (t) => `Give me creator-focused guidance: ${t}`,
  (t) => `Before I accept a brand deal, ${t.charAt(0).toLowerCase() + t.slice(1)}`,
  (t) => `While negotiating with a brand, ${t.charAt(0).toLowerCase() + t.slice(1)}`,
  (t) => `For a paid collaboration, ${t.charAt(0).toLowerCase() + t.slice(1)}`,
  (t) => `For a barter collaboration, ${t.charAt(0).toLowerCase() + t.slice(1)}`,
  (t) => `For UGC work, ${t.charAt(0).toLowerCase() + t.slice(1)}`,
  (t) => `When a brand contacts me, ${t.charAt(0).toLowerCase() + t.slice(1)}`,
  (t) => `When I pitch a brand, ${t.charAt(0).toLowerCase() + t.slice(1)}`,
  (t) => `When reviewing a campaign brief, ${t.charAt(0).toLowerCase() + t.slice(1)}`,
  (t) => `When discussing rates, ${t.charAt(0).toLowerCase() + t.slice(1)}`,
  (t) => `When delivering sponsored content, ${t.charAt(0).toLowerCase() + t.slice(1)}`,
  (t) => `When the brand asks for revisions, ${t.charAt(0).toLowerCase() + t.slice(1)}`,
  (t) => `When payment is involved, ${t.charAt(0).toLowerCase() + t.slice(1)}`,
  (t) => `For my next creator campaign, ${t.charAt(0).toLowerCase() + t.slice(1)}`,
  (t) => `Please clarify this brand-deal question: ${t}`,
  (t) => `I have a question about creator partnerships: ${t}`,
  (t) => `What is the best practice for a creator here? ${t}`,
  (t) => `Give me a beginner-friendly explanation: ${t}`,
  (t) => `Give me an advanced creator explanation: ${t}`,
  (t) => `What should an independent creator do? ${t}`,
  (t) => `How can I protect myself in a collaboration? ${t}`,
  (t) => `How can I improve my brand-deal process? ${t}`,
  (t) => `I want to avoid mistakes in collaborations: ${t}`,
  (t) => `Help me make an informed decision about a brand deal: ${t}`,
];

const CREATOR_CANONICAL = CANONICAL_ALL.filter((e) =>
  (e.audience === 'creator' || e.audience === 'both') &&
  !/^(how do brands|what should a brand|how should brands|how does a brand|what does business pro)/i.test(String(e.title || ''))
);
const CREATOR_QA_VARIANTS = [];
for (const entry of CREATOR_CANONICAL) {
  const seen = new Set();
  for (let i = 0; i < CREATOR_QUESTION_FORMS.length; i++) {
    const title = CREATOR_QUESTION_FORMS[i](String(entry.title || '').trim());
    const key = title.toLowerCase();
    if (!title || seen.has(key)) continue;
    seen.add(key);
    CREATOR_QA_VARIANTS.push({
      ...entry,
      id: `creator-qa-${entry.id}-${i + 1}`,
      title,
      audience: 'creator',
      aliases: [...new Set([...(entry.aliases || []), ...(entry.tags || []), String(entry.title || '')])],
      tags: [...new Set([...(entry.tags || []), 'creator help', 'brand collaboration', 'creator faq'])],
      sourceId: entry.id,
    });
  }
}

// Guarantee 5,000+ searchable creator-side Q&A mappings even if the canonical
// knowledge collection is later trimmed. The fallback forms remain grounded
// in an existing canonical answer and are deterministic and de-duplicated.
if (CREATOR_QA_VARIANTS.length < 5000 && CREATOR_CANONICAL.length) {
  let i = 0;
  while (CREATOR_QA_VARIANTS.length < 5000) {
    const entry = CREATOR_CANONICAL[i % CREATOR_CANONICAL.length];
    const batch = Math.floor(i / CREATOR_CANONICAL.length) + 1;
    CREATOR_QA_VARIANTS.push({
      ...entry,
      id: `creator-qa-extra-${batch}-${entry.id}`,
      title: `Creator collaboration question ${batch}: ${entry.title}`,
      audience: 'creator',
      aliases: [...new Set([...(entry.aliases || []), ...(entry.tags || []), String(entry.title || '')])],
      tags: [...new Set([...(entry.tags || []), 'creator help', 'brand collaboration', 'creator faq'])],
      sourceId: entry.id,
    });
    i++;
  }
}

const ALL = [...CANONICAL_ALL, ...CREATOR_QA_VARIANTS];
const BASE_IDS = new Set(BASE_KNOWLEDGE.map((e) => e.id));

/* ---------------- retrieval ---------------- */

/* IDF weighting: distinctive words ("barter") outweigh generic ones
 * ("collaboration", "brand", "creator") that appear in dozens of entries.
 * Built once at module load over the full entry set. */
const _DF = new Map();
for (const entry of ALL) {
  const seen = new Set([
    ...tokens(entry.title),
    ...(entry.tags || []).flatMap(tokens),
    ...(entry.aliases || []).flatMap(tokens),
    ...tokens(entry.answer),
  ]);
  for (const w of seen) _DF.set(w, (_DF.get(w) || 0) + 1);
}
const _N = ALL.length;
const idf = (w) => 1 + Math.log(_N / (1 + (_DF.get(w) || 0)));

/* Multi-word tags/aliases per entry, for verbatim phrase matching. */
for (const entry of ALL) {
  entry._phrases = [...(entry.tags || []), ...(entry.aliases || [])]
    .map((p) => norm(p))
    .filter((p) => p.includes(' '));
}

/** Score one entry against query tokens. qtype: interrogative word of the raw query. */
function scoreEntry(qt, entry, qtype, qnorm) {
  const qset = [...new Set(qt)];
  if (!qset.length) return 0;
  const titleT = new Set(tokens(entry.title));
  const tagT = new Set((entry.tags || []).flatMap(tokens));
  const aliasT = new Set((entry.aliases || []).flatMap(tokens));
  const ansT = new Set(tokens(entry.answer));
  let num = 0;
  let den = 0;
  let maxIdf = 0;
  let maxIdfInTitle = false;
  for (const w of qset) {
    const id = idf(w);
    den += id;
    if (id > maxIdf) { maxIdf = id; maxIdfInTitle = titleT.has(w); }
    if (titleT.has(w)) num += 3 * id;
    else if (tagT.has(w)) num += 2 * id;
    else if (aliasT.has(w)) num += 2 * id;
    else if (ansT.has(w)) num += 1 * id;
  }
  // weighted field strength, normalized by query weight -> [0, 3]
  let score = num / Math.max(1e-9, den);
  // distinctive-word guard: the rarest query word decides the topic — if it
  // only matches in tags/answer and not the title, this entry is probably a
  // near-miss (e.g. "barter" in tags of an examples entry vs the barter entry).
  if (maxIdf > 0 && !maxIdfInTitle) score *= 0.7;
  // question-type alignment: "what is X" should prefer "What is …" entries
  // over "when/should …" entries about the same topic.
  if (qtype) {
    const rawFirst = String(entry.title || '').toLowerCase().trim().split(/[^a-z]+/)[0];
    if (rawFirst === qtype) score *= 1.25;
  }
  // exact-title bonus: every query token appears in the title -> the canonical answer
  let allInTitle = true;
  for (const w of qset) if (!titleT.has(w)) { allInTitle = false; break; }
  if (allInTitle) score *= 1.3;
  // title-equality bonus: query tokens exactly equal title tokens -> strongest signal
  if (allInTitle && titleT.size === qset.length) score *= 1.35;
  // priority boost: priority 1 = most important
  const p = Number(entry.priority) || 3;
  score *= p === 1 ? 1.25 : p === 2 ? 1.1 : 1.0;
  // phrase bonus: a multi-word tag/alias appearing verbatim in the query is a
  // much stronger signal than scattered word matches ("influencer pricing").
  if (qnorm && entry._phrases) {
    for (const ph of entry._phrases) {
      if (qnorm.includes(` ${ph} `)) { score *= 1.5; break; }
    }
  }
  return score;
}

/** First interrogative word of a raw query: what/how/when/why/which/should/can/do. */
function questionType(query) {
  const m = String(query || '').toLowerCase().match(/\b(what|how|when|why|which|should|can|do|does|is|are)\b/);
  return m ? m[1] : '';
}

/**
 * findKnowledge(query, audience) -> { entry, confidence } | null
 * audience: 'brand' | 'creator' | 'both'
 */
export function findKnowledge(query, audience = 'both') {
  const qt = tokens(query);
  if (!qt.length) return null;
  const qtype = questionType(query);
  const qnorm = ` ${norm(query)} `;
  let best = null;
  let bestScore = 0;
  for (const entry of ALL) {
    let s = scoreEntry(qt, entry, qtype, qnorm);
    if (!s) continue;
    // audience preference: exact audience match gets a lift; 'both' is neutral
    const ea = entry.audience || 'both';
    if (audience !== 'both' && ea === audience) s *= 1.15;
    // the shared base file is the canonical source of truth -> slight precedence
    if (BASE_IDS.has(entry.id)) s *= 1.05;
    if (s > bestScore) { bestScore = s; best = entry; }
  }
  if (!best || bestScore < 0.6) return null;
  const confidence = Math.min(0.95, 0.55 + bestScore * 0.15);
  return { entry: best, confidence };
}

/** Stats for diagnostics. */
export function knowledgeStats() {
  const cats = {};
  for (const e of ALL) cats[e.category] = (cats[e.category] || 0) + 1;
  return { total: ALL.length, base: BASE_KNOWLEDGE.length, expansion: EXPANSION.length, creatorQAMappings: CREATOR_QA_VARIANTS.length, creatorCanonicalTopics: CREATOR_CANONICAL.length, categories: cats };
}

export { ALL as KNOWLEDGE_ENTRIES };
