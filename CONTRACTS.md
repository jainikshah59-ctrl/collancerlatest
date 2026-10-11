# COLLANCER-APP — Integration Contracts

Single source of truth for module boundaries. Every role/AI module MUST follow this.

## Stack
- Vite + React 18, JSX only (no TypeScript), no React Router (state-based page nav).
- Design: mobile-first, white surfaces, black buttons w/ subtle glass accents, cyan accent.
  Use ONLY classes from `src/design/tokens.css` + primitives from `src/components/ui.jsx`.
- Icons: `lucide-react` ONLY. No emojis anywhere in UI or strings.

## Shared modules (already written — DO NOT rewrite, just import)

### `src/lib/firebase.js`
```js
import { ensureFirebase, auth, db, registerEmail, loginEmail, logout,
  loginGooglePopup, loginGoogleRedirect, handleGoogleRedirectResult, watchAuth,
  collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, limit, onSnapshot, runTransaction, serverTimestamp,
  increment, arrayUnion, arrayRemove, getDocData, FIREBASE_CONFIG } from '../lib/firebase.js';
```
- Call `await ensureFirebase()` before any Firestore/Auth use. `db()`/`auth()` return instances after init.

### `src/lib/cloudinary.js`
```js
import { uploadToCloudinary, compressImage, fileToDataURL, CLOUDINARY_FOLDERS } from '../lib/cloudinary.js';
// uploadToCloudinary(file, 'image'|'video', folder) -> { url, publicId }
```

### `src/lib/format.js`
`inr(n)`, `inr2(n)`, `compact(n)`, `timeAgo(ts)`, `fmtDate(ts)`, `fmtDateTime(ts)`,
`initials(name)`, `clamp`, `sha256Hex(str)`, `bookingFingerprint({...})`, `uid(prefix)`

### `src/lib/constants.js`
`TAGLINE`, `COLLANCER_UPI_ID` ('collancer@upi' placeholder — display as-is, never invent another),
`PLATFORM_FEE_PCT` (12), `PRO_DISCOUNT_PCT` (5), `CREATOR_SHARE_PCT` (95),
`MIN_FOLLOWERS` (10000), `MIN_PAYOUT` (100), `MIN_DEPOSIT` (100),
`BUSINESS_PRO_PLANS`, `CREATOR_PRO_PLANS`, `AD_PLANS`, `PROMO_TYPES`, `promoLabel(key)`,
`CATEGORIES`, `NICHES`, `PLATFORMS`, `CITIES`, `BOOKING_STATUS`, `DEMO_TYPES`,
`DEMO_FORMATS`, `MAX_DEMO_UPLOADS`, `INDUSTRIES`,
`priceBreakup(creatorPrice, isPro)` -> {creatorPrice, fee, discount, total},
`creatorShareOf(booking)` -> 95% of creatorPrice.

### `src/components/ui.jsx`
`ToastProvider`, `useToast()` -> { ok, err, info },
`Button` (variant: dark|light|cyan|ghost|danger; size: sm|lg; block; loading; icon),
`IconBtn` ({icon, label}), `Card` ({pressable, lift}), `Field` ({label, hint, error}),
`Input`, `TextArea`, `Select`, `SearchInput` ({value, onChange, placeholder}),
`Tabs` ({tabs:[{key,label,icon?}], value, onChange}), `Sheet` ({open, onClose}),
`Modal` ({open, onClose, wide}), `ConfirmDialog`,
`Badge` ({tone: green|amber|red|cyan|dark|grey}), `Chip` ({on, cyan, onClick}),
`Avatar` ({src, name, size}), `EmptyState` ({icon, title, body, action}),
`Skeleton`, `SkeletonCard`, `Stat` ({label, value, icon, tone}),
`ProgressBar` ({value 0-100}), `Toggle` ({on, onChange}),
`TopBar` ({title, subtitle, left, right}), `BottomNav` ({items:[{key,label,icon}], value, onChange}),
`ErrorBoundary`, `Page` ({pageKey}) — wrap every page for transitions.

## Role app contracts (each in its own folder)

### `src/business/BusinessApp.jsx` — default export `BusinessApp({ onSwitchRole })`
Owns business auth internally (shows BusinessAuthScreen when signed out).
Pages (state-based, `page` state): `discover` (default), `dashboard`, `ai`, `wallet`,
`marketplace`, `referral`, `pro`, `support`, `privacy`, `terms`.
BottomNav items: Discover(Compass), Dashboard(LayoutDashboard), AI(Sparkles),
Wallet(Wallet), Marketplace(Store).

### `src/creator/CreatorApp.jsx` — default export `CreatorApp({ onSwitchRole })`
Owns creator auth internally. Pages: `dashboard` (default), `marketplace`, `bookings`,
`creatorpro`, `profile`, `earnings`, `collancer-ai`, `notifications`, `support`,
`privacy`, `terms`. Plus overlay states: verification, beontop, booking detail.
BottomNav: Dashboard(LayoutDashboard), Marketplace(Store), Bookings(CalendarCheck),
Earnings(IndianRupee), Profile(User).

### `src/admin/AdminApp.jsx` — default export `AdminApp({ onSwitchRole })`
Owns admin auth (email/password + `admins/{uid}` doc check). Tabs: Verification
(ShieldCheck), Completions (PackageCheck), Payouts (IndianRupee), Deposits (Landmark).

## AI contracts (`src/ai/`)

### `src/ai/engine.js`
- `parseQuery(q: string)` -> { niche, budget, maxBudget, minFollowers, minEngagement, count, platform, city, language, priceUnit }
- `normalizeCreator(raw)` -> canonical creator record
- `dedupeCreators(list)` -> list
- `rankCreators(parsed, creators)` -> [{ creator, score, reasons[] }] (exact matches; hard failures excluded; NO unrelated alternatives on strict path)
- `answerQuery(q, ctx)` -> Promise<{ answer: string, creators: [], actions: [], confidence }>
  ctx: { creators, user, role, isPro, onAction }
- `extractCampaign(text)` -> { brand, product, niche, region, platform, deliverables, budget, deadline, requirements } (missing -> empty, never invented)
- `generateRequirement(nlText, biz)` -> requirement object for Requirements Marketplace
- `resolveFollowup(q, convo)` -> handles ordinal (first/second/…), superlative (highest followers…), refinement (only instagram, under budget…)

### `src/ai/knowledge.js`
- `QA_ENTRIES`: [{ q, a, tags[] }] — Collancer product QA (business + creator)
- `KB_TOPICS`: { topic: markdown-ish text } — comprehensive help topics
- `findQA(question)` -> best match or null (token overlap)
- `findKB(question)` -> best topic text or null

### `src/ai/conversation.js`
- `loadConvo()`, `saveConvo(c)`, `loadMemory()`, `saveMemory(m)` — localStorage keys
  `collancer_ai_conversation_v2`, `collancer_ai_memory_v2`
- Conversation: { turns: [{query, intent, constraints, answer, resultKeys, pageKeys}], pageSize: 8 }

### `src/ai/creatorAi.js`
- `askCreatorAI(q, ctx)` -> Promise<{ answer, actions[] }>
  ctx: { creator, bookings, payouts, verification }
- Deterministic: profile completeness (name/handle/bio/platform/niche/city/10k followers/≥1 price),
  pricing guidance tiers (<10K, 10K–50K, 50K–200K, 200K–1M, 1M+), pitch drafting,
  brief interpreter (deliverables/deadline/usage/revisions/payment/guidelines),
  deliverable checklists (Reel/Story Set/Static Post/YouTube Video/UGC), profile tips,
  live account answers (bookings/earnings/payouts/verification).

### `src/ai/voice.js`
- `speak(text, { voice: 'christopher'|'emma', onProgress, onDone })` — transport fallback:
  1. direct Edge TTS WebSocket (`speech.platform.bing.com`), 2. `/api/edge-tts` proxy,
  3. browser speechSynthesis. Chunks text, word/char progress, safe cancel.
- `stopSpeak()`, `VOICES = { christopher: 'en-US-ChristopherNeural', emma: 'en-US-EmmaNeural' }`

### `src/ai/CleoPanel.jsx` — default export `CleoPanel({ mode: 'business'|'creator', context, onAction })`
Full ChatGPT-like chat UI: conversation area, bottom composer, user vs AI bubbles,
creator result cards w/ book action, voice button, empty state. Uses engine.js/voice.js/conversation.js.
`context`: { user, creators, isPro, extra } — `onAction({type:'book', creator})` etc.

## Firestore collections (canonical)
`creators`, `businesses`, `creatorHandles`, `bookings`, `reviews`, `bizCampaigns`,
`bizNotifs`, `creatorNotifs`, `adminNotifs`, `adminRevenue`, `payoutRequests`,
`verificationRequests`, `walletDeposits`, `walletTransactions`, `requirements`,
`requirementOffers`, `promoDemos`, `adCampaigns`, `proPayments`, `creatorProPayments`, `admins`.

## Business rules (non-negotiable)
1. Creator package price locked; business cannot modify.
2. Paid: total = creatorPrice + 12% fee − 5% Pro discount (on creator price).
3. Bookings start `Pending`; creator must accept/reject explicitly.
4. Barter: amount 0, no escrow; address shared only after creator acceptance.
5. Wallet debit: Firestore transaction reading live balance inside tx; never from React state.
6. Client cannot self-credit wallet; only admin credits deposits.
7. Only admin releases escrow (idempotent `adminRevenue/rev_{bookingId}`).
8. Creator share = 95% of creatorPrice.
9. Payout min ₹100; one pending/approved request at a time; UPI/bank/IFSC validation.
10. Handle uniqueness: case-insensitive via `creatorHandles/{handleLower}` transaction.
11. Discovery: only `addedToCollancer==true`, not banned, `hasActiveBooking!=true`.
12. Booking idempotency: doc id `collab_{fingerprint32}` for wallet bookings; marketplace `mkt_{bookingId}` ledger; refund `refund_{bookingId}`.
13. Pro expiry: checked on snapshot + every 60s; revoke on expiry.
14. Demo/simulated payments: label honestly in UI ("Demo checkout — no real money moves").
15. Referral page: static/demo content (no backend) — keep as demo-labeled.
16. Deposit flow: min ₹100; show `collancer@upi`; collect payer UPI ID + 12-digit UTR; admin verifies externally.

## File placement
- Business: `src/business/*.jsx` (BusinessApp.jsx, auth.jsx, DiscoverPage.jsx, CreatorProfile.jsx, BookModal.jsx, DashboardPage.jsx, WalletPage.jsx, RequirementsPage.jsx, ReferralPage.jsx, ProPage.jsx, SupportPages.jsx)
- Creator: `src/creator/*.jsx`
- Admin: `src/admin/*.jsx`
- AI: `src/ai/*`
- APIs: `api/cleo-ai.js`, `api/cleo-search.js`, `api/edge-tts.js` (Vercel serverless, Node)
- Rules: `firestore.rules`, `firestore.indexes.json` (repo root)
