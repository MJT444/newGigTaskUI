import { Router } from 'express';
import { query } from '../db/postgres.js';
import {
  asyncHandler,
  HttpError,
  optionalUuid,
  paged,
  parsePagination,
  requireUuid,
} from '../lib/http.js';
import { translatePgError } from '../lib/pgErrors.js';

export const CONTRACT_STATUSES = ['FUNDED', 'IN_PROGRESS', 'COMPLETED'];

export const contractsRouter = Router();

const COLUMNS = `
  k.id, k.client_id, c.name AS client_name, k.freelancer_id, f.name AS freelancer_name,
  k.budget, k.status, k.created_at`;

// GET /api/contracts?clientId=&freelancerId=&status=&page=&pageSize=
// Newest first. Filters by client use the inherited idx_contracts_client; the
// rest are fast enough at 50,000 rows without extra indexes.
contractsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const pg = parsePagination(req.query);
    const clientId = optionalUuid(req.query.clientId, 'clientId');
    const freelancerId = optionalUuid(req.query.freelancerId, 'freelancerId');
    const status = req.query.status ? String(req.query.status).toUpperCase() : null;
    if (status && !CONTRACT_STATUSES.includes(status)) {
      throw new HttpError(400, 'INVALID_STATUS', `status must be one of ${CONTRACT_STATUSES.join(', ')}`);
    }

    const where = `($1::uuid IS NULL OR k.client_id = $1)
               AND ($2::uuid IS NULL OR k.freelancer_id = $2)
               AND ($3::text IS NULL OR k.status = $3)`;
    const filters = [clientId, freelancerId, status];

    const [rows, count] = await Promise.all([
      query(
        `SELECT ${COLUMNS}
         FROM contracts k
         JOIN clients c ON c.id = k.client_id
         JOIN freelancers f ON f.id = k.freelancer_id
         WHERE ${where}
         ORDER BY k.created_at DESC, k.id
         LIMIT $4 OFFSET $5`,
        [...filters, pg.limit, pg.offset],
      ),
      query(`SELECT COUNT(*) AS total FROM contracts k WHERE ${where}`, filters),
    ]);
    res.json(paged(rows.rows, count.rows[0].total, pg));
  }),
);

export async function loadContract(id) {
  const { rows } = await query(
    `SELECT ${COLUMNS}
     FROM contracts k
     JOIN clients c ON c.id = k.client_id
     JOIN freelancers f ON f.id = k.freelancer_id
     WHERE k.id = $1`,
    [id],
  );
  if (!rows[0]) throw new HttpError(404, 'CONTRACT_NOT_FOUND', 'That contract does not exist.');
  return rows[0];
}

/** The IN_PROGRESS contract that blocks a freelancer, for error details. */
export async function activeContractOf(freelancerId) {
  const { rows } = await query(
    `SELECT ${COLUMNS}
     FROM contracts k
     JOIN clients c ON c.id = k.client_id
     JOIN freelancers f ON f.id = k.freelancer_id
     WHERE k.freelancer_id = $1 AND k.status = 'IN_PROGRESS'`,
    [freelancerId],
  );
  return rows[0] || null;
}

// GET /api/contracts/:id
contractsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    res.json(await loadContract(requireUuid(req.params.id, 'contract id')));
  }),
);

// PATCH /api/contracts/:id/status  { status: "IN_PROGRESS" | "COMPLETED" }
//
// FUNDED -> IN_PROGRESS is where the inherited partial unique index
// idx_active_gig applies: one IN_PROGRESS contract per freelancer.
// Statuses only move forward. The database allows any change, so the API
// enforces it in the UPDATE itself (atomic: the WHERE only matches rows whose
// current status is earlier), without changing the schema.
const EARLIER = { IN_PROGRESS: ['FUNDED'], COMPLETED: ['FUNDED', 'IN_PROGRESS'], FUNDED: [] };

contractsRouter.patch(
  '/:id/status',
  asyncHandler(async (req, res) => {
    const id = requireUuid(req.params.id, 'contract id');
    const status = String(req.body?.status || '').toUpperCase();
    if (!CONTRACT_STATUSES.includes(status)) {
      throw new HttpError(400, 'INVALID_STATUS', `status must be one of ${CONTRACT_STATUSES.join(', ')}`);
    }

    try {
      const { rowCount } = await query(
        'UPDATE contracts SET status = $2 WHERE id = $1 AND status = ANY($3::text[])',
        [id, status, EARLIER[status]],
      );
      if (rowCount === 0) {
        const { rows } = await query('SELECT status FROM contracts WHERE id = $1', [id]);
        if (!rows[0]) throw new HttpError(404, 'CONTRACT_NOT_FOUND', 'That contract does not exist.');
        throw new HttpError(
          409,
          'INVALID_STATUS_TRANSITION',
          `Contract status cannot move from ${rows[0].status} to ${status}; statuses only move forward.`,
        );
      }
    } catch (err) {
      if (err instanceof HttpError) throw err;
      const friendly = translatePgError(err);
      if (!friendly) throw err;
      if (friendly.code === 'GIG_ALREADY_IN_PROGRESS') {
        const { rows } = await query('SELECT freelancer_id FROM contracts WHERE id = $1', [id]);
        friendly.details = { activeContract: rows[0] ? await activeContractOf(rows[0].freelancer_id) : null };
      }
      throw friendly;
    }

    res.json(await loadContract(id));
  }),
);
