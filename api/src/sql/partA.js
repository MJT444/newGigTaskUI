// Workflow 2 for the Analytics screen, built from the inherited file
// db/sql/06_window_analytics.sql - which is NOT modified.
//
//  rankingQuery()   = the file's exact text, wrapped as a subquery, with ONE
//                     substitution: the fixed "INTERVAL '30 days'" becomes the
//                     parameter $1 (days), so the UI can offer 30/60/90 days.
//                     With days = 30 the result is identical to running the file.
//  seriesQuery()    = the same daily_revenue + moving_avg CTEs and the same
//                     RANGE ... 6 days window, for ONE freelancer ($2) and without
//                     the global LIMIT 50, so a chart can be drawn. A calendar is
//                     joined only to place the points on an x-axis; the moving
//                     average values are exactly the inherited formula's.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from '../config.js';

const PERIOD = "INTERVAL '30 days'";

/** Strip full-line comments + trailing semicolon; parameterize the period. Pure: unit-tested. */
export function toRankingSubquery(sqlText) {
  const body = sqlText
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
    .trim()
    .replace(/;\s*$/, '');
  if (body.includes(';')) throw new Error('Expected a single SQL statement in 06_window_analytics.sql');
  const count = body.split(PERIOD).length - 1;
  if (count !== 1) throw new Error(`Expected exactly one ${PERIOD} in 06_window_analytics.sql, found ${count}`);
  return body.replace(PERIOD, 'make_interval(days => $1::int)');
}

let cached = null;

export function rankingQuery() {
  if (!cached) {
    const file = path.join(REPO_ROOT, 'db', 'sql', '06_window_analytics.sql');
    cached = toRankingSubquery(readFileSync(file, 'utf8'));
  }
  return cached;
}

/**
 * One freelancer's series. $1 = days, $2 = freelancer id.
 * Same CTEs and window as the inherited query (only the freelancer filter is
 * added and LIMIT 50 removed). Output: one row per calendar day; daily_total
 * is 0 and moving_avg_7d NULL on days without completed revenue, because the
 * inherited window only produces rows for days that had revenue.
 */
export const SERIES_QUERY = `
  WITH daily_revenue AS (
      SELECT freelancer_id,
             created_at::date AS revenue_date,
             SUM(budget) AS daily_total
      FROM contracts
      WHERE status = 'COMPLETED'
        AND created_at >= now() - make_interval(days => $1::int)
        AND freelancer_id = $2::uuid
      GROUP BY freelancer_id, created_at::date
  ),
  moving_avg AS (
      SELECT freelancer_id,
             revenue_date,
             daily_total,
             AVG(daily_total) OVER (
                 PARTITION BY freelancer_id
                 ORDER BY revenue_date
                 RANGE BETWEEN INTERVAL '6 days' PRECEDING AND CURRENT ROW
             ) AS moving_avg_7d
      FROM daily_revenue
  )
  SELECT g.d::date AS revenue_date,
         COALESCE(m.daily_total, 0)::DECIMAL(12,2) AS daily_total,
         ROUND(m.moving_avg_7d, 2) AS moving_avg_7d
  FROM generate_series((now() - make_interval(days => $1::int))::date, now()::date, INTERVAL '1 day') AS g(d)
  LEFT JOIN moving_avg m ON m.revenue_date = g.d::date
  ORDER BY 1`;
