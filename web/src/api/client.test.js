import { describe, expect, test } from 'vitest';
import { ApiError } from './client.js';

describe('API error messages shown in the UI', () => {
  test('hides SQL and connection diagnostics', () => {
    const sql = new ApiError(500, 'SCHEMA_INCOMPLETE', 'relation "contracts" does not exist');
    const connection = new ApiError(503, 'DATABASE_UNAVAILABLE', 'role "postgres" does not exist');

    expect(sql.message).toBe('The service is temporarily unavailable. Please try again.');
    expect(connection.message).toBe(sql.message);
    expect(sql.message).not.toContain('contracts');
    expect(connection.message).not.toContain('postgres');
    expect(sql.serverMessage).toContain('contracts');
  });

  test('keeps a useful message for expected funding conflicts', () => {
    const error = new ApiError(409, 'INSUFFICIENT_BALANCE', 'raw database message', {
      balance: '500.00', requested: '900.00',
    });

    expect(error.message).toContain('Not enough money in escrow');
    expect(error.message).not.toContain('raw database');
    expect(error.details.requested).toBe('900.00');
  });
});
