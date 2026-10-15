# GigTask database handover note

Source: [MohitSharma25/GitTask](https://github.com/MohitSharma25/GitTask), commit `5d38fee`, moved into `db/`.
Checked against the Assignment 1 specification for Project 5 (GigTask) and **re-run on PostgreSQL 16** with the
inherited scripts and seeders (1,000 clients, 2,000 freelancers, 50,000 contracts, 100,000 audit rows).

**Policy:** we change another team's database only when Assignment 2 cannot work otherwise. All inherited
files in `db/` are **unchanged** (byte-for-byte identical to `5d38fee`). What Assignment 2 needs on top is done
in our API, plus one additive table (below).

## What worked

- `db/sql/01`–`05` run cleanly in the documented order; both seeders and the MongoDB scripts work as described.
- Everything the Part A spec asks for is present: the `clients` CHECK constraint, the audit trigger, the exact partial unique index `idx_active_gig … WHERE status = 'IN_PROGRESS'`, the materialized view with a `REFRESH … CONCURRENTLY` function, the 2dsphere and 2-hour TTL indexes, and Workflows 1–4.
- **`fund_gig`** locks the client row (`FOR UPDATE`), checks the balance, debits and inserts the contract; any failure rolls the whole call back. Verified: a failing call never changes the balance.
- **`trg_wallet_audit`** writes one row per balance change with a signed `amount_changed` and the correct `balance_after`.
- MongoDB: `$geoNear` uses `location_2dsphere`; `$facet` uses `created_at_1`. The PostgreSQL UUID stored as `freelancer_id` is a real cross-database key, and freelancers, pings and the Part A job site are in the same Delhi NCR area.
- Good indexing, e.g. the partial covering index `idx_contracts_completed_recent` makes Workflow 2 an index-only scan.

## Observations (as specified in Part A — not bugs, handled in our API)

| Observation | Why it matters for Assignment 2 | How we handled it (no DB change) |
|---|---|---|
| `$geoNear` has no distance limit | Part A spec: “closest available freelancer to a job site” (no radius). Assignment 2's map needs **5 km**. | API adds `maxDistance: 5000` |
| `$facet` returns per-worker ratings, not an overall average | Matches the Part A spec (“overall worker ratings”). Assignment 2 asks for an **overall average**. | API adds an `overallAverage` facet next to the inherited three |
| `fund_gig` creates `FUNDED` contracts; the index covers `IN_PROGRESS` | Funding alone never triggers the “one active gig” rule (as specified). Assignment 2 wants the transaction form to show that failure. | Form option **Start work now**: `fund_gig` + move to `IN_PROGRESS` in **one** transaction, so the index refuses and the debit rolls back. Also shown on the contract page. |
| Nearest 5 *pings*, not workers | ~250 pings per freelancer; the same person can fill several places. | Map groups to one row per worker; the Part A view stays as a toggle |
| Window query ends with a global `LIMIT 50` | Fine as a report; can't draw one freelancer's chart. | API runs the same CTEs for one freelancer without the limit; the ranking table runs **the file itself** (`db/sql/06`), with only the 30-day period made selectable |

## Issues found (left unchanged — reported for the original authors)

| Issue | Evidence (verified) | Effect / what we did |
|---|---|---|
| **Moving average skips days without revenue** | `RANGE … 6 days PRECEDING` averages only existing rows. One ₹30 day after a gap → “7-day average” ₹30 (a 7-day average with zeros would be ₹4.29). Top seeded Part A row: `moving_avg_7d = daily_total = 9783.88`. | Kept as inherited; the chart shows it honestly (line points only on revenue days) and explains it |
| **Seeded audit history is random** | [Seeder](https://github.com/MohitSharma25/GitTask/blob/5d38fee0356435ccf7a018d306fa8978b8b6a9ab/data_generation/postgres_seeder.py#L98) inserts random amounts with an *unrelated* `balance_after`; no client's history adds up. | Running balance is computed back from the **current** balance, so it is always correct for real (trigger-written) rows; the screen counts how many rows match and explains the seeded ones |
| **Materialized view empty after setup** | It is created (with data) **before** seeding → 0 rows; the README never refreshes it. | Setup calls the inherited `refresh_freelancer_lifetime_stats()` after seeding |
| **No refresh time recorded** | Nothing stores when the view was refreshed; Assignment 2 must show “last refreshed”. | **The one DB addition:** `db/sql/07_ui_support.sql` creates `mv_refresh_log`; the API logs each refresh there |
| **Statuses can move backwards** | `COMPLETED → FUNDED` succeeds. | API only allows forward moves (atomic `UPDATE … WHERE status = ANY(earlier)`) |
| **Raw errors on bad input** | budget ≤ 0 → `contracts_budget_check`; unknown freelancer → foreign-key error (both after the debit, then rolled back — safe). | API translates them into clear messages |
| **All pings expire together** | Every seeded ping has `created_at = now`; TTL 7,200 s → the whole collection is gone 2 h after seeding (the README notes this). | “Add fresh pings” in the UI inserts pings with the seeder's document shape |
| **Scripts not re-runnable** | `01` (`CREATE TABLE`) and `mongo/01` (`createCollection`) fail on a second run. | Setup starts from an empty database (`-Reset`) |
| **Exact Python pins** | `psycopg2-binary==2.9.12` etc. may have no build for newer Python versions. | Setup tries the pinned file first, then installs the same packages unpinned (file unchanged) |

## Changes made

| Change | Why it was unavoidable |
|---|---|
| `db/sql/07_ui_support.sql` (new): table `mv_refresh_log` | Assignment 2 requires a “last refreshed” time; PostgreSQL does not record it. Additive — no inherited table, function, trigger, index or data is altered. |

No other database change. Seed data, procedures, triggers, indexes, views and pipelines are used exactly as inherited.

## Suggestions for the original authors

1. A moving average over *days* should count days without revenue as 0 (e.g. join a `generate_series` calendar, then `ROWS BETWEEN 6 PRECEDING`).
2. Generate audit rows the way the system would (through the procedure, or as a consistent ledger ending at each client's balance).
3. Refresh the materialized view after seeding, and record refresh times.
4. Make scripts re-runnable (`IF NOT EXISTS`), and run the README top to bottom on a clean machine.
5. Spread seeded `created_at` for TTL collections, or ship a top-up script.
6. Consider a forward-only status rule in the database.

## Verification status

- PostgreSQL 16: inherited SQL 01–06 + 07, the inherited seeder at full volume, every PostgreSQL-backed API endpoint, and fund / start / complete / backwards / top-up flows.
- `TODO (team): record the MongoDB version you ran, the Mongo-backed screens, and anything that failed.`
