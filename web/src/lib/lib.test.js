import { describe, expect, test } from 'vitest';
import { qs } from '../api/client.js';
import { actionLabel, nextStatus, statusLabel } from './contractStatus.js';
import { formatAge, formatMoney, formatShortDate } from './format.js';

describe('contract status helpers', () => {
  test('statuses only move forward', () => {
    expect(nextStatus('FUNDED')).toBe('IN_PROGRESS');
    expect(nextStatus('IN_PROGRESS')).toBe('COMPLETED');
    expect(nextStatus('COMPLETED')).toBeNull();
  });
  test('labels', () => {
    expect(statusLabel('IN_PROGRESS')).toBe('In progress');
    expect(actionLabel('IN_PROGRESS')).toBe('Start work');
    expect(actionLabel('COMPLETED')).toBe('Mark completed');
  });
});

describe('formatting', () => {
  test('money strings from PostgreSQL DECIMAL keep 2 decimals, Indian grouping', () => {
    expect(formatMoney('99999.00')).toContain('99,999.00');
    expect(formatMoney('1000000')).toContain('10,00,000.00');
    expect(formatMoney(null)).toBe('—');
  });
  test('ping ages', () => {
    expect(formatAge(2)).toBe('just now');
    expect(formatAge(45)).toBe('45 s ago');
    expect(formatAge(185)).toBe('3 min ago');
    expect(formatAge(3900)).toBe('1 h 5 min ago');
  });
  test('DATE values are not shifted by time zone', () => {
    expect(formatShortDate('2026-10-01')).toMatch(/^1 Oct/);
  });
  test('query strings skip empty values', () => {
    expect(qs({ a: 1, b: '', c: null, d: 'x y' })).toBe('?a=1&d=x+y');
    expect(qs({})).toBe('');
  });
});
