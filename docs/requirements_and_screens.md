# GigTask Assignment 2: requirements and screen plan

This maps the supplied Assignment 2 brief to **P5 GigTask**, the freelance micro-jobs marketplace in [MohitSharma25/GitTask](https://github.com/MohitSharma25/GitTask). This repository is the GigTask Assignment 2 scaffold.

## Required preparation

1. Fork or otherwise carry forward the assigned repository while preserving its commit history. Run the inherited PostgreSQL and MongoDB scripts and seeders locally. Record verified behavior, failures, changes, and suggestions in `docs/handover_note.md`.
2. List API endpoints with inputs and outputs before building the UI. Identify user personas, draw wireframes in `docs/design/`, and choose consistent colors, typography, and reusable controls.
3. Build a small API connecting the browser to both databases. Use the inherited `fund_gig` procedure, window query, materialized view, `$geoNear` pipeline, and `$facet` pipeline for the actual workflows.

## Six main screens

| Screen                    | GigTask content and required behavior                                                                                                                                                                                                     | Main persona                      |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| **Browse**                | Paginated, searchable lists and detail views for clients, freelancers, and contracts. Include a portfolio preview on freelancer details. Fetch pages from the API rather than loading all rows. Contract details need status controls.    | Client, freelancer, demo operator |
| **Fund a gig**            | Select a client and freelancer, enter a positive budget, call `fund_gig`, and show escrow balance before and after. On success show the new contract and audit entry. Explain insufficient balance and active-contract conflicts clearly. | Client                            |
| **Escrow audit**          | Read-only log for a chosen client, with date filter and trustworthy running balance.                                                                                                                                                      | Client, demo operator             |
| **Analytics**             | Per-freelancer seven-day moving-average earnings chart using the SQL window query; a `DENSE_RANK()` table; lifetime statistics from the materialized view, last-refreshed time, and refresh button.                                       | Freelancer, demo operator         |
| **Nearby workers**        | Select a job-site origin. Show available workers within **5 km** on a map and in a distance-sorted list. New pings appear through polling or another update mechanism without reloading the page.                                         | Client                            |
| **Reviews and portfolio** | Charts from `$facet`: rating distribution, top skill tags, and overall average rating. Show at least one flexible `Portfolios` document in a readable profile layout.                                                                     | Client, freelancer                |

Each screen needs loading, empty, and error states and must work on a laptop and reasonably on a phone. A demo actor switcher is required; real authentication is not. Status controls must make it possible to demonstrate the partial unique index. See [wireframes](design/wireframes.md).

## Persona-to-screen map

| Persona           | Primary goals                                                                              | Screens                                                                 |
| ----------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| **Client**        | Find a freelancer, inspect reputation and location, fund a gig, track contracts and escrow | Browse, Fund a gig, Escrow audit, Nearby workers, Reviews and portfolio |
| **Freelancer**    | View profile and reviews, check contracts and earnings                                     | Browse, Analytics, Reviews and portfolio                                |
| **Demo operator** | Switch seeded actors, advance contract status, refresh statistics, demonstrate edge cases  | All screens                                                             |

## Preliminary API sketch

| Endpoint group                                                       | Inputs                               | Outputs                                                                 |
| -------------------------------------------------------------------- | ------------------------------------ | ----------------------------------------------------------------------- |
| `GET /api/clients`, `/api/freelancers`, `/api/contracts`             | Page, page size, search or filters   | Paginated records and counts                                            |
| `GET /api/clients/:id`, `/api/freelancers/:id`, `/api/contracts/:id` | Record ID                            | Detail record; freelancer detail may include portfolio                  |
| `POST /api/gigs/fund`                                                | Client ID, freelancer ID, budget     | Contract, before/after escrow, audit entry or friendly error            |
| `PATCH /api/contracts/:id/status`                                    | Next status                          | Updated contract or constraint error                                    |
| `GET /api/clients/:id/audit`                                         | Date range, page                     | Ordered ledger with running balance                                     |
| `GET /api/analytics/revenue`, `/api/analytics/lifetime`              | Optional freelancer and date filters | Window-query series/ranks; materialized-view summaries and refresh time |
| `POST /api/analytics/refresh`                                        | None                                 | Successful refresh time                                                 |
| `GET /api/workers/nearby`                                            | Job-site longitude and latitude      | Available workers within 5 km, sorted by distance                       |
| `GET /api/reviews/summary`, `/api/freelancers/:id/portfolio`         | Optional freelancer ID               | Faceted rating summaries and a portfolio document                       |

The [handover draft](handover_note.md) identifies inherited behavior that must be corrected or handled in the API, especially the 5 km map limit, overall review average, audit data, and refresh metadata. See also the [endpoint plan](api_endpoints.md).
