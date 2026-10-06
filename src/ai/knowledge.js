/* Collancer grounded knowledge: QA entries + help topics.
 * DOM-free. All answers reflect only verified product facts from the audit.
 * Never invent contact details, prices, or policies not listed here.
 */

const wordsOf = (s) => String(s || '').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2);
const STOP = new Set(['what', 'how', 'does', 'the', 'and', 'for', 'with', 'about', 'your', 'you', 'can', 'are', 'this', 'that', 'from', 'have', 'has', 'will', 'when', 'where', 'who', 'why', 'which', 'there', 'their', 'been', 'into', 'than', 'then', 'whats', 'whats', 'is', 'it', 'its', 'of', 'to', 'in', 'on', 'a', 'an', 'do', 'i', 'me', 'my', 'tell', 'say']);

/** Light stemming so "fees" matches "fee", "deposits" matches "deposit". */
function stem(w) {
  if (w.length <= 3) return w;
  if (w.endsWith('ies') && w.length > 5) return w.slice(0, -3) + 'y';
  if (w.endsWith('ing') && w.length > 6) return w.slice(0, -3);
  if (w.endsWith('es') && w.length > 5) return w.slice(0, -2);
  if (w.endsWith('s')) return w.slice(0, -1);
  return w;
}

const tokens = (s) => wordsOf(s).filter((w) => !STOP.has(w)).map(stem);

/* ---------------- QA entries ---------------- */

export const QA_ENTRIES = [
  {
    q: 'What is Collancer?',
    a: 'Collancer is a creator\u2013brand collaboration platform. Businesses discover verified creators and book paid or barter collaborations; creators get bookings, earnings, and growth tools. It is a platform, not an agency.',
    tags: ['collancer', 'about', 'platform', 'what is'],
  },
  {
    q: 'How does booking a creator work for a business?',
    a: 'Open a creator\u2019s profile, choose a promotion package and tap Book. You fill in the campaign brief (deliverables, deadline, platform, contact details) and pay. The booking starts as Pending — the creator must explicitly accept or reject it. Nothing is charged to the creator; your payment is held securely until the work is approved.',
    tags: ['booking', 'book', 'business', 'flow', 'how to book', 'collaboration'],
  },
  {
    q: 'What is the platform fee on bookings?',
    a: 'Collancer adds a 12% platform fee on top of the creator\u2019s package price. The creator\u2019s price itself is locked — a business cannot change it. Example: a \u20B910,000 package costs \u20B910,000 + \u20B91,200 fee = \u20B911,200 total.',
    tags: ['fee', 'platform fee', '12%', 'charges', 'pricing', 'cost'],
  },
  {
    q: 'What discount do Pro businesses get?',
    a: 'Businesses on Collancer Pro get a 5% discount on the creator\u2019s price for every booking. The discount applies to the creator price, on top of which the 12% platform fee is calculated. Example: \u20B910,000 package \u2192 \u20B9500 Pro discount, \u20B91,140 fee, total \u20B910,640.',
    tags: ['pro', 'discount', '5%', 'business pro', 'savings'],
  },
  {
    q: 'What is a barter collaboration?',
    a: 'In a barter booking the collaboration amount is \u20B90 — you offer products instead of money and there is no escrow. Your address is shared with the creator only after the creator accepts the booking.',
    tags: ['barter', 'free', 'product exchange', 'no payment', 'address'],
  },
  {
    q: 'How do wallet deposits work?',
    a: 'Go to the Wallet page and create a deposit request of at least \u20B9100. Pay the shown UPI ID (collancer@upi) from any UPI app, then enter your payer UPI ID and the 12-digit UTR/reference number. An admin verifies the payment externally and credits your wallet — this is a manual process, so crediting can take some time.',
    tags: ['wallet', 'deposit', 'top up', 'upi', 'utr', 'recharge', 'add money'],
  },
  {
    q: 'What UPI ID do I pay for wallet deposits?',
    a: 'Pay to collancer@upi from your UPI app, then submit the deposit request in the Wallet page with your payer UPI ID and the 12-digit UTR. The admin credits your wallet only after verifying the payment.',
    tags: ['upi id', 'deposit', 'wallet', 'pay to', 'collancer@upi'],
  },
  {
    q: 'Is my booking payment held safely? What is escrow?',
    a: 'Yes. When you pay for a booking, the amount is held in escrow — it is not released to the creator immediately. Only an admin can release the escrow after the collaboration is completed and approved. Creators cannot withdraw your payment before that.',
    tags: ['escrow', 'safe', 'payment protection', 'held', 'release'],
  },
  {
    q: 'Who releases the payment to the creator?',
    a: 'Only a Collancer admin releases escrow. When the work is done, the creator submits the delivery, you request completion, and the admin reviews and releases the payment. The release is recorded in the admin revenue ledger.',
    tags: ['release', 'admin', 'escrow', 'payment release', 'completion'],
  },
  {
    q: 'How much does a creator earn from a booking?',
    a: 'Creators earn 95% of the creator package price. The 12% platform fee paid by the business goes to Collancer. Example: a \u20B910,000 package \u2192 the creator earns \u20B99,500 after admin release.',
    tags: ['creator', 'earnings', 'share', '95%', 'payout amount', 'how much'],
  },
  {
    q: 'How do creator payouts work?',
    a: 'Creators request a payout from the Earnings page. The minimum payout is \u20B9100 and only one pending or approved request is allowed at a time. You can withdraw via UPI or bank transfer (account number + IFSC). An admin reviews and processes the payout.',
    tags: ['payout', 'withdraw', 'earnings', 'creator', 'upi', 'bank', 'minimum'],
  },
  {
    q: 'What is the minimum payout amount?',
    a: 'The minimum payout for creators is \u20B9100.',
    tags: ['minimum payout', 'withdraw limit', '100'],
  },
  {
    q: 'How do I get verified as a creator?',
    a: 'Open the verification section in your creator app and submit your profile details: platform, followers, profile URL, niche, and city. An admin reviews the request and marks it verified or rejected with a reason. You can resubmit after a rejection.',
    tags: ['verification', 'verified', 'creator', 'badge', 'approve'],
  },
  {
    q: 'How do I appear in business discovery (added to Collancer)?',
    a: 'Complete your profile — including at least 10,000 followers and at least one package price — and get verified. Businesses only see creators who are added to Collancer, not banned, and have no active booking.',
    tags: ['discovery', 'added to collancer', 'visible', 'marketplace visibility', 'appear'],
  },
  {
    q: 'What is Be On Top?',
    a: 'Be On Top is paid profile promotion for creators. Your profile gets boosted placement in business discovery for the plan duration. Plans: 1 day \u20B9249, 2 days \u20B9449, 3 days \u20B9649, 4 days \u20B9799, 5 days \u20B9999, 6 days \u20B91,199, 7 days \u20B91,399. Boosts can be category-specific.',
    tags: ['be on top', 'boost', 'promote profile', 'advertising', 'ad plans'],
  },
  {
    q: 'What are the business Pro plans?',
    a: 'Collancer Pro for businesses: Monthly \u20B9799, 6 Months \u20B93,894 (save 19%), Annual \u20B95,988 (best value). Pro gives a 5% discount on every creator booking. Pro status is checked live and revoked automatically on expiry.',
    tags: ['business pro', 'pro plans', 'subscription', '799', 'pricing'],
  },
  {
    q: 'What are the creator Pro plans?',
    a: 'Collancer Pro for creators: Monthly \u20B9599, Quarterly \u20B91,499 (save 17%), Yearly \u20B94,999 (best value). Check the Creator Pro page in the app for the current benefits.',
    tags: ['creator pro', 'pro plans', 'subscription', '599', 'pricing'],
  },
  {
    q: 'What is the Requirements Marketplace?',
    a: 'Businesses post open requirements (brief, budget, niche, deliverables) and creators apply with offers. The business accepts one offer, which creates a booking. If the accepted creator rejects the booking, the requirement can be reopened.',
    tags: ['requirements', 'marketplace', 'brief', 'offers', 'apply', 'post requirement'],
  },
  {
    q: 'How do I post a requirement as a business?',
    a: 'Go to the Marketplace page and create a requirement with a title, description, budget, category, platform, follower range, location, language, deliverables, and application instructions. Creators apply with a price and message; you accept or reject each offer.',
    tags: ['post requirement', 'marketplace', 'business', 'how to'],
  },
  {
    q: 'How do I apply to a requirement as a creator?',
    a: 'Open a requirement in the marketplace and send an offer with your price, message, and timeline. You can withdraw your offer while it is pending. If the business accepts, a booking is created for you to accept or reject.',
    tags: ['apply', 'offer', 'requirement', 'creator', 'withdraw'],
  },
  {
    q: 'Can I review a creator after a collaboration?',
    a: 'Yes. Any signed-in user can leave a review with star ratings. The creator\u2019s average rating is recomputed from all reviews and shown on their profile. Reviews cannot be edited or deleted.',
    tags: ['review', 'rating', 'stars', 'feedback'],
  },
  {
    q: 'How do I contact Collancer support?',
    a: 'Open the Support page in the app for help articles and contact guidance. For booking-specific issues, check the booking detail screen first — it shows the exact status and next step.',
    tags: ['support', 'contact', 'help', 'customer care'],
  },
  {
    q: 'Can I cancel a booking?',
    a: 'A business can cancel a booking under the platform\u2019s cancellation rules. If you paid from your wallet and the booking is cancelled, the refund is credited back to your wallet — refunds go only to the wallet, never to a bank account directly.',
    tags: ['cancel', 'cancellation', 'refund', 'booking cancel'],
  },
  {
    q: 'How do refunds work?',
    a: 'Refunds apply to cancelled wallet-paid bookings. The exact escrow amount is credited back to your business wallet in a single transaction tied to that booking. A booking can only be refunded once.',
    tags: ['refund', 'wallet', 'cancelled booking', 'money back'],
  },
  {
    q: 'What payment methods can I use to book?',
    a: 'Bookings can be paid from your Collancer wallet balance (topped up via manual UPI deposit) or through the available checkout options shown at booking time. Demo checkouts are always labeled honestly as demo — no real money moves in demo mode.',
    tags: ['payment methods', 'pay', 'checkout', 'wallet', 'how to pay'],
  },
  {
    q: 'Is my wallet balance safe? Can anyone else change it?',
    a: 'Your wallet balance can only decrease through your own booking payments, and can only increase when an admin credits a verified deposit or a valid refund. You cannot credit your own wallet directly, and nobody else can move your balance.',
    tags: ['wallet', 'safe', 'balance', 'security'],
  },
  {
    q: 'What happens after the creator submits the work?',
    a: 'The creator submits the delivery (video link, drive link, or media). You review it and request completion. An admin does a quality check and then releases the escrowed payment to the creator.',
    tags: ['delivery', 'completion', 'submit work', 'after booking'],
  },
  {
    q: 'What is the referral page?',
    a: 'The referral page in the business app currently shows demo content — it is labeled as a demo and has no backend behind it yet.',
    tags: ['referral', 'refer', 'demo'],
  },
  {
    q: 'How does Cleo AI discovery work?',
    a: 'Tell Cleo what you need in plain words — for example "fashion creators in Mumbai under \u20B910,000 with 50K+ followers". Cleo parses your niche, budget, followers, platform, city, language and engagement filters, then shows exact matching creators from Collancer. If nothing matches, it says so honestly instead of showing unrelated profiles.',
    tags: ['cleo', 'ai', 'discovery', 'search', 'how it works'],
  },
  {
    q: 'Can Cleo draft my campaign requirement?',
    a: 'Yes. Describe your campaign in a message — brand, product, budget, deliverables, timeline — and Cleo extracts the details into a structured requirement draft you can publish to the marketplace. Anything you didn\u2019t mention stays empty; Cleo never invents details.',
    tags: ['cleo', 'campaign', 'requirement', 'draft', 'plan'],
  },
  {
    q: 'Does Cleo use my voice? How does voice mode work?',
    a: 'Yes — tap the mic or speaker in the Cleo panel. Cleo reads answers aloud using high-quality voices (Christopher or Emma) and can listen to your questions. You can switch the voice or stop playback anytime.',
    tags: ['voice', 'speak', 'mic', 'audio', 'christopher', 'emma'],
  },
  {
    q: 'What are promo demos?',
    a: 'Promo demos are a creator\u2019s portfolio — demo videos or images (product reviews, unboxings, tutorials, vlogs, ad shoots, testimonials) uploaded to their profile so businesses can preview their style. Businesses can view them; creators manage their own uploads.',
    tags: ['promo demos', 'portfolio', 'demo video', 'samples'],
  },
  {
    q: 'How many followers do I need as a creator?',
    a: 'You need at least 10,000 followers to be eligible for Collancer discovery. Your profile also needs at least one package price set.',
    tags: ['followers', '10000', 'minimum', 'eligibility', 'creator'],
  },
  {
    q: 'How do I set my prices as a creator?',
    a: 'Edit your profile and set a price for each promotion package you offer (Instagram Story, Reel, Video Post, Personal Video, Personal Ad Shoot, YouTube Short). Your price is locked at booking time — businesses pay exactly what you set.',
    tags: ['price', 'pricing', 'rate card', 'packages', 'set price'],
  },
  {
    q: 'What details should a booking brief include?',
    a: 'A strong brief includes: deliverables, platform, deadline, target audience, usage rights, number of revisions, hashtags or coupon codes, contact number, and any reference media. Clear briefs get accepted faster.',
    tags: ['brief', 'booking', 'deliverables', 'how to', 'campaign brief'],
  },
  {
    q: 'Can a creator reject my booking?',
    a: 'Yes. Every booking starts as Pending and the creator must explicitly accept or reject it. If rejected, you are not charged — wallet-paid bookings are refunded to your wallet.',
    tags: ['reject', 'creator reject', 'pending', 'booking rejected'],
  },
  {
    q: 'Does Collancer have an app I can install?',
    a: 'Yes — Collancer is installable as a PWA. Open the site in your mobile browser and choose "Add to Home Screen" for a full-screen, app-like experience.',
    tags: ['pwa', 'install', 'app', 'mobile app', 'download'],
  },
  {
    q: 'Is there a demo mode? Will real money move?',
    a: 'Demo or simulated payments in the app are always labeled honestly as "Demo checkout — no real money moves". Only real wallet deposits (manual UPI, admin-verified) and real bookings move real money.',
    tags: ['demo', 'test', 'real money', 'simulated'],
  },
  {
    q: 'How is my data and account protected?',
    a: 'Firestore security rules enforce the model: creators can only edit their own profiles (never verification or visibility flags), businesses can never self-credit their wallet, only admins release escrow or approve payouts, and bookings are visible only to the two parties and admins.',
    tags: ['security', 'privacy', 'data', 'rules', 'protected'],
  },
  {
    q: 'What notifications will I get?',
    a: 'Businesses get notified about booking acceptances, rejections, deliveries, completions, and wallet deposit credits/rejections. Creators get notified about new bookings, verification decisions, payouts, and offer decisions.',
    tags: ['notifications', 'alerts', 'updates'],
  },
];

/* ---------------- KB topics ---------------- */

export const KB_TOPICS = {
  'getting-started-business': `Getting started as a business\n\n1. Create your business account and complete your profile.\n2. Open Discover to browse creators — filter by niche, platform, followers, city, budget, and rating.\n3. Open a creator profile to see prices, ratings, reviews, and promo demos.\n4. Tap Book, fill the campaign brief, and pay. The booking starts as Pending until the creator accepts.\n5. Track everything from the Dashboard: active campaigns, pending requests, and notifications.\n\nTip: ask Cleo "find fashion creators in Mumbai under \u20B910,000" to shortlist in seconds.`,

  'getting-started-creator': `Getting started as a creator\n\n1. Sign up and complete your profile: name, handle, bio, platform, niche, city.\n2. Reach at least 10,000 followers and set at least one package price.\n3. Submit verification with your profile URL and details; an admin reviews it.\n4. Once added to Collancer, businesses can discover and book you.\n5. Accept bookings promptly, deliver on time, and request payouts from Earnings.\n\nYour price is locked at booking — businesses pay exactly what you set, and you earn 95% of it.`,

  'payments-escrow': `Payments and escrow\n\n- Every paid booking = creator price + 12% platform fee. Pro businesses get a 5% discount on the creator price.\n- Your payment is held in escrow when you book. It is NOT sent to the creator immediately.\n- After delivery and your completion request, an admin quality-checks and releases the payment.\n- Creators earn 95% of the creator price.\n- Cancellations of wallet-paid bookings refund the exact escrow amount back to your wallet.`,

  'wallet-deposits': `Wallet deposits (manual UPI)\n\n1. Go to Wallet and create a deposit request of at least \u20B9100.\n2. Pay the shown UPI ID (collancer@upi) from any UPI app.\n3. Enter your payer UPI ID and the 12-digit UTR/reference number.\n4. An admin verifies the payment externally and credits your wallet.\n\nThis is a manual process — crediting is not instant. You cannot credit your own wallet; only admin verification adds balance.`,

  'pro-subscriptions': `Pro subscriptions\n\nBusiness Pro — Monthly \u20B9799, 6 Months \u20B93,894 (save 19%), Annual \u20B95,988 (best value). Benefit: 5% off every creator booking price.\n\nCreator Pro — Monthly \u20B9599, Quarterly \u20B91,499 (save 17%), Yearly \u20B94,999 (best value). See the Creator Pro page for current benefits.\n\nPro status is checked live and revoked automatically when it expires.`,

  'marketplace-guide': `Requirements marketplace guide\n\nFor businesses:\n- Post a requirement with title, description, budget, category, platform, follower range, location, language, deliverables, and application instructions.\n- Review creator offers (price, message, timeline) and accept or reject each.\n- Accepting creates a booking the creator must still accept.\n\nFor creators:\n- Browse open requirements and send an offer with your price and pitch.\n- Withdraw anytime while pending.\n- If your accepted offer's booking is rejected, the requirement can reopen.`,

  'verification-guide': `Creator verification guide\n\n- Submit: platform, follower count, profile URL, niche, city, and identity details.\n- An admin reviews and approves or rejects with a reason.\n- You can resubmit after a rejection — check the reason and fix it.\n- Verified creators build more trust, but marketplace visibility also needs 10,000+ followers and a set price.`,

  'payouts-guide': `Creator payouts guide\n\n- Minimum payout: \u20B9100. One pending/approved request at a time.\n- Methods: UPI ID, or bank account number + IFSC.\n- Earnings become available after admin releases escrow on completed bookings (95% of creator price).\n- An admin reviews each payout request; you are notified of approval, rejection, or payment.`,

  'be-on-top-guide': `Be On Top (creator profile promotion)\n\n- Paid boost for your discovery placement. Plans: 1 day \u20B9249, 2 days \u20B9449, 3 days \u20B9649, 4 days \u20B9799, 5 days \u20B9999, 6 days \u20B91,199, 7 days \u20B91,399.\n- A boost is active while its status is active and its end time is in the future.\n- Boosts can target specific categories, so you are promoted to the most relevant businesses.`,

  'troubleshooting': `Troubleshooting\n\n- Booking stuck on Pending: the creator hasn't responded yet — wait or try another creator.\n- Wallet deposit not credited: deposits are manual; ensure your UTR is 12 digits and the amount matches, then wait for admin verification.\n- Can't withdraw: check you meet the \u20B9100 minimum and have no other pending payout request.\n- Not visible in discovery: you need 10,000+ followers, a set price, verification, and no active booking or ban.\n- Login issues: use the same sign-in method you registered with (email or Google).`,
};

/* ---------------- retrieval ---------------- */

/** Weighted field match: question x3, tags x2, answer x1 — normalized by query size. */
function weightedScore(qt, qTokens, tagTokens, answerTokens) {
  const qT = new Set(qTokens);
  const tagT = new Set(tagTokens);
  const aT = new Set(answerTokens);
  let s = 0;
  for (const w of qt) {
    if (qT.has(w)) s += 3;
    else if (tagT.has(w)) s += 2;
    else if (aT.has(w)) s += 1;
  }
  return s / Math.max(1, qt.length);
}

/** findQA(question) -> best matching QA entry or null */
export function findQA(question) {
  const r = scoreQA(question);
  return r && r.score >= 1.2 ? r.entry : null;
}

/** scoreQA(question) -> { entry, score } | null (score: weighted field match) */
export function scoreQA(question) {
  const qt = [...new Set(tokens(question))];
  if (!qt.length) return null;
  let best = null; let bestScore = 0;
  for (const entry of QA_ENTRIES) {
    const score = weightedScore(qt, tokens(entry.q), entry.tags.flatMap(tokens), tokens(entry.a));
    if (score > bestScore) { bestScore = score; best = entry; }
  }
  return best ? { entry: best, score: bestScore } : null;
}

/** findKB(question) -> best matching KB topic text or null */
export function findKB(question) {
  const qt = [...new Set(tokens(question))];
  if (!qt.length) return null;
  let best = null; let bestScore = 0;
  for (const [name, text] of Object.entries(KB_TOPICS)) {
    const score = weightedScore(qt, tokens(name.replace(/[-_]/g, ' ')), [], tokens(String(text).slice(0, 800)));
    if (score > bestScore) { bestScore = score; best = text; }
  }
  return bestScore >= 0.8 ? best : null;
}
