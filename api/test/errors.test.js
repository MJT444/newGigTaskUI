// The Fund gig form switches on these codes. Error shapes are copied from
// what the GigTask procedures and constraints really raise on PostgreSQL 16.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { translatePgError } from '../src/lib/pgErrors.js';

test('insufficient escrow balance (fund_gig) keeps the numbers', () => {
  const e = translatePgError({ code: 'P0001', message: 'Insufficient escrow balance: have 800.00, need 99999' });
  assert.equal(e.status, 409);
  assert.equal(e.code, 'INSUFFICIENT_BALANCE');
  assert.deepEqual(e.details, { balance: '800.00', requested: '99999' });
  assert.match(e.message, /Nothing was charged/);
});

test('freelancer already has a gig in progress (idx_active_gig)', () => {
  const e = translatePgError({
    code: '23505',
    constraint: 'idx_active_gig',
    message: 'duplicate key value violates unique constraint "idx_active_gig"',
  });
  assert.equal(e.status, 409);
  assert.equal(e.code, 'GIG_ALREADY_IN_PROGRESS');
});

test('other unique violations are not reported as busy freelancers', () => {
  assert.equal(translatePgError({ code: '23505', constraint: 'other', message: 'dup' }).code, 'DUPLICATE');
});

test('unknown client / freelancer, from fund_gig messages or foreign keys', () => {
  assert.equal(translatePgError({ code: 'P0001', message: 'Client 123 not found' }).code, 'CLIENT_NOT_FOUND');
  assert.equal(translatePgError({ code: 'P0001', message: 'Freelancer 123 not found' }).code, 'FREELANCER_NOT_FOUND');
  assert.equal(
    translatePgError({ code: '23503', constraint: 'contracts_freelancer_id_fkey', message: 'fk' }).code,
    'FREELANCER_NOT_FOUND',
  );
});

test('bad budget from the new check or the inherited CHECK constraint', () => {
  assert.equal(translatePgError({ code: 'P0001', message: 'Budget must be greater than 0' }).code, 'INVALID_AMOUNT');
  assert.equal(
    translatePgError({ code: '23514', constraint: 'contracts_budget_check', message: 'check' }).code,
    'INVALID_AMOUNT',
  );
});

test('backwards status, overflow, concurrency', () => {
  assert.equal(
    translatePgError({ code: 'P0002', message: 'Contract status cannot move backwards (COMPLETED -> FUNDED)' }).code,
    'INVALID_STATUS_TRANSITION',
  );
  assert.equal(translatePgError({ code: '22003', message: 'numeric field overflow' }).code, 'AMOUNT_TOO_LARGE');
  assert.equal(translatePgError({ code: '40001', message: 'could not serialize' }).code, 'CONCURRENT_UPDATE');
});

test('unknown errors are passed through, not swallowed', () => {
  assert.equal(translatePgError({ code: 'XX000', message: 'internal' }), null);
  assert.equal(translatePgError(new Error('plain')), null);
});
