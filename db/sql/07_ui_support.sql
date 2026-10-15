-- GigTask | Assignment 2 UI support (ADDITIVE ONLY)
--
-- Nothing inherited is changed. This adds one small table because the
-- Analytics screen must show when freelancer_lifetime_stats was last
-- refreshed, and PostgreSQL does not record refresh times anywhere.
-- The API calls the inherited refresh_freelancer_lifetime_stats() and then
-- inserts one row here.
--
-- Run after 01-05. Safe to re-run.

CREATE TABLE IF NOT EXISTS mv_refresh_log (
    id BIGSERIAL PRIMARY KEY,
    view_name TEXT NOT NULL,
    refresh_mode TEXT NOT NULL CHECK (refresh_mode IN ('INITIAL', 'CONCURRENT')),
    started_at TIMESTAMPTZ NOT NULL,
    finished_at TIMESTAMPTZ NOT NULL
);
