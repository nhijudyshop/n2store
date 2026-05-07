<!-- #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes. -->

# AI KOL Studio — Sprint 5 UI Polish (clone tikreel.net/app)

> Source study: [downloads/tikreel-ui-study/](../../downloads/tikreel-ui-study/) — 9 authenticated screenshots (desktop + mobile) + `auth-tokens.json` + `auth-summary.md`. Captured 2026-05-07 via CDP into the user's logged-in tikreel browser.

## 1. TikReel design tokens (verified from live DOM)

| Token            | Value                                                                                             | Notes                          |
| ---------------- | ------------------------------------------------------------------------------------------------- | ------------------------------ |
| `--bg`           | `#0b0c1a`                                                                                         | rgb(11, 12, 26)                |
| `--surface`      | `#12132a`                                                                                         | rgb(18, 19, 42) — card bg      |
| `--surface-2`    | `#181a35`                                                                                         | rgb(24, 26, 53) — chip / inset |
| `--sidebar`      | `oklab(0.199588 0.00755507 -0.0448918 / 0.6)`                                                     | translucent dark               |
| `--accent`       | `#7c5cff`                                                                                         | rgb(124, 92, 255)              |
| `--accent-light` | `#a47cff`                                                                                         | gradient end-stop              |
| `--text`         | `#ecedfa`                                                                                         | rgb(236, 237, 250)             |
| `--text-dim`     | `#5a5e85`                                                                                         | (current)                      |
| Primary CTA      | `linear-gradient(135deg, #7c5cff, #a47cff)` + `box-shadow: rgba(124, 92, 255, 0.25) 0px 4px 18px` | radius 10–12px, pad 10px 18px  |
| Soft-accent btn  | `rgba(124, 92, 255, 0.14)`                                                                        | for tab-active / minor CTA     |
| Section card     | radius **16px**, pad **24px**, bg `#12132a`                                                       |                                |
| Body font        | `ui-sans-serif` system stack                                                                      | tight                          |
| H1               | 24px/600                                                                                          | NOT clamp-scaled — fixed       |
| H2               | 14px/600                                                                                          | small caps-like                |
| Transition       | `0.15s cubic-bezier(0.4, 0, 0.2, 1)` (Tailwind ease-out default)                                  |                                |

## 2. Layout patterns observed

### 2.1 Persistent left sidebar (240px, sticky)

- Dashboard / Models / Products / Source channels / Clip library / Bulk generate / Campaigns / Library (outputs) / Settings
- Active item: soft-accent pill background (`rgba(124, 92, 255, 0.14)` + accent text)
- Bottom-dock (always-visible footer of the sidebar):
    1. Model card mini (avatar + name, switcher arrow)
    2. Credits chip with ⚡ icon — `5,003 credits` + purple gradient **Top up** button
    3. VI / EN segmented toggle
    4. Email + logout icon

### 2.2 Dashboard KPI hero

- 3-card grid: Clips imported · Models saved · Outputs generated
- Each card: large number (32–40px/700) + label (12px/500 dim)

### 2.3 Active queue + completed (2-col)

- **Generation Queue (N)** card: tabs `All / Running / Queued / Failed` (segmented chips), per-row Retry/×.
- **Completed (N)** card: thumb mosaic, "View all" link top-right.

### 2.4 Library page anatomy

- 1 main column (channel import → URL → upload tabs, then clip grid 9:16) + right rail **Generate Content** panel (sticky):
    - Model picker → Images vs Videos (Kling AI) tabs → orientation (9:16/1:1/16:9) → variations → scene prompt → match-source toggle → "Search clips to generate" cost-aware button.

### 2.5 Bulk Generate — 3-step horizontal layout

-   1. Pick a preset (cards) → 2. Pick clips (grid + filter chips Favorites/Cluster/Recent) → 3. Launch (right card showing Plan/Channel/Variations/Output type + total credits + purple "Launch" button)

### 2.6 History (outputs) — filter chip strip

- `All / Images only / Videos only / Model / Channel / Campaign` chips · top-right "Download all" purple button.

### 2.7 Settings — Plans card grid + credit history table + Telegram + Security

- Plans = 5-card grid with Credits/VND/Buy purple gradient button. "Most popular" outline highlight on Standard.
- Credit history table: Date / Type / Credits / Detail (with status pill).

## 3. Where AI KOL Studio currently differs

| Area                    | TikReel                                  | Ours today                  | Gap                                                         |
| ----------------------- | ---------------------------------------- | --------------------------- | ----------------------------------------------------------- |
| Sidebar                 | persistent left, 240px, with bottom-dock | none — links in page header | Add `aikol-sidebar` component shared across all aikol pages |
| Primary CTA             | gradient + purple glow shadow            | flat `#7c5cff`              | Refresh `.aikol-btn`                                        |
| Soft-accent variant     | `rgba(124, 92, 255, 0.14)`               | n/a                         | Add `.aikol-btn--soft`                                      |
| H1                      | 24px/600 fixed                           | clamp 1.5–2.25rem           | Tighten typography                                          |
| Card radius             | 16px                                     | 14px                        | Bump                                                        |
| Section pad             | 24px                                     | clamp(1rem, 2vw, 1.5rem)    | Bump                                                        |
| Dashboard               | 3-KPI hero + queue + completed           | 4-step welcome cards        | Replace with KPI hero                                       |
| Library right rail      | sticky Generate panel                    | modal (we already have)     | Optional — keep modal, or add right rail too                |
| Bulk page               | 3-step horizontal                        | preset row + form below     | Reorganize into 1 preset + 2 clip-pick + 3 launch           |
| Filter chips on history | tab-style soft chips                     | secondary-button row        | Restyle                                                     |

## 4. Sprint 5 task list (CSS-first, no backend changes)

### S5.1 Design tokens (`aikol-studio/css/aikol.css`)

- Update `:root` palette to match (`--aikol-bg`, `--aikol-surface`, `--aikol-accent`, `--aikol-accent-light`, `--aikol-sidebar`).
- Add transition token: `--aikol-ease: cubic-bezier(0.4, 0, 0.2, 1)`.
- Card radius `14px → 16px`, section pad `clamp(1rem, 2vw, 1.5rem) → 24px`.
- H1 `clamp(...) → 24px/600 fixed`.
- Add primary-button styles: gradient + purple glow shadow + `.aikol-btn--soft`.

### S5.2 Sidebar component

- New `aikol-studio/components/sidebar.html` snippet + `js/aikol-sidebar.js`.
- Sticky 240px on desktop · collapsing drawer on mobile (icon-only or full-overlay).
- 9 items, active-state pill background based on URL match.
- Bottom-dock: credits chip (live polled) + Top up gradient button + VI/EN (placeholder) + email + logout.
- Inject via lightweight loader script (no React; same pattern as `navigation-modern.js`).

### S5.3 Dashboard refresh (`index.html`)

- Replace 4-step welcome with 3-KPI hero + Recent activity (Generation queue + Completed thumbs).
- Re-use existing `getQueue()` and `listOutputs(limit=8)` data.

### S5.4 Library right-rail Generate panel (optional, keep modal as fallback)

- Sticky right column 360px. When user clicks `⚡ Generate` on a clip → highlight clip + scroll-to right rail (instead of modal). Modal stays for "no clip" runs.

### S5.5 Bulk Generate horizontal 3-step

- Re-shuffle into 1 preset (cards) + 2 clip picker + 3 launch (right card with cost summary). No HTML structure change to backend payload.

### S5.6 History filter chips

- Replace `aikol-btn--secondary[data-filter]` with `.aikol-chip` (soft-accent active state).

### S5.7 Settings refinements

- Plans card: gradient Buy button + glow shadow + "Most popular" highlight ring on Standard.
- Credit history rows → table-like striped rows with type-coded status pills (already 80% there).

## 5. Cost-benefit

- Pure CSS/HTML refactor: ~1.5 days. No DB / backend changes. Zero new dependencies.
- Risk: cosmetic regressions on existing aikol pages — covered by `test-aikol-sprint4-deep.js` (all assertions are content-driven, not pixel-driven).

## 6. Implementation order (suggested)

1. **S5.1 tokens + button styles** → land first, zero risk, instantly improves every page.
2. **S5.2 sidebar** → biggest UX win, decouples nav from page headers.
3. **S5.3 dashboard KPI hero** → most visible improvement.
4. **S5.6 history filter chips** + **S5.7 settings polish** → quick wins.
5. **S5.5 bulk horizontal** → bigger layout shift, last.
6. **S5.4 library right rail** → optional / can ship after.

Each item ships independently with a follow-up `test-aikol-sprint4-deep.js` re-run to confirm 23/23 still pass.

## 7. Defer / out-of-scope

- ❌ React rewrite — not needed; current vanilla JS is fine.
- ❌ Tailwind adoption — current `aikol.css` is already a small token-driven sheet; no need.
- ❌ VI/EN i18n — keep as static "VI" badge for now.
- ❌ Channel scrape (still gated by TikTok cookie blocker).
