# Creator-Side UI Audit — Collancer App

**Date:** 2026-10-10 · **Commit audited:** `11e7c56` (synced to remote `e0a6d316`)
**Scope:** creator-side only (`src/creator/`, `src/components/ui.jsx`, `src/design/tokens.css`)
**Method:** 5 parallel read-only audit lanes (Dashboard · Earnings/Bookings · Profile/Instagram · Secondary pages · Design system)

## Baseline (pre-change)
- `vite build`: ✅ passes (25.79s)
- `node --test test/*.test.mjs`: ✅ 64/64 pass
- Icons: 100% `lucide-react` across all audited files, zero emojis — clean foundation

## Issue counts by category

| Category | Count |
|---|---|
| Layout / structure | 28 |
| Spacing (hardcoded, inconsistent) | 22 |
| Typography (ad-hoc sizes, hierarchy) | 14 |
| Icons (size/semantic inconsistency) | 18 |
| Cards (surface/padding treatment) | 16 |
| Buttons / actions | 12 |
| Dead code / dead imports | 9 |
| Accessibility (ARIA, labels, focus) | 8 |
| Live functional bugs | 7 |
| **Total** | **~134** |

## 🔴 Live functional bugs (fix first)

1. **Loading spinners never spin app-wide** — `ui.jsx:210` renders `<Loader2 className="lucide spin">` but `.spin` is undefined; `@keyframes spin` only exists inside `App.jsx` Curtain's `<style>` which unmounts after load. `tokens.css` has `@keyframes cl-spin` (line ~665) that nothing references. Affects every `loading` Button (Marketplace, Verification, CreatorPro, PromoDemo, ScamAlerts, auth) + CreatorApp curtain + Google/Phone buttons in `auth.jsx:299,347`.
2. **Log out submits the account form** — `ProfilePageH.jsx:771`: Log out `Button` inside `<form onSubmit={saveAccount}>`; shared `Button` never sets `type`, so it renders `type="submit"`. Clicking Log out fires form validation + potential save while opening the logout dialog. Same for `ThemeToggle`'s inner `Toggle` (`ProfilePageH.jsx:769`).
3. **`var(--danger)` referenced but never defined** — `ui.jsx:723` (DeadlineCountdown) relies on fallback; token missing in all themes.
4. **Sheet `labelledBy` → wrong ARIA attr** — `ui.jsx:~408` passes it to `aria-label` instead of `aria-labelledby`.
5. **VerifiedTick duplicate SVG gradient id** — `ui.jsx:~690` hardcodes `id="vtick"`; renders twice on one page = duplicate IDs.
6. **Unread-dot pulse depends on foreign keyframes** — `BookingsPage.jsx:96-101` uses `animation: 'cl-pulse-red …'` but `@keyframes cl-pulse-red` is injected by `ChatModal.jsx:269`'s `<style>` (only renders with unread chat). Dot renders static otherwise.
7. **`.cl-faint` class doesn't exist** — `InstagramConnect.jsx:224` references it; falls back to inherited ink (darker than intended).

## Cross-cutting root causes

1. **No spacing scale** — `tokens.css` defines zero spacing tokens; ~40 ad-hoc gap/padding/margin values (2,3,4,6,8,10,12,14,16,18,22,24,28px…) invented per instance.
2. **No type scale** — font sizes hardcoded: 8→38px across files; `h2`/`h3` both 17px (hierarchy flattened); no line-height/weight tokens.
3. **No icon-size scale** — 11 distinct sizes (10–26px) split between CSS and inline JSX; tile sizes 38/44/46px across sibling cards.
4. **Card surface anarchy** — `cl-card` vs `cl-glass` chosen per-instance, padding overrides 14/16/18/22/28px; `≤420px` blanket `padding: 14px !important` breaks intentional flush-bleed cards (FAQ accordions, portfolio thumbnails).
5. **No z-index / breakpoint / state tokens** — 9 raw breakpoints, 6 raw z-indexes, no `:focus-visible` anywhere, 4 button variants lack `:hover`.
6. **Dead code** — `InstagramConnect.jsx` (248 lines, 3 exports, zero imports); DashboardPage Go Live behind `{false && …}` + dead `goLive`; dead imports in 4 files; ToolsPage ~250 lines dead media-kit CSS/helpers.

## Per-page findings (with file:line)

### DashboardPage.jsx (29 issues)
- `[104]` container: hardcoded padding/gap, no tokens
- `[107]` live card: two surface treatments (conditional `cl-card`+inline border vs `cl-glass`); `borderWidth: 1.5` inline hack
- `[108,168]` `.cl-row` wraps on narrow screens → Badge drops to second line (no nowrap guard)
- `[129-134]` dead Go Live button + dead `goLive` fn (L59-78) + `goingLive` state (L53)
- `[146]` `cl-section-title` misused as in-card header (vs 15px divs at L116,173)
- `[149-160]` checklist rows: `<button style={{all:'unset'}}>` wrapping block div — fragile box model
- `[151]` divider on ALL rows incl. first (floats under header)
- Card titles: 13.5/14/15/17px across one page — no scale
- Icon tiles: 46/44/38px; icons 15/17/18/21/22px — no convention
- `[226]` pending card: bare 22px icon (only row icon without tinted tile)
- `[239]` `Wallet` icon used for two different shortcut actions — semantic duplication
- `[239,249]` shortcuts: bare centered icons vs tiled icons elsewhere — two visual languages
- `[192]` arbitrary `tone="cyan"` on first Stat only
- `[202]` `cl-link` on `<button>` — no text-button variant
- Dead imports L10-13 (`EmptyState`, `compact`, `inr`, `promoLabel`, split `Bell` import)

### EarningsPage.jsx (13 issues)
- `[141-144]` Stat tones hand-picked; `statusTone()` maps PendingCompletion→amber but Stat shows grey — same state, two colors across pages
- `[141-142]` `Clock3` for BOTH "In progress" and "Pending completion" — indistinguishable
- `[141]` label "In progress" vs canonical "Active" (`BOOKING_STATUS.ACTIVE`)
- `[143]` "Completed — locked" em-dash compound; "Pending completion" wraps to 2 lines at 360px
- `[111,156,206]` paddings 22/16/14 on one page
- `[111]` `Card` + `cl-glass` double-layered (redundant gradient/shadow)
- `[115]` hero amount `fontSize: 38` inline — no display token
- `[161]` badge in flowing text lacks `vertical-align`
- `[161,220]` payout statuses lowercase ("pending") vs capitalized booking labels
- `[168-175]` hand-rolled tabs instead of shared `Tabs` (icons 14px vs system 15px, no tab roles)
- `[207,220]` badge vertically centered against multi-line content (should top-align)
- `[189]` standalone error `marginBottom: 12` vs Field errors `margin-top: 6`

### BookingsPage.jsx (7 issues)
- `[96-101]` unread dot: hardcoded `#ef4444/#dc2626/#fff` (not theme-aware); pulse keyframes from foreign component (bug #6 above)
- `[96]` vs `[110]` two unread-dot languages (12px pulsing red vs 8px flat cyan)
- `[119]` Pending + PendingCompletion both amber — color-identical states
- `[77]` vs `[90]` skeleton `gap: 12` vs loaded `gap: 10` — layout shift on data arrival
- `[5]` dead imports: `Clock3, CheckCircle2, XCircle`
- `[69]` vs EarningsPage: two spacing conventions for same page pattern

### BookingDetailModal.jsx (15 issues + 1 observation)
- `[275-283]` long titles squeeze badge (no `flexShrink: 0` / ellipsis)
- `[286]` vs `[320,357,396]` section `marginTop: 14` vs `16` (+ 12px from section-title)
- `[289-302]` `.cl-kv` misused for prose → narrow right-aligned paragraphs; long URLs no `overflow-wrap`
- `[294,308]` `Send`/`Wallet`/`Tag` icons reused across semantically different rows
- `[59,65]` `Link2` 17px vs `ExternalLink` 15px in same chip
- `[382-390]` ad-hoc alert card (`borderWidth: 1.5` inline, 15px h3)
- `[405-410]` vs `[413-419]` inconsistent info-card headers
- `[477]` wrapper `marginBottom: 4` + grid `gap: 10` = 14px gap (vs 10 elsewhere)
- `[478,493]` "Chat with Brand" and "Close" both `variant="light"` — flat hierarchy
- `[438-447]` two `block` buttons inside `.cl-row` — brittle 50/50 via flex shrink
- `[57]` `.cl-row` global wrap breaks icon+label rows at narrow widths
- Observation: `Modal` has no close (×) affordance — only bottom "Close" button

### ProfilePageH.jsx (14 issues)
- `[~479]` Account (final) tab off-screen at ≤360px (tabs `flex-shrink: 0` + overflow)
- `[~483]` `Globe` icon for Account — semantic mismatch (reads as web/locale)
- `[771]` Log out `marginBottom: 76` → ~172px dead space (double-compensates nav padding)
- `[771]` Log out button `type="submit"` inside form (bug #2 above)
- `[769]` ThemeToggle Toggles submit form (bug #2); card-in-card nesting (double glass)
- `[402]` inline style duplicates `.cl-glass` exactly — redundant
- `[~414]` Sync/Disconnect row wraps awkwardly at 360px (detached from info)
- `[~414]` Sync shows zero progress feedback (no `loading` prop)
- `[425]` Disconnect uses native `window.confirm()` — bypasses `ConfirmDialog`
- `[568]` Engagement % disabled field lacks Lock icon affordance (siblings have it)
- `[~573]` metrics list has no visible heading (aria-label only)
- `[727]` rate-card Delivery `width: 90` + non-`Field` labels → broken stacking at 360px
- `[655]` hardcoded `#E1306C` IG pink — not theme-aware
- `[~660]` not-connected empty state: no CTA, misleading copy
- `[5-9]` dead imports: `MapPin, Percent, Heart, MessageCircle, Eye`
- `[32]` cross-page import from `DashboardPage.jsx` — coupling risk

### InstagramConnect.jsx (11 issues — FILE IS DEAD CODE)
- `[1-248]` all 3 exports unimported anywhere in `src/` — ProfilePageH's inline card is the live implementation
- `[224]` `.cl-faint` undefined (bug #7); `[229]` spinner never spins (bug #1)
- `[217]` username overflow (missing `min-width: 0`); `[211]` action wrap; `[233]` Disconnect tap target ~13px
- `[97]` `--amber-border` undefined token ref; `[~99]` `CheckCircle2` for pending state (semantic mismatch)
- `[~163]` `ArrowRight` renders before label ("→ Connect")
- **Fix decision:** delete file (dead, diverged) and fix ProfilePageH's inline card — OR revive. Deletion preserves functionality (zero imports).

### Secondary pages (6 major + 14 nits)
- **CreatorAIPage `[56-57]`**: dead ~68px gap below composer — reserves `--nav-h` but no BottomNav renders on this page
- **ToolsPage `[94,95,137]`**: 3 native `<select>` instead of shared `<Select>` (browser-native chrome vs glass)
- **ToolsPage `[140]`**: raw file input shows OS "Choose File" text
- **ToolsPage**: ~250 lines dead media-kit CSS/helpers (now just an iframe)
- **CreatorProPage `[123]`**: plan select toggles `border 1px→2px` → 1px layout jump (use outline/box-shadow)
- **PromoDemoSection `[208]`**: fixed 2-col grid cramped at 320px; `[222-231]` dead play-overlay affordance
- **SupportPages `[48]`**: FAQ bleed broken by 420px `!important` (shared with #4 root cause)
- **auth.jsx `[206]`**: password toggle `top: 11` vs field icons `top: 14`
- Bottom padding 24 vs 28 across pages; icon boxes 38/40/42/44/46px drift

### Design system — tokens.css (813 lines) + ui.jsx (735 lines)
- **Defined:** colors (3 themes), glass set, `--font-body/display`, `--r-*` (5), shadows (3), motion, `--nav-h/--topbar-h`
- **Missing:** spacing scale · type-size/line-height/weight scale · breakpoint tokens (9 raw values) · z-index scale (6 raw) · icon-size scale (11 sizes → propose 5) · button-size tokens · `--focus-ring` · `--danger` · `--disabled-opacity` · `--overlay-bg` · avatar/input-height tokens · blur scale
- **Component API inconsistencies:** `size` means 3 things; `disabled` missing on Tabs/Chip/Toggle/IconBtn; `className` passthrough only on Card/Avatar/Page; `Modal.wide` vs `Sheet.labelledBy` asymmetry; gold theme `drop-shadow` on all `.lucide` fights zero-shadow policy
- **27 components** exported; concrete extension proposal documented per-token with file:line targets

## Fix priority (cross-cutting first)
1. tokens.css: `.spin` + keyframes, `--danger`, spacing/type/icon/z-index scales, `:focus-visible`, button hovers, scope 420px rule, `cl-pulse-red` keyframes, `.cl-faint`
2. ui.jsx: `Button`/`Toggle` default `type="button"`, Sheet ARIA, VerifiedTick `useId`, IconBtn CSS `:active`
3. Page-level: dead-code removal, icon/tile standardization, section rhythm, IG card consolidation
