// End-to-end tests against a RUNNING API with seeded databases.
//   1. npm start            (in api/)
//   2. npm run test:integration
// Target another server with API_URL=http://host:port.
//
// They change data on purpose (fund, start, complete contracts for one test
// client) to prove fund_gig, the audit trigger and the partial unique index
// behave correctly through the HTTP layer.
import { before, describe, test } from 'node:test';
import assert from 'node:assert/strict';

const API = process.env.API_URL || 'http://localhost:4000';

async function call(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

let client;
let freelancer;

before(async () => {
  const health = await call('GET', '/api/health');
  assert.equal(health.status, 200, `API or a database is down: ${JSON.stringify(health.body)}`);

  // Richest client on page 1, so the escrow can cover the test gigs.
  const clients = await call('GET', '/api/clients?pageSize=50');
  client = clients.body.items.sort((a, b) => Number(b.escrow_balance) - Number(a.escrow_balance))[0];
  // A free freelancer (available, no gig in progress).
  const fl = await call('GET', '/api/freelancers?available=true&pageSize=100');
  freelancer = fl.body.items.find((f) => !f.in_progress_contract_id);
  assert.ok(client && freelancer, 'seed data missing');
  await call('POST', `/api/clients/${client.id}/topup`, { amount: '1000' });
});

describe('Workflow 1: fund a gig', () => {
  let started;

  test('fund + start: escrow debited, IN_PROGRESS contract, audit row from the trigger', async () => {
    const r = await call('POST', '/api/gigs/fund', { clientId: client.id, freelancerId: freelancer.id, budget: '12.34', startNow: true });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const { balanceBefore, balanceAfter, contract, auditEntry } = r.body;
    assert.equal((Number(balanceBefore) - Number(balanceAfter)).toFixed(2), '12.34');
    assert.equal(contract.status, 'IN_PROGRESS');
    assert.equal(auditEntry.action_type, 'DEBIT');
    assert.equal(auditEntry.amount_changed, '-12.34');
    assert.equal(auditEntry.balance_after, balanceAfter);
    started = contract;
  });

  test('second gig in progress for the same freelancer is refused and nothing is charged', async () => {
    const before = (await call('GET', `/api/clients/${client.id}`)).body.escrow_balance;
    const r = await call('POST', '/api/gigs/fund', { clientId: client.id, freelancerId: freelancer.id, budget: '5', startNow: true });
    assert.equal(r.status, 409);
    assert.equal(r.body.error.code, 'GIG_ALREADY_IN_PROGRESS');
    assert.equal(r.body.error.details.activeContract.id, started.id);
    const after = (await call('GET', `/api/clients/${client.id}`)).body.escrow_balance;
    assert.equal(after, before, 'the debit inside fund_gig must be rolled back');
  });

  test('funding without starting still works for a busy freelancer (FUNDED is not "active")', async () => {
    const r = await call('POST', '/api/gigs/fund', { clientId: client.id, freelancerId: freelancer.id, budget: '1', startNow: false });
    assert.equal(r.status, 201);
    assert.equal(r.body.contract.status, 'FUNDED');
    const start = await call('PATCH', `/api/contracts/${r.body.contract.id}/status`, { status: 'IN_PROGRESS' });
    assert.equal(start.status, 409);
    assert.equal(start.body.error.code, 'GIG_ALREADY_IN_PROGRESS');
    // finish the first, then the second can start
    assert.equal((await call('PATCH', `/api/contracts/${started.id}/status`, { status: 'COMPLETED' })).status, 200);
    assert.equal((await call('PATCH', `/api/contracts/${r.body.contract.id}/status`, { status: 'IN_PROGRESS' })).status, 200);
    await call('PATCH', `/api/contracts/${r.body.contract.id}/status`, { status: 'COMPLETED' });
  });

  test('status cannot move backwards', async () => {
    const r = await call('PATCH', `/api/contracts/${started.id}/status`, { status: 'FUNDED' });
    assert.equal(r.status, 409);
    assert.equal(r.body.error.code, 'INVALID_STATUS_TRANSITION');
  });

  test('insufficient escrow is reported with the real balance', async () => {
    const r = await call('POST', '/api/gigs/fund', { clientId: client.id, freelancerId: freelancer.id, budget: '99999999.99' });
    assert.equal(r.status, 409);
    assert.equal(r.body.error.code, 'INSUFFICIENT_BALANCE');
    assert.ok(Number(r.body.error.details.balance) < 99999999.99);
  });

  test('bad input', async () => {
    assert.equal((await call('POST', '/api/gigs/fund', { clientId: 'x', freelancerId: freelancer.id, budget: '1' })).status, 400);
    const zero = await call('POST', '/api/gigs/fund', { clientId: client.id, freelancerId: freelancer.id, budget: '0' });
    assert.equal(zero.status, 400);
    assert.equal(zero.body.error.code, 'INVALID_AMOUNT');
  });

  test('escrow audit: newest rows (written by the trigger here) match the running balance', async () => {
    const r = await call('GET', `/api/clients/${client.id}/audit?pageSize=5`);
    assert.equal(r.status, 200);
    // Running balance is anchored at the current balance, so the newest row equals it,
    // and the 3 rows this test created (top-up, two fund_gig calls) are consistent.
    assert.equal(r.body.items[0].running_balance, r.body.client.escrow_balance);
    assert.ok(r.body.items.slice(0, 3).every((i) => i.consistent), JSON.stringify(r.body.items.slice(0, 3)));
  });
});

describe('Workflows 2-4', () => {
  test('revenue series has one point per calendar day', async () => {
    const r = await call('GET', `/api/analytics/revenue?days=30&freelancerId=${freelancer.id}`);
    assert.equal(r.status, 200);
    assert.ok(r.body.points.length >= 30, 'one point per calendar day');
  });

  test('nearby workers are within 5 km, nearest first, one row per worker', async () => {
    await call('POST', '/api/workers/pings/simulate', { jobSite: 'part-a', count: 6 });
    const r = await call('GET', '/api/workers/nearby?jobSite=part-a');
    assert.equal(r.status, 200);
    assert.ok(r.body.results.length > 0);
    const d = r.body.results.map((x) => x.distanceKm);
    assert.ok(d.every((km) => km <= 5));
    assert.deepEqual(d, [...d].sort((a, b) => a - b));
    const ids = r.body.results.map((x) => x.freelancerId);
    assert.equal(new Set(ids).size, ids.length);
  });

  test('review facet: five buckets that add up to the total', async () => {
    const r = await call('GET', '/api/reviews/summary');
    assert.equal(r.status, 200);
    assert.equal(r.body.ratingDistribution.length, 5);
    assert.equal(r.body.ratingDistribution.reduce((s, x) => s + x.count, 0), r.body.totalReviews);
  });

  test('portfolio found through the cross-database freelancer_id', async () => {
    const r = await call('GET', `/api/freelancers/${freelancer.id}/portfolio`);
    assert.equal(r.status, 200);
    assert.equal(r.body.portfolio.freelancer_id, freelancer.id);
  });
});
