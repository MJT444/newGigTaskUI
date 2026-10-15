// Cross-database helpers. MongoDB documents store the PostgreSQL freelancers.id
// UUID as a string in freelancer_id (the inherited link between the stores),
// so names and live status come from PostgreSQL in ONE query per response.
import { query } from '../db/postgres.js';
import { HttpError, requireUuid } from './http.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Map freelancer_id -> { name, is_available, in_progress_contract_id }.
 * Ids that are not UUIDs are skipped instead of failing the whole request.
 */
export async function freelancerInfo(ids) {
  const unique = [...new Set(ids.filter((id) => typeof id === 'string' && UUID_RE.test(id)))];
  if (unique.length === 0) return new Map();
  const { rows } = await query(
    `SELECT f.id, f.name, f.is_available, c.id AS in_progress_contract_id
     FROM freelancers f
     LEFT JOIN contracts c ON c.freelancer_id = f.id AND c.status = 'IN_PROGRESS'
     WHERE f.id = ANY($1::uuid[])`,
    [unique],
  );
  return new Map(rows.map((r) => [r.id, r]));
}

export async function loadFreelancer(id) {
  requireUuid(id, 'freelancer id');
  const { rows } = await query(
    `SELECT f.id, f.name, f.latitude, f.longitude, f.is_available,
            c.id AS in_progress_contract_id
     FROM freelancers f
     LEFT JOIN contracts c ON c.freelancer_id = f.id AND c.status = 'IN_PROGRESS'
     WHERE f.id = $1`,
    [id],
  );
  if (!rows[0]) throw new HttpError(404, 'FREELANCER_NOT_FOUND', 'That freelancer does not exist.');
  return rows[0];
}

export async function loadClient(id) {
  requireUuid(id, 'client id');
  const { rows } = await query('SELECT id, name, escrow_balance FROM clients WHERE id = $1', [id]);
  if (!rows[0]) throw new HttpError(404, 'CLIENT_NOT_FOUND', 'That client does not exist.');
  return rows[0];
}
