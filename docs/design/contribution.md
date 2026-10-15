# Team Contributions — GigTask

This document records each team member’s primary implementation responsibilities for the GigTask project. Contributions include application screens, backend/API or database work, shared infrastructure, documentation, and integration.

## Team Contribution Summary

| Team member                 | Primary contributions                                                                                                     | Files / areas associated with the work                                                                                                                                                        |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Manjeet Singh Seegriwal** | Implemented **Explore** and **Fund Gig** (Screens 1–2), and contributed the database work.                                | `web/src/pages/BrowsePage.jsx`, `web/src/pages/DetailPages.jsx`, `web/src/pages/FundGigPage.jsx`, related tests and components; database work under `db/` and related database support files. |
| **Aniket Anand**            | Implemented the **Escrow** screen (Screen 3), and contributed the shared web base and project documentation.              | `web/src/pages/EscrowPage.jsx`; shared web setup and components under `web/src/`; project documentation under `docs/`; related layout and shared UI files.                                    |
| **Adwaith Panicker**        | Implemented the **Analytics** screen (Screen 4), and contributed the API/backend folder.                                  | `web/src/pages/AnalyticsPage.jsx`; `api/`, including API routes and supporting backend modules.                                                                                               |
| **Abhaya Mai Dasari**       | Implemented **Workers Map** and **Reviews** (Screens 5–6), and contributed the remaining integration and supporting work. | `web/src/pages/WorkersMapPage.jsx`, `web/src/pages/ReviewsPage.jsx`, MongoDB/geospatial components and routes, related tests, and other supporting integration work.                          |

## Contribution Details

### 1. Manjeet Singh Seegriwal — Explore, Fund Gig, and Database

- Developed the Explore/browse experience for discovering clients and freelancers.
- Developed the Fund Gig screen and its user-facing workflow.
- Contributed the project’s database implementation.
- Contributed related screen components and tests.

**Main areas:** `web/src/pages/BrowsePage.jsx`, `web/src/pages/DetailPages.jsx`, `web/src/pages/FundGigPage.jsx`, related UI/test files, and `db/`.

### 2. Aniket Anand — Escrow, Shared Web Base, and Documentation

- Developed the Escrow screen and its transaction-history interface.
- Set up and contributed shared web infrastructure used across screens.
- Contributed shared layout, styling, UI components, API client utilities, and tests.
- Prepared project documentation and design/handover guides.

**Main areas:** `web/src/pages/EscrowPage.jsx`, shared files under `web/src/`, and documentation under `docs/`.

### 3. Adwaith Panicker — Analytics and API/Backend

- Developed the Analytics screen and its visual presentation of revenue data.
- Contributed the API/backend implementation used by the application.
- Worked on analytics routes and supporting SQL/query integration.

**Main areas:** `web/src/pages/AnalyticsPage.jsx`, `api/`, including `api/src/routes/analytics.js` and `api/src/sql/partA.js`.

### 4. Abhaya Mai Dasari — Workers Map, Reviews, and Supporting Integration

- Developed the Workers Map screen.
- Developed the Reviews screen.
- Contributed MongoDB/geospatial functionality and supporting API routes.
- Contributed related tests and remaining integration/supporting work.

**Main areas:** `web/src/pages/WorkersMapPage.jsx`, `web/src/pages/ReviewsPage.jsx`, `web/src/components/mongo/`, MongoDB-related modules and routes under `api/src/`, and related tests.

## Shared Project Work

The project also contains shared infrastructure and integration work, including:

- Application layout, navigation, styling, and reusable UI components.
- API client/configuration and server-side route integration.
- Database schemas, indexes, queries, and supporting scripts.
- Tests, setup scripts, and project documentation.
- Integration of the individual screens into one application.

These shared areas should be attributed to the team members who actually implemented or maintained each part; the table above identifies the primary ownership areas rather than claiming that every file was written by one person.

## Contribution Statement

Each member had a defined primary area of responsibility spanning application functionality and supporting implementation. The contribution record is intended to make those responsibilities transparent. Please ensure the final repository history, code, and any required individual contribution evidence accurately reflect the work performed by each member.
