// Workflow 2 + the materialized view, using the inherited database objects as-is:
//   db/sql/06_window_analytics.sql      (ranking, via sql/partA.js)
//   freelancer_lifetime_stats           (materialized view, db/sql/05)
//   refresh_freelancer_lifetime_stats() (inherited CONCURRENTLY refresh)
// The only addition is mv_refresh_log (db/sql/07_ui_support.sql) to remember
// when a refresh happened.
import { Router } from 'express';
import { pool, query } from '../db/postgres.js';
import { asyncHandler, HttpError, optionalNumber, optionalUuid } from '../lib/http.js';
import { loadFreelancer } from '../lib/lookups.js';
import { rankingQuery, SERIES_QUERY } from '../sql/partA.js';

export const analyticsRouter = Router();

const MV = 'freelancer_lifetime_stats';

// GET /api/analytics/ranking?days=30|60|90
// The inherited query (top 50 freelancer-days by 7-day moving average,
// DENSE_RANK), period as a parameter; days=30 = the file exactly. Names joined.
analyticsRouter.get(
  '/ranking',
  asyncHandler(async (req, res) => {
    const days = Math.round(optionalNumber(req.query.days, 'days', { min: 7, max: 365 }) ?? 30);
    const { rows } = await query(
      `SELECT q.freelancer_id, f.name AS freelancer_name, q.revenue_date, q.daily_total,
              q.moving_avg_7d, q.revenue_rank
       FROM (${rankingQuery()}) AS q
       JOIN freelancers f ON f.id = q.freelancer_id
       ORDER BY q.revenue_rank, f.name, q.revenue_date`,
      [days],
    );
    res.json({ days, items: rows });
  }),
);

// GET /api/analytics/revenue?freelancerId=<uuid>&days=7..365
// One freelancer's daily completed revenue and 7-day moving average (the
// inherited formula). Without freelancerId: the rank-1 freelancer of the period.
analyticsRouter.get(
  '/revenue',
  asyncHandler(async (req, res) => {
    const days = Math.round(optionalNumber(req.query.days, 'days', { min: 7, max: 365 }) ?? 90);
    let freelancerId = optionalUuid(req.query.freelancerId, 'freelancerId');

    if (!freelancerId) {
      const top = await query(`SELECT freelancer_id FROM (${rankingQuery()}) q ORDER BY revenue_rank LIMIT 1`, [days]);
      freelancerId = top.rows[0]?.freelancer_id ?? null;
      if (!freelancerId) return res.json({ days, freelancer: null, rank: null, periodRevenue: '0.00', points: [] });
    }

    const f = await loadFreelancer(freelancerId);
    const [series, rank] = await Promise.all([
      query(SERIES_QUERY, [days, f.id]),
      // Best (lowest) DENSE_RANK this freelancer reaches in the full ranking.
      // Same CTEs as the inherited file, without LIMIT 50.
      query(
        `WITH daily_revenue AS (
             SELECT freelancer_id, created_at::date AS revenue_date, SUM(budget) AS daily_total
             FROM contracts
             WHERE status = 'COMPLETED' AND created_at >= now() - make_interval(days => $1::int)
             GROUP BY freelancer_id, created_at::date
         ),
         moving_avg AS (
             SELECT freelancer_id, revenue_date,
                    AVG(daily_total) OVER (PARTITION BY freelancer_id ORDER BY revenue_date
                        RANGE BETWEEN INTERVAL '6 days' PRECEDING AND CURRENT ROW) AS moving_avg_7d
             FROM daily_revenue
         ),
         ranked AS (
             SELECT freelancer_id, DENSE_RANK() OVER (ORDER BY moving_avg_7d DESC) AS revenue_rank
             FROM moving_avg
         )
         SELECT MIN(revenue_rank) AS best_rank FROM ranked WHERE freelancer_id = $2::uuid`,
        [days, f.id],
      ),
    ]);

    const periodRevenue = series.rows.reduce((s, r) => s + Number(r.daily_total), 0).toFixed(2);
    res.json({
      days,
      freelancer: { id: f.id, name: f.name },
      rank: rank.rows[0]?.best_rank ?? null,
      periodRevenue,
      points: series.rows.map((r) => ({
        date: r.revenue_date,
        dailyRevenue: r.daily_total,
        movingAvg7Day: r.moving_avg_7d, // null on days without revenue (inherited semantics)
      })),
    });
  }),
);

async function viewState() {
  const pop = await query('SELECT ispopulated FROM pg_matviews WHERE matviewname = $1', [MV]);
  if (!pop.rows[0]) throw new HttpError(500, 'VIEW_MISSING', `${MV} does not exist. Run db/sql/05_materialized_views.sql.`);
  const last = await query(
    `SELECT refresh_mode, started_at, finished_at FROM mv_refresh_log
     WHERE view_name = $1 ORDER BY finished_at DESC LIMIT 1`,
    [MV],
  );
  return { isPopulated: pop.rows[0].ispopulated, lastRefresh: last.rows[0] || null };
}

// GET /api/analytics/lifetime
// Numbers read from the materialized view + how many COMPLETED contracts are
// not in it yet (why a refresh is needed).
analyticsRouter.get(
  '/lifetime',
  asyncHandler(async (_req, res) => {
    const state = await viewState();
    if (!state.isPopulated) return res.json({ ...state, totals: null, topEarners: [], pendingCompleted: null });

    const [totals, top, live] = await Promise.all([
      query(
        `SELECT COUNT(*) AS freelancers,
                COUNT(*) FILTER (WHERE completed_contracts > 0) AS earning_freelancers,
                COALESCE(SUM(completed_contracts), 0)::BIGINT AS completed_contracts,
                COALESCE(SUM(total_earnings), 0)::DECIMAL(16,2) AS total_earnings,
                COALESCE(ROUND(AVG(total_earnings) FILTER (WHERE completed_contracts > 0), 2), 0) AS avg_earnings,
                COALESCE(MAX(total_earnings), 0) AS max_earnings
         FROM ${MV}`,
      ),
      query(`SELECT freelancer_id, name AS freelancer_name, completed_contracts, total_earnings
             FROM ${MV} ORDER BY total_earnings DESC, name LIMIT 5`),
      query(`SELECT COUNT(*) AS completed FROM contracts WHERE status = 'COMPLETED'`),
    ]);
    res.json({
      ...state,
      totals: totals.rows[0],
      topEarners: top.rows,
      pendingCompleted: Math.max(0, live.rows[0].completed - totals.rows[0].completed_contracts),
    });
  }),
);

// POST /api/analytics/refresh
// Calls the inherited refresh_freelancer_lifetime_stats() (REFRESH ...
// CONCURRENTLY, readers not blocked) and records the time. CONCURRENTLY needs
// a populated view; if it was ever created WITH NO DATA, a plain REFRESH is used.
analyticsRouter.post(
  '/refresh',
  asyncHandler(async (_req, res) => {
    const client = await pool.connect();
    try {
      const { rows } = await client.query('SELECT ispopulated, clock_timestamp() AS started FROM pg_matviews WHERE matviewname = $1', [MV]);
      if (!rows[0]) throw new HttpError(500, 'VIEW_MISSING', `${MV} does not exist.`);
      const mode = rows[0].ispopulated ? 'CONCURRENT' : 'INITIAL';
      if (mode === 'CONCURRENT') await client.query('SELECT refresh_freelancer_lifetime_stats()');
      else await client.query(`REFRESH MATERIALIZED VIEW ${MV}`);
      const log = await client.query(
        `INSERT INTO mv_refresh_log (view_name, refresh_mode, started_at, finished_at)
         VALUES ($1, $2, $3, clock_timestamp())
         RETURNING refresh_mode, started_at, finished_at`,
        [MV, mode, rows[0].started],
      );
      res.json({ refreshed: log.rows[0], ...(await viewState()) });
    } finally {
      client.release();
    }
  }),
);
