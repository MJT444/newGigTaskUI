// Translate PostgreSQL errors raised by the INHERITED GigTask objects into
// friendly, specific HttpErrors. Pure function: unit-tested in test/errors.test.js.
//
// Where each error comes from (all verified on PostgreSQL 16, inherited code unchanged):
//   P0001 'Insufficient escrow balance: have X, need Y'   fund_gig (db/sql/04)
//   P0001 'Client <id> not found'                         fund_gig
//   23505 on idx_active_gig                               partial unique index (db/sql/02):
//                                                         freelancer already has an IN_PROGRESS contract
//   23503 contracts_freelancer_id_fkey                    fund_gig with an unknown freelancer
//   23514 contracts_budget_check                          fund_gig with budget <= 0
//   23514 clients_escrow_balance_check                    balance would go below 0
//   22003 numeric overflow                                amount exceeds DECIMAL(10,2)
//   40001 / 40P01                                         concurrent update under REPEATABLE READ
// ("Freelancer not found", "greater than 0" and P0002 are also handled, for
//  robustness, but the inherited procedures do not raise them.)
import { HttpError } from './http.js';

const INSUFFICIENT_RE = /Insufficient escrow balance: have ([\d.]+), need ([\d.]+)/i;

export function translatePgError(err) {
  if (!err || typeof err.code !== 'string') return null;
  const msg = err.message || '';

  switch (err.code) {
    case 'P0001': {
      const m = msg.match(INSUFFICIENT_RE);
      if (m) {
        return new HttpError(
          409,
          'INSUFFICIENT_BALANCE',
          'Not enough money in escrow to fund this gig. Nothing was charged.',
          { balance: m[1], requested: m[2] },
        );
      }
      if (/^Client .* not found/i.test(msg)) return new HttpError(404, 'CLIENT_NOT_FOUND', 'That client does not exist.');
      if (/^Freelancer .* not found/i.test(msg)) {
        return new HttpError(404, 'FREELANCER_NOT_FOUND', 'That freelancer does not exist.');
      }
      if (/greater than 0/i.test(msg)) return new HttpError(400, 'INVALID_AMOUNT', msg);
      return new HttpError(400, 'RULE_VIOLATION', msg);
    }

    case '23505':
      if (err.constraint === 'idx_active_gig') {
        return new HttpError(
          409,
          'GIG_ALREADY_IN_PROGRESS',
          'This freelancer is already working on another gig. A freelancer can have only one gig in progress at a time.',
        );
      }
      return new HttpError(409, 'DUPLICATE', 'This record already exists.');

    case '23503':
      if (err.constraint === 'contracts_freelancer_id_fkey') {
        return new HttpError(404, 'FREELANCER_NOT_FOUND', 'That freelancer does not exist.');
      }
      if (err.constraint === 'contracts_client_id_fkey') {
        return new HttpError(404, 'CLIENT_NOT_FOUND', 'That client does not exist.');
      }
      return new HttpError(409, 'REFERENCE_ERROR', 'A related record does not exist.');

    case '23514':
      if (err.constraint === 'contracts_budget_check') {
        return new HttpError(400, 'INVALID_AMOUNT', 'Budget must be greater than 0.');
      }
      if (err.constraint === 'clients_escrow_balance_check') {
        return new HttpError(409, 'INSUFFICIENT_BALANCE', 'Escrow balance cannot go below 0. Nothing was charged.');
      }
      return new HttpError(400, 'CHECK_VIOLATION', `Rejected by database rule ${err.constraint || ''}`.trim());

    case '22003':
      return new HttpError(400, 'AMOUNT_TOO_LARGE', 'That amount is too large (escrow holds at most 99,999,999.99).');

    case 'P0002':
      return new HttpError(409, 'INVALID_STATUS_TRANSITION', msg);

    case '40001':
    case '40P01':
      return new HttpError(
        409,
        'CONCURRENT_UPDATE',
        'This escrow balance was changed by another request at the same moment. Please try again.',
      );

    case '22P02':
      return new HttpError(400, 'INVALID_INPUT', 'One of the values has the wrong format.');

    default:
      return null;
  }
}
