# GigTask UI

GigTask is a freelance micro-jobs marketplace where clients find freelancers, fund gigs from escrow, and review work and earnings. This repository carries forward the [GigTask database project](https://github.com/MohitSharma25/GitTask) and its commit history, then adds an API and a web frontend for Assignment 2.

The app uses PostgreSQL for clients, freelancers, contracts, escrow and revenue, and MongoDB for portfolios, reviews and worker locations. The client picker in the header is a demo actor switcher; there is no real login.

## Repository structure

| Folder | Contents |
| --- | --- |
| `db/` | Inherited Part A database work and one additive UI support script. Its `sql/`, `mongo/` and `data_generation/` subfolders contain the database scripts and seeders. |
| `api/` | Express API connecting the frontend to both databases. |
| `web/` | React and Vite frontend, with screen and component tests. |
| `docs/` | Requirements, endpoint reference, design work, handover note and contribution record. |
| `scripts/` | Database setup scripts and a Windows app startup script. |

The original database setup instructions are in [`db/README.md`](db/README.md). Run its relative commands from the `db/` directory. `db/sql/07_ui_support.sql` is an additive table for recording materialized-view refresh times in the UI; files `01`–`06` are inherited from the original project.

## Assumptions and technology choices

- This is a seeded demonstration app. The header's client picker chooses who is acting; it does not authenticate users.
- A complete demo needs both databases. PostgreSQL holds balances and contracts; MongoDB holds portfolios, reviews and recent worker locations.
- Worker location pings expire after two hours, so the Workers map can add fresh pings during a demo.
- The inherited Part A scripts remain under `db/`. The additional `db/sql/07_ui_support.sql` records when the lifetime earnings summary was last updated.

| Technology | Reason for using it |
| --- | --- |
| PostgreSQL 16 | Keeps escrow funding and contract changes transactional; also supplies revenue analytics. |
| MongoDB | Stores flexible portfolios and reviews, and supports nearby-worker searches. |
| Node.js and Express | Provides one API between the browser and both databases. |
| React and Vite | Builds the web screens and supports local development. |
| Python | Seeds the inherited demonstration data. |
| Docker Compose (optional) | Runs both databases with known ports for a repeatable setup. |

## Requirements and setup

You need Node.js 20.12 or newer, npm and Python 3. Run PostgreSQL 16 and MongoDB through Docker Compose, or install both databases and `mongosh` locally. The seeders need the Python packages in `db/data_generation/requirements.txt`.

### Docker Compose databases

From the repository root, the setup scripts start PostgreSQL and MongoDB, create their collections and tables, and seed both databases. Docker publishes PostgreSQL on port `5433` and MongoDB on `27018`.

On macOS, Linux or Git Bash:

```bash
python3 -m venv venv
source venv/bin/activate
./scripts/setup_db.sh
cp api/.env.example api/.env
```

On Windows PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\setup.ps1
Copy-Item api\.env.example api\.env
```

The setup scripts stop if PostgreSQL already contains tables. Their reset options (`--reset` on macOS/Linux, `-Reset` on Windows) delete existing demo data and seed it again.

### Databases installed without Docker

Start PostgreSQL and MongoDB locally. Set `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD`, `MONGO_URI` and `MONGO_DB` for the Python seeders. Use an existing PostgreSQL role and its password rather than assuming a `postgres` role exists; local installations commonly use ports `5432` and `27017`.

From the repository root:

1. Create the `gigtask` PostgreSQL database. Run `db/sql/01_schema_ddl.sql` through `05_materialized_views.sql` in order, followed by `db/sql/07_ui_support.sql`.
2. Install `db/data_generation/requirements.txt` and run `db/data_generation/postgres_seeder.py`.
3. Run `SELECT refresh_freelancer_lifetime_stats();` in `gigtask`, then record the initial refresh in `mv_refresh_log` as shown in [`scripts/setup_db.sh`](scripts/setup_db.sh).
4. Run `db/mongo/01_collections_and_indexes.js` in `mongosh`, then run `db/data_generation/mongo_seeder.py`. The MongoDB seeder needs the PostgreSQL freelancers created in step 2.
5. Copy `api/.env.example` to `api/.env` and set the same credentials and local ports there. The API reads this file; the Python seeders read shell environment variables.

See [`db/README.md`](db/README.md#setup) for the inherited database commands. Its examples run from `db/` and use local database ports; the additional `07_ui_support.sql` and refresh-log step above are needed for this app.

### Run the app

In separate terminals from the repository root:

```bash
cd api
npm install
npm start
```

```bash
cd web
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). The API runs on `http://localhost:4000`; Vite forwards `/api` requests to it. On Windows with Docker, [`scripts/start.ps1`](scripts/start.ps1) can start both app processes after setup. `GET /api/health` reports whether both databases are reachable.

## Screens and demo flow

| Screen | What to try |
| --- | --- |
| **Explore** | Search and page through clients, freelancers and contracts; open profiles and change a contract's status. |
| **Fund gig** | Choose a client and freelancer, enter a budget, and see the escrow balance before and after funding. |
| **Escrow** | Review deposits, deductions and running balances for the selected client. |
| **Analytics** | View freelancer revenue, the seven-day average, rankings and lifetime earnings; update the lifetime summary. |
| **Workers map** | Find available workers within 5 km of a job site and see location updates. |
| **Reviews** | Explore ratings and skill tags; open a freelancer's portfolio from their profile. |

The app includes loading, empty and error states, and layouts for laptop and phone screens. The detailed [requirements and persona map](docs/requirements_and_screens.md) and [screen designs](docs/design/wireframes.md) describe each workflow.

## Screenshots

These screen images are kept in the existing [design screens folder](docs/design/screens/) alongside the [wireframes](docs/design/wireframes.md).

| Explore | Freelancer profile |
| --- | --- |
| ![Explore screen](docs/design/screens/01-explore.png) | ![Freelancer profile screen](docs/design/screens/02-freelancer-detail.png) |

| Fund gig | Escrow |
| --- | --- |
| ![Fund gig screen](docs/design/screens/03-fund-gig.png) | ![Escrow screen](docs/design/screens/04-escrow.png) |

| Analytics | Workers map |
| --- | --- |
| ![Analytics screen](docs/design/screens/05-analytics.png) | ![Workers map screen](docs/design/screens/06-workers-map.png) |

| Reviews | Phone layout |
| --- | --- |
| ![Reviews screen](docs/design/screens/07-reviews.png) | ![Phone layout](docs/design/screens/08-phone.png) |

Additional images: [design system](docs/design/screens/00-design-system.png) and [loading, empty and error states](docs/design/screens/09-states.png).

## API, tests and known data behavior

The [API endpoint reference](docs/api_endpoints.md) lists request inputs and responses. Run the checks from each application folder:

```bash
cd api && npm test
cd ../web && npm test && npm run build
```

The API also has a database-backed funding integration test (`cd api && npm run test:integration`), which requires a seeded PostgreSQL database and changes demo data. Worker location pings expire after two hours; the Workers map can add fresh pings for a demo. See the [database handover note](docs/handover_note.md) for inherited behavior, verified fixes and remaining verification work.

## Team contributions

The primary ownership areas below are summarized from the [full contribution record](docs/design/contribution.md). Shared components and integration work are described there.

| Team member | Primary area |
| --- | --- |
| Manjeet Singh Seegriwal | Explore, Fund Gig, and database work. |
| Aniket Anand | Escrow, shared web base, and documentation. |
| Adwaith Panicker | Analytics and API/backend. |
| Abhaya Mai Dasari | Workers Map, Reviews, and supporting integration. |

## Repository and submission

- GitHub repo link: [https://github.com/MJT444/newGigTaskUI](https://github.com/MJT444/newGigTaskUI)
- Previously recorded final commit hash: `3f54e92` (update this to the submission commit before handing in).
- Video link: to be added before submission.
