# GigTask API endpoints (implemented)

Implements the plan made before building the UI; names follow that plan. Additions beyond it: `/api/analytics/ranking`, `/api/workers/job-sites`, `/api/workers/stats`, `/api/workers/pings/simulate`, `/api/reviews`, `/api/clients/:id/topup`. Pagination accepts `pageSize` or `page_size`.

Base URL `http://localhost:4000`. JSON in and out. Money is a **string** (PostgreSQL `DECIMAL`).

Errors always look like `{ "error": { "code", "message", "details" } }`; the UI switches on `code`.
Lists return `{ items, page, pageSize, total, totalPages }` (`pageSize` ≤ 100).

## Health

| Method & path | Output |
|---|---|
| `GET /api/health` | `{ postgres: {ok}, mongo: {ok} }`; 503 if either is down |

## Browse (PostgreSQL)

| Method & path | Input | Output |
|---|---|---|
| `GET /api/clients` | `search`, `page`, `pageSize` | clients + `escrow_balance`, `active_contracts` |
| `GET /api/clients/:id` | — | client + `stats {total_contracts, funded, in_progress, completed, total_budget, last_contract_at}` |
| `GET /api/freelancers` | `search`, `available=true\|false`, `page`, `pageSize` | freelancers + `is_available`, `in_progress_contract_id`; `available=true` means marked available with no gig in progress; `false` includes unavailable or busy workers |
| `GET /api/freelancers/:id` | — | freelancer + live `stats` + `lifetimeStatsView` (materialized view row) |
| `GET /api/contracts` | `clientId`, `freelancerId`, `status`, `page`, `pageSize` | contracts newest first, with names |
| `GET /api/contracts/:id` | — | one contract |
| `PATCH /api/contracts/:id/status` | `{ status: "IN_PROGRESS" \| "COMPLETED" }` | updated contract; 409 `GIG_ALREADY_IN_PROGRESS` (from `idx_active_gig`, + `details.activeContract`) or `INVALID_STATUS_TRANSITION` (forward-only, checked by the API) |

## Workflow 1 — fund a gig

| Method & path | Input | Output |
|---|---|---|
| `POST /api/gigs/fund` | `{ clientId, freelancerId, budget: "1500.00", startNow: true }` | 201 `{ balanceBefore, balanceAfter, contract, auditEntry, startedNow }` |
| `POST /api/clients/:id/topup` | `{ amount }` | 201 `{ balanceBefore, balanceAfter, auditEntry }` — plain `UPDATE` of `escrow_balance`; the inherited trigger writes the CREDIT row |

Runs `BEGIN; SET TRANSACTION ISOLATION LEVEL REPEATABLE READ; CALL fund_gig(...)`; finds the new contract
(`FUNDED`, this client + freelancer, `created_at = now()`); if `startNow`, `UPDATE … SET status = 'IN_PROGRESS'`;
reads the audit row with `created_at = now()`; `COMMIT`.

| Failure | HTTP | `code` | `details` |
|---|---|---|---|
| not enough escrow (`fund_gig`) | 409 | `INSUFFICIENT_BALANCE` | `{ balance, requested }` |
| freelancer already has a gig in progress (`idx_active_gig`, only with `startNow`) | 409 | `GIG_ALREADY_IN_PROGRESS` | `{ activeContract }` |
| budget ≤ 0 (`contracts_budget_check`) / bad format / too large | 400 | `INVALID_AMOUNT` / `AMOUNT_TOO_LARGE` | |
| unknown client (`fund_gig` message) / freelancer (`contracts_freelancer_id_fkey`) | 404 | `CLIENT_NOT_FOUND` / `FREELANCER_NOT_FOUND` | |
| concurrent update | 409 | `CONCURRENT_UPDATE` | |

## Escrow audit trail

| Method & path | Input | Output |
|---|---|---|
| `GET /api/clients/:id/audit` | `from`, `to` (`YYYY-MM-DD`, inclusive), `page`, `pageSize` | `{ client, filter, summary {totalDebits, totalCredits, allConsistent, matchingRows}, items }` |

Item: `id, seq, created_at, action_type, amount_changed (signed), balance_after, running_balance, consistent`.
`running_balance` = current `escrow_balance` − sum of all later `amount_changed` (so the newest row equals today's balance).

## Workflow 2 + materialized view

| Method & path | Input | Output |
|---|---|---|
| `GET /api/analytics/revenue` | `freelancerId` (default: rank 1), `days` 7–365 (default 90) | `{ days, freelancer, rank, periodRevenue, points [{date, dailyRevenue, movingAvg7Day}] }` — one point per calendar day; `movingAvg7Day` is `null` on days without revenue (inherited formula) |
| `GET /api/analytics/ranking` | `days` 7–365 (default 30) | the rows of `db/sql/06_window_analytics.sql` (top 50 freelancer-days, `DENSE_RANK`), names joined; `days=30` = the file exactly |
| `GET /api/analytics/lifetime` | — | `{ isPopulated, lastRefresh, totals, topEarners, pendingCompleted }` |
| `POST /api/analytics/refresh` | — | calls the inherited `refresh_freelancer_lifetime_stats()`, logs the time; `{ refreshed {refresh_mode, started_at, finished_at}, … }` |

## Workflow 3 — workers (MongoDB `WorkerLocations`)

| Method & path | Input | Output |
|---|---|---|
| `GET /api/workers/job-sites` | — | preset job sites |
| `GET /api/workers/nearby` | `jobSite` **or** `lng`+`lat`; `mode=workers\|pings`; `limit`; `maxAgeMinutes` | `{ origin, radiusKm: 5, mode, queryMs, generatedAt, results [{pingId, freelancerId, name, busy, lng, lat, distanceKm, createdAt, ageSeconds, pingsInRadius}] }` |
| `GET /api/workers/stats` | — | `{ totalPings, availablePings, newestPingAt, oldestPingAt, ttlSeconds, indexes }` |
| `POST /api/workers/pings/simulate` | `{ jobSite \| lng, lat, count 1–50 }` | 201 `{ inserted, movedWorkers, at }` |

## Workflow 4 — reviews and portfolios (MongoDB)

| Method & path | Input | Output |
|---|---|---|
| `GET /api/reviews/summary` | `freelancerId` (optional), `days=30\|90\|365\|all` (default 90, or all for one freelancer) | `{ period, freelancer, queryMs, totalReviews, averageRating, ratingDistribution ×5, topTags, topWorkers }` |
| `GET /api/reviews` | `freelancerId`, `rating` 1–5, `page`, `pageSize` ≤ 50 | reviews newest first, with freelancer names |
| `GET /api/freelancers/:id/portfolio` | — | `{ freelancer, portfolio (raw document), presentOptionalFields, missingOptionalFields }` |
