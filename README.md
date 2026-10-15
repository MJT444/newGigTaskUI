# GigTask UI

This repository carries forward the [GigTask database project](https://github.com/MohitSharma25/GitTask) and its commit history. The application folders are ready for the API and web frontend.

| Folder | Contents |
| --- | --- |
| `db/` | PostgreSQL schema and workflows, MongoDB scripts, data generators, performance results, and database documentation. |
| `api/` | Reserved for the API layer. |
| `web/` | Reserved for the web frontend. |

The original database setup instructions are in [`db/README.md`](db/README.md). Run its relative commands from the `db/` directory. `db/sql/07_ui_support.sql` is an additive table for recording materialized-view refresh times in the future UI; files `01`–`06` are inherited from the original project.
