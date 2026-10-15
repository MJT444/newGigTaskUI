import { Router } from 'express';
import { query, withTransaction } from '../db/postgres.js';
import {
  asyncHandler,
  HttpError,
  optionalDate,
  paged,
  parseMoney,
  parsePagination,
  requireUuid,
} from '../lib/http.js';
import { loadClient } from '../lib/lookups.js';

export const clientsRouter = Router();

// GET /api/clients?search=&page=&pageSize=
// One page at a time. active_contracts = FUNDED + IN_PROGRESS for that client
// (uses idx_contracts_client_created).
clientsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const pg = parsePagination(req.query);
    const search = (req.query.search || '').trim();
    const pattern = search ? `%${search}%` : null;

    const [rows, count] = await Promise.all([
      query(
        `SELECT c.id, c.name, c.escrow_balance,
                (SELECT COUNT(*) FROM contracts k
                 WHERE k.client_id = c.id AND k.status IN ('FUNDED', 'IN_PROGRESS')) AS active_contracts
         FROM clients c
         WHERE ($1::text IS NULL OR c.name ILIKE $1)
         ORDER BY c.name, c.id
         LIMIT $2 OFFSET $3`,
        [pattern, pg.limit, pg.offset],
      ),
      query('SELECT COUNT(*) AS total FROM clients WHERE ($1::text IS NULL OR name ILIKE $1)', [pattern]),
    ]);
    res.json(paged(rows.rows, count.rows[0].total, pg));
  }),
);

// GET /api/clients/:id  - detail + contract statistics
clientsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const client = await loadClient(req.params.id);
    const { rows } = await query(
      `SELECT COUNT(*) AS total_contracts,
              COUNT(*) FILTER (WHERE status = 'FUNDED') AS funded,
              COUNT(*) FILTER (WHERE status = 'IN_PROGRESS') AS in_progress,
              COUNT(*) FILTER (WHERE status = 'COMPLETED') AS completed,
              COALESCE(SUM(budget), 0)::DECIMAL(14,2) AS total_budget,
              MAX(created_at) AS last_contract_at
       FROM contracts WHERE client_id = $1`,
      [client.id],
    );
    res.json({ ...client, stats: rows[0] });
  }),
);

// POST /api/clients/:id/topup  { amount }
// Demo helper: a plain UPDATE of escrow_balance. The inherited trigger
// trg_wallet_audit writes the CREDIT audit row; we read it back to show it.
clientsRouter.post(
  '/:id/topup',
  asyncHandler(async (req, res) => {
    const id = requireUuid(req.params.id, 'client id');
    const amount = parseMoney(req.body?.amount);
    if (Number(amount) <= 0) throw new HttpError(400, 'INVALID_AMOUNT', 'Top-up amount must be greater than 0.');

    const result = await withTransaction(async (db) => {
      const before = await db.query('SELECT escrow_balance FROM clients WHERE id = $1 FOR UPDATE', [id]);
      if (!before.rows[0]) throw new HttpError(404, 'CLIENT_NOT_FOUND', 'That client does not exist.');
      const after = await db.query(
        'UPDATE clients SET escrow_balance = escrow_balance + $2 WHERE id = $1 RETURNING escrow_balance',
        [id, amount],
      );
      // The trigger's created_at defaults to now() = this transaction's start time.
      const audit = await db.query(
        `SELECT id, client_id, amount_changed, action_type, balance_after, created_at
         FROM wallet_audit_logs WHERE client_id = $1 AND created_at = now()`,
        [id],
      );
      return {
        balanceBefore: before.rows[0].escrow_balance,
        balanceAfter: after.rows[0].escrow_balance,
        auditEntry: audit.rows[0] || null,
      };
    });
    res.status(201).json(result);
  }),
);

// GET /api/clients/:id/audit?from=YYYY-MM-DD&to=YYYY-MM-DD&page=&pageSize=
//
// Read-only wallet_audit_logs with a running balance.
//   amount_changed is SIGNED (the trigger stores NEW - OLD; debits negative).
//   The running balance is anchored at the client's CURRENT escrow_balance and
//   walks back through history:
//       running_balance(row) = current balance - SUM(amount_changed of all LATER rows)
//   so the newest row always equals today's real balance. The window runs over
//   the whole history before the date filter, so any filtered range is correct.
//   consistent = running_balance equals the balance_after stored at the time.
//   Rows written by the trigger (e.g. funding in the UI) match; the inherited
//   seeder's 100k synthetic rows have unrelated random balance_after values,
//   so they generally do not (documented in docs/handover_note.md).
clientsRouter.get(
  '/:id/audit',
  asyncHandler(async (req, res) => {
    const client = await loadClient(req.params.id);
    const from = optionalDate(req.query.from, 'from');
    const to = optionalDate(req.query.to, 'to');
    if (from && to && from > to) {
      throw new HttpError(400, 'INVALID_DATE_RANGE', '"from" must be on or before "to"');
    }
    const pg = parsePagination(req.query, { defaultPageSize: 25 });

    const { rows } = await query(
      `WITH ledger AS (
         SELECT l.id, l.created_at, l.action_type, l.amount_changed, l.balance_after,
                ROW_NUMBER() OVER (ORDER BY l.created_at, l.id) AS seq
         FROM wallet_audit_logs l
         WHERE l.client_id = $1
       ),
       running AS (
         SELECT ledger.*,
                $6::numeric - COALESCE(SUM(amount_changed) OVER (
                    ORDER BY seq ROWS BETWEEN 1 FOLLOWING AND UNBOUNDED FOLLOWING), 0) AS running_balance
         FROM ledger
       ),
       filtered AS (
         SELECT * FROM running
         WHERE ($2::date IS NULL OR created_at >= $2::date)
           AND ($3::date IS NULL OR created_at < $3::date + 1)
       )
       SELECT id, seq, created_at, action_type, amount_changed, balance_after, running_balance,
              (running_balance = balance_after) AS consistent,
              COUNT(*) OVER () AS total_count,
              COALESCE(SUM(-amount_changed) FILTER (WHERE amount_changed < 0) OVER (), 0) AS total_debits,
              COALESCE(SUM(amount_changed) FILTER (WHERE amount_changed > 0) OVER (), 0) AS total_credits,
              BOOL_AND(running_balance = balance_after) OVER () AS all_consistent,
              COUNT(*) FILTER (WHERE running_balance = balance_after) OVER () AS matching_rows
       FROM filtered
       ORDER BY seq DESC
       LIMIT $4 OFFSET $5`,
      [client.id, from, to, pg.limit, pg.offset, client.escrow_balance],
    );

    let summary;
    let total;
    if (rows[0]) {
      total = rows[0].total_count;
      summary = {
        totalDebits: rows[0].total_debits,
        totalCredits: rows[0].total_credits,
        allConsistent: rows[0].all_consistent,
        matchingRows: rows[0].matching_rows,
      };
    } else {
      // Page past the end, or nothing in range: still report the range totals.
      const s = await query(
        `SELECT COUNT(*) AS total,
                COALESCE(SUM(-amount_changed) FILTER (WHERE amount_changed < 0), 0) AS total_debits,
                COALESCE(SUM(amount_changed) FILTER (WHERE amount_changed > 0), 0) AS total_credits
         FROM wallet_audit_logs
         WHERE client_id = $1
           AND ($2::date IS NULL OR created_at >= $2::date)
           AND ($3::date IS NULL OR created_at < $3::date + 1)`,
        [client.id, from, to],
      );
      total = s.rows[0].total;
      summary = { totalDebits: s.rows[0].total_debits, totalCredits: s.rows[0].total_credits, allConsistent: null, matchingRows: 0 };
    }

    const items = rows.map(({ total_count, total_debits, total_credits, all_consistent, matching_rows, ...r }) => r);
    res.json({ client, filter: { from, to }, summary, ...paged(items, total, pg) });
  }),
);
