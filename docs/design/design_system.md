# Design system

Colours follow the palette chosen in [wireframes.md](wireframes.md) (navy `#17233B`, teal `#0D8A83`, `#F6F8FA`). Implemented in `web/src/styles/global.css` (tokens + components) and `web/src/components/ui.jsx`.
Chart colours are mirrored in `web/src/lib/theme.js` because chart libraries write colours into SVG attributes.

## Principles

1. **Consistency over decoration** — seven screens, one card, one table, one button set.
2. **Show the database working** — subtitles name the procedure, trigger, index or pipeline behind each panel.
3. **Never a blank page** — every data panel goes through `QueryState`: loading → error (*Try again*) → empty (with a reason) → content.
4. **Errors explain, then offer the fix** — not enough escrow → shortfall + *Top up*; busy freelancer → the blocking contract + *Mark completed*.

## Colour

| Token | Value | Use |
|---|---|---|
| `--accent` | `#0d8a83` (teal) | primary buttons, active nav, moving-average line, job site |
| `--bg` / `--surface` | `#f6f8fa` / `#ffffff` | page / cards |
| `--text` / `--muted` | `#17233b` (dark navy) / `#5b6577` | body / secondary |
| `--success` | `#15803d` | completed, credits, available, fresh pings |
| `--danger` | `#b91c1c` | debits, failures |
| `--warning` | `#b45309` | funded, busy, stale view |
| `--info` | `#1d4ed8` | in progress, pings 2–15 min |

Colour always comes with a text label (status badges, legend), never alone.

## Type

System font stack; page title 1.6 rem, card title ~1 rem, body 15 px, labels 0.78 rem uppercase. Money uses `tabular-nums` so columns align.

## Components

| Component | Purpose |
|---|---|
| `Button` (primary / secondary / ghost, `sm`) | actions; spinner + disabled while a request runs |
| `Card`, `StatCard` | every panel / headline numbers |
| `DataTable` + `Pagination` | lists; keyboard-accessible rows; stacked cards under 600 px |
| `Badge`, `StatusBadge` | FUNDED / IN_PROGRESS / COMPLETED, DEBIT / CREDIT, available / busy, tags |
| `Money` | ₹ with Indian grouping; signed amounts red − / green + |
| `Field`, `.input`, `.chip`, `.checkbox-card` | forms |
| `Tabs` | entity switch, periods, map mode, ranking view |
| `Alert` | inline info / warning / danger / success |
| `Loading`, `EmptyState`, `ErrorState`, `QueryState` | the four data states |
| `ClientSearch`, `FreelancerSearch` | server-side search pickers (1,000 / 2,000 rows) |
| `ContractStatusControl`, `BlockingContract` | status steps + forward action; the fix for a busy freelancer |
| `WorkerMap`, `PortfolioCard` | MongoDB views |

## Responsive

| Width | Change |
|---|---|
| ≤ 1100 px | analytics / reviews / map side panels stack |
| ≤ 900 px | navigation behind a *Menu* button; all two-column grids stack |
| ≤ 600 px | tables become label/value cards; map 380 px tall |

`prefers-reduced-motion` turns off pulse/flash animations.
