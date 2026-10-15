import { Router } from 'express';
import { query } from '../db/postgres.js';
import { getMongoDb } from '../db/mongo.js';
import { asyncHandler, paged, parsePagination } from '../lib/http.js';
import { loadFreelancer } from '../lib/lookups.js';

export const freelancersRouter = Router();

// GET /api/freelancers?search=&available=true|false&page=&pageSize=
// "Available" means able to start a gig: marked available and without an
// IN_PROGRESS contract. The inverse includes unavailable and busy workers.
freelancersRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const pg = parsePagination(req.query);
    const search = (req.query.search || '').trim();
    const pattern = search ? `%${search}%` : null;
    const available = req.query.available === 'true' ? true : req.query.available === 'false' ? false : null;

    const canStart = `f.is_available AND NOT EXISTS (
      SELECT 1 FROM contracts active
      WHERE active.freelancer_id = f.id AND active.status = 'IN_PROGRESS'
    )`;
    const where = `($1::text IS NULL OR f.name ILIKE $1)
                   AND ($2::boolean IS NULL OR (${canStart}) = $2)`;
    const [rows, count] = await Promise.all([
      query(
        `SELECT f.id, f.name, f.latitude, f.longitude, f.is_available,
                c.id AS in_progress_contract_id
         FROM freelancers f
         LEFT JOIN contracts c ON c.freelancer_id = f.id AND c.status = 'IN_PROGRESS'
         WHERE ${where}
         ORDER BY f.name, f.id
         LIMIT $3 OFFSET $4`,
        [pattern, available, pg.limit, pg.offset],
      ),
      query(`SELECT COUNT(*) AS total FROM freelancers f WHERE ${where}`, [pattern, available]),
    ]);
    res.json(paged(rows.rows, count.rows[0].total, pg));
  }),
);

// GET /api/freelancers/:id
// Live numbers from contracts, plus the same numbers from the materialized
// view (which can be stale until it is refreshed - shown side by side).
freelancersRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const f = await loadFreelancer(req.params.id);
    const [live, mv] = await Promise.all([
      query(
        `SELECT COUNT(*) AS total_contracts,
                COUNT(*) FILTER (WHERE status = 'FUNDED') AS funded,
                COUNT(*) FILTER (WHERE status = 'COMPLETED') AS completed,
                COALESCE(SUM(budget) FILTER (WHERE status = 'COMPLETED'), 0)::DECIMAL(14,2) AS earnings
         FROM contracts WHERE freelancer_id = $1`,
        [f.id],
      ),
      query(
        'SELECT completed_contracts, total_earnings FROM freelancer_lifetime_stats WHERE freelancer_id = $1',
        [f.id],
      ),
    ]);
    res.json({ ...f, stats: live.rows[0], lifetimeStatsView: mv.rows[0] || null });
  }),
);

// GET /api/freelancers/:id/portfolio  - the flexible Portfolios document
// Optional fields (certifications, years_experience, bio, hourly_rate,
// languages) are present on some documents and missing on others.
freelancersRouter.get(
  '/:id/portfolio',
  asyncHandler(async (req, res) => {
    const f = await loadFreelancer(req.params.id);
    const db = await getMongoDb();
    const portfolio = await db.collection('Portfolios').findOne({ freelancer_id: f.id });
    const optional = ['certifications', 'years_experience', 'bio', 'hourly_rate', 'languages'];
    res.json({
      freelancer: { id: f.id, name: f.name },
      portfolio,
      presentOptionalFields: portfolio ? optional.filter((k) => portfolio[k] !== undefined) : [],
      missingOptionalFields: portfolio ? optional.filter((k) => portfolio[k] === undefined) : optional,
    });
  }),
);
