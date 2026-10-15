# GigTask UI

GigTask is a freelance micro-jobs marketplace. This repository carries forward the [GigTask database project](https://github.com/MohitSharma25/GitTask) and its commit history, and adds a web front end and a small API so every workflow can be done in a browser: fund a gig, follow a client's escrow history, see freelancer revenue analytics, find workers near a job site on a live map, and read reviews and portfolios.

Github repo link : https://github.com/MJT444/newGigTaskUI
final commit hash : 3f54e92
Video link :

| Folder | Contents |
| --- | --- |
| `db/` | Inherited database code: PostgreSQL schema and workflows, MongoDB scripts, data generators, performance results. Files `01`–`06` are unchanged; `db/sql/07_ui_support.sql` is one added table. |
| `api/` | Node.js + Express API between the browser and both databases. |
| `web/` | React front end (one file per screen in `web/src/pages/`). |
| `docs/` | Requirements, design (users, wireframes, design system), API endpoints, handover note. |
| `scripts/` | One-time database setup and a Windows start script. |

## Setup

### Prerequisites

- **Docker Desktop**, running
- **Node.js 20 or newer**
- **Python 3.9 or newer** (used once, to seed the databases)

PostgreSQL and MongoDB run in Docker on ports **5433** and **27018**, so they don't clash with databases already installed on the computer. Database user `postgres`, password `gigtask`, database `gigtask`.

### Windows (PowerShell)

```powershell
powershell -ExecutionPolicy Bypass -File scripts\setup.ps1     # once: creates and seeds both databases (a few minutes)
powershell -ExecutionPolicy Bypass -File scripts\start.ps1     # every time: starts the API and web app, opens the browser
```

### macOS / Linux

```bash
./scripts/setup_db.sh                                        # once (use a Python virtual environment)
cd api && cp .env.example .env && npm install && npm start   # API on http://localhost:4000
cd web && npm install && npm run dev                         # web app on http://localhost:5173 (second terminal)
```

Open **http://localhost:5173** and pick a client under **Acting as client** (top right).

**What setup does:** starts the containers → runs `db/sql/01`–`05` and `07` → seeds PostgreSQL (1,000 clients, 2,000 freelancers, 50,000 contracts, 100,000 audit rows) → refreshes the materialized view → creates the MongoDB collections and indexes → seeds MongoDB (portfolios, 20,000 reviews, 500,000 location pings). MongoDB is seeded after PostgreSQL because it reads freelancer ids from it. To start over: `scripts\setup.ps1 -Reset` (Windows) or `./scripts/setup_db.sh --reset`.

### Tests

```bash
cd api && npm test                   # unit tests, no database needed
cd api && npm run test:integration   # end-to-end; needs the API running on seeded databases
cd web && npm test                   # screen tests (Explore, Fund gig, Workers map)
```

### Troubleshooting

| Problem | Fix |
| --- | --- |
| Every screen shows "Could not load this" | The API is not running: `cd api && npm start` |
| Only Workers map and Reviews show an error | MongoDB is down: `docker compose up -d` |
| Setup says ports 5433 / 27018 are in use | Stop the containers it lists (`docker stop <name>`), then run setup again |
| Setup says the database already has data | Run setup with `-Reset` / `--reset` |
| Workers map: "No available workers within 5 km" | Seeded locations expire 2 hours after seeding. Press **Add fresh pings** or turn on **Simulate workers moving**. |

## Tech stack

| Layer | Choice | Why |
| --- | --- | --- |
| Front end | **React 18 + Vite** | Reusable components across seven screens; fast reload; Vite forwards `/api` to the API, so no CORS setup. |
| Data fetching | **TanStack Query** | Loading, error and empty states, caching, no flicker while paging, and polling for the live map. |
| Routing | **React Router** | Screen state lives in the URL, so links and back/forward work. |
| Charts | **Recharts** | Simple bar and line charts for analytics. |
| Map | **Leaflet** with free tile services | No API key needed. |
| API | **Node.js + Express**, `pg`, `mongodb` | One language end to end; official database drivers; the API stays a thin layer. |
| Databases | **PostgreSQL 16**, **MongoDB 8** (Docker Compose) | The inherited databases, identical on every machine. |
| Tests | **node:test** (API), **Vitest + Testing Library** (web) | No extra test tools for the API; screens are tested the way a user uses them. |

The inherited database does the real work: the API calls the `fund_gig` procedure, reads what the audit trigger wrote, and runs the inherited window query, `$geoNear` and `$facet` pipelines. Anything extra the screens need is done in the API, not by changing the database.

## Assumptions

1. **Currency is ₹**, since freelancer locations are in Delhi NCR.
2. **There is no real login.** The demo user is a **client** (chosen with *Acting as client*), because clients fund gigs and own the escrow.
3. **"Active gig" means `IN_PROGRESS`**, as in the inherited index `idx_active_gig`. A freelancer can have several funded contracts waiting, but only one in progress.
4. **Contract statuses only move forward**: FUNDED → IN_PROGRESS → COMPLETED. The API enforces this.
5. **Revenue is the budget of COMPLETED contracts, dated by `created_at`**, as in the inherited analytics query (there is no completion-date column).
6. **The 7-day moving average keeps the inherited definition**: it averages only the days that had revenue in the 7-day window.
7. **Job sites** are preset points in the seeded area, or any point clicked on the map, because the database has no job-site table. The search radius is 5 km.
8. **The map shows one row per worker** (their latest available location within 5 km). A worker is **busy** if they have an IN_PROGRESS contract.
9. **"Add fresh pings" and "Simulate workers moving" insert location pings** in the same format as the seeder. They stand in for workers' phones sending their location.
10. **Amounts** have at most 2 decimal places and are at most ₹99,999,999.99, matching the `DECIMAL(10,2)` columns.
11. **Dates use Indian time** (Asia/Kolkata), set on the database container.
12. **Older escrow history may not add up.** The inherited seeder wrote random balances into the audit rows, so the Escrow screen calculates balances back from each client's current balance. Every transaction made in this app is recorded by the trigger and adds up exactly.

## Contribution

Work was divided by screen. Each member owned the design and the code for their screens; shared parts are listed under the member who built them. In [docs/design/wireframes.md](docs/design/wireframes.md), each member is responsible for the sketches and screen designs of their own screens, and the users section was agreed by the whole team.

| Member | Roll no. | Design | Code | Docs / tests |
| --- | --- | --- | --- | --- |
| Manjeet Singh Seegriwal | `TODO` | Explore, Freelancer page, Fund gig | Explore, detail pages, Fund gig; database setup in this repository | Explore and Fund gig tests |
| Aniket Anand | `TODO` | Escrow; loading / empty / error states | Escrow; shared web base (layout, components, API client) | Project documentation, handover note |
| Adwaith Panicker | `TODO` | Analytics; design system (colours, type, components) | Analytics; API and backend | API tests |
| Abhaya Manasa Dasari | 2026202014 | Workers map, Reviews; phone layout | Workers map, Reviews, MongoDB routes and pipelines; plain-language error messages | Workers map tests, MongoDB guide |
