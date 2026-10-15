import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { optionalDate, optionalNumber, parseMoney, parsePagination, requireUuid } from '../src/lib/http.js';
import { toRankingSubquery } from '../src/sql/partA.js';

test('pagination clamps page and pageSize (never load everything)', () => {
  assert.deepEqual(parsePagination({}), { page: 1, pageSize: 20, limit: 20, offset: 0 });
  assert.deepEqual(parsePagination({ page: '3', pageSize: '10' }), { page: 3, pageSize: 10, limit: 10, offset: 20 });
  assert.equal(parsePagination({ pageSize: '50000' }).pageSize, 100);
  assert.equal(parsePagination({ page: '-4' }).page, 1);
  assert.equal(parsePagination({ page_size: '15' }).pageSize, 15, 'page_size alias');
});

test('money: at most 2 decimals, fits DECIMAL(10,2)', () => {
  assert.equal(parseMoney('1500'), '1500');
  assert.equal(parseMoney(12.5), '12.5');
  assert.equal(parseMoney('99999999.99'), '99999999.99');
  for (const bad of ['', 'abc', '1.234', '-5', '100000000', '1e3']) {
    assert.throws(() => parseMoney(bad), { code: 'INVALID_AMOUNT' }, `should reject ${bad}`);
  }
});

test('zero passes the format check so fund_gig is the one that rejects it', () => {
  assert.equal(parseMoney('0'), '0');
});

test('uuid and date validation', () => {
  assert.throws(() => requireUuid('1'), { code: 'INVALID_ID' });
  assert.equal(requireUuid('f8583f67-4ee8-4b13-822c-e866ff36eef8'), 'f8583f67-4ee8-4b13-822c-e866ff36eef8');
  assert.equal(optionalDate('', 'from'), null);
  assert.throws(() => optionalDate('01/10/2026', 'from'), { code: 'INVALID_DATE' });
});

test('the inherited Part A file is used as-is, with only the 30-day period parameterized', () => {
  const file = readFileSync(new URL('../../db/sql/06_window_analytics.sql', import.meta.url), 'utf8');
  const sub = toRankingSubquery(file);
  assert.match(sub, /^WITH daily_revenue AS/);
  assert.match(sub, /RANGE BETWEEN INTERVAL '6 days' PRECEDING AND CURRENT ROW/);
  assert.match(sub, /DENSE_RANK\(\) OVER \(ORDER BY moving_avg_7d DESC\)/);
  assert.match(sub, /LIMIT 50$/);
  assert.ok(sub.includes('make_interval(days => $1::int)'));
  assert.ok(!sub.includes("INTERVAL '30 days'"));
  // Everything else is the file, character for character (line endings aside:
  // Git on Windows checks the file out with CRLF, and the loader reads lines):
  const original = file.replace(/\r\n/g, '\n').trim().replace(/;\s*$/, '');
  assert.equal(sub.replace('make_interval(days => $1::int)', "INTERVAL '30 days'"), original);
});

test('a changed Part A file is refused instead of silently mis-parameterized', () => {
  assert.throws(() => toRankingSubquery('SELECT 1'), /exactly one/);
});

test('optionalNumber: blank is missing, range and whole numbers enforced', () => {
  assert.equal(optionalNumber(undefined, 'lat'), null);
  assert.equal(optionalNumber('', 'lat'), null);
  assert.equal(optionalNumber('   ', 'lat'), null, 'blank must not become 0');
  assert.equal(optionalNumber('28.61', 'lat', { min: -90, max: 90 }), 28.61);
  assert.throws(() => optionalNumber('91', 'lat', { min: -90, max: 90 }), { code: 'INVALID_NUMBER' });
  assert.throws(() => optionalNumber('abc', 'lat'), { code: 'INVALID_NUMBER' });
  assert.throws(() => optionalNumber('Infinity', 'lat'), { code: 'INVALID_NUMBER' });
  assert.equal(optionalNumber('5', 'limit', { min: 1, max: 100, integer: true }), 5);
  assert.throws(() => optionalNumber('2.5', 'limit', { min: 1, max: 100, integer: true }), { code: 'INVALID_NUMBER' });
});
