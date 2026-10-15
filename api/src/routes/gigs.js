import { Router } from 'express';
import { query, withTransaction } from '../db/postgres.js';
import { asyncHandler, parseMoney, requireUuid } from '../lib/http.js';
import { translatePgError } from '../lib/pgErrors.js';
import { activeContractOf } from './contracts.js';

export const gigsRouter = Router();

// POST /api/gigs/fund  { clientId, freelancerId, budget: "1500.00", startNow: true|false }
//
// Workflow 1. The rules live in the database:
//   fund_gig            locks the client row (FOR UPDATE), checks the escrow
//                       balance, debits it, inserts a FUNDED contract
//   trg_wallet_audit    writes the wallet_audit_logs row for the debit
//   idx_active_gig      partial unique index: one IN_PROGRESS contract per freelancer
//
// fund_gig creates FUNDED contracts, and the partial unique index only covers
// IN_PROGRESS, so funding alone can never hit the "second active gig" rule.
// startNow = true also moves the new contract to IN_PROGRESS in the SAME
// transaction: if the freelancer is busy, the index rejects it and everything
// rolls back - including the debit - which is the failure the brief asks the
// form to explain.
//
// REPEATABLE READ is set by the caller because it cannot be set inside a
// procedure body.
gigsRouter.post(
  '/fund',
  asyncHandler(async (req, res) => {
    const clientId = requireUuid(req.body?.clientId, 'clientId');
    const freelancerId = requireUuid(req.body?.freelancerId, 'freelancerId');
    const budget = parseMoney(req.body?.budget, 'budget');
    const startNow = req.body?.startNow === true;

    try {
      const result = await withTransaction(
        async (db) => {
          const before = await db.query('SELECT escrow_balance FROM clients WHERE id = $1', [clientId]);

          await db.query('CALL fund_gig($1, $2, $3)', [clientId, freelancerId, budget]);

          // fund_gig returns nothing; its contract is the FUNDED one for this
          // client + freelancer created at now() (= this transaction's start).
          const created = await db.query(
            `SELECT id FROM contracts
             WHERE client_id = $1 AND freelancer_id = $2 AND status = 'FUNDED' AND created_at = now()
             ORDER BY id LIMIT 1`,
            [clientId, freelancerId],
          );
          const contractId = created.rows[0]?.id;

          if (startNow && contractId) {
            await db.query(`UPDATE contracts SET status = 'IN_PROGRESS' WHERE id = $1`, [contractId]);
          }

          const contract = await db.query(
            `SELECT k.id, k.client_id, k.freelancer_id, f.name AS freelancer_name,
                    k.budget, k.status, k.created_at
             FROM contracts k JOIN freelancers f ON f.id = k.freelancer_id
             WHERE k.id = $1`,
            [contractId],
          );
          const audit = await db.query(
            `SELECT id, client_id, amount_changed, action_type, balance_after, created_at
             FROM wallet_audit_logs WHERE client_id = $1 AND created_at = now()`,
            [clientId],
          );
          const after = await db.query('SELECT escrow_balance FROM clients WHERE id = $1', [clientId]);

          return {
            balanceBefore: before.rows[0]?.escrow_balance ?? null,
            balanceAfter: after.rows[0]?.escrow_balance ?? null,
            contract: contract.rows[0] || null,
            auditEntry: audit.rows[0] || null,
            startedNow: startNow,
          };
        },
        { isolation: 'REPEATABLE READ' },
      );

      res.status(201).json(result);
    } catch (err) {
      const friendly = translatePgError(err);
      if (!friendly) throw err;

      // Context for the UI, read after the rollback (= real, unchanged values).
      if (friendly.code === 'INSUFFICIENT_BALANCE') {
        const { rows } = await query('SELECT escrow_balance FROM clients WHERE id = $1', [clientId]);
        friendly.details = { balance: rows[0]?.escrow_balance ?? friendly.details?.balance, requested: budget };
      }
      if (friendly.code === 'GIG_ALREADY_IN_PROGRESS') {
        friendly.details = { activeContract: await activeContractOf(freelancerId) };
      }
      throw friendly;
    }
  }),
);
