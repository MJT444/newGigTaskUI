import pg from 'pg';
import { config } from '../config.js';

// DECIMAL/NUMERIC (OID 1700) arrives as a string by default so money is never
// rounded by JavaScript floats. We keep it a string and format it in the UI.
// COUNT(*) is BIGINT (OID 20); our counts are far below 2^53, so parse to number.
pg.types.setTypeParser(20, (value) => Number(value));

// DATE (OID 1082): keep 'YYYY-MM-DD' as-is instead of converting to a JS Date
// at local midnight, which shifts the day for users west/east of UTC.
pg.types.setTypeParser(1082, (value) => value);

export const pool = new pg.Pool({
  ...config.pg,
  max: 10,
  idleTimeoutMillis: 30_000,
});

pool.on('error', (err) => {
  // An idle client lost its connection. The pool replaces it; just log.
  console.error('[postgres] idle client error:', err.message);
});

export async function query(text, params) {
  return pool.query(text, params);
}

/**
 * Run `fn(client)` inside one transaction on one connection.
 * `isolation` is applied as the first statement, which is exactly what the
 * inherited README requires for sp_execute_checkout (REPEATABLE READ must be
 * set by the caller, not inside the procedure).
 */
export async function withTransaction(fn, { isolation = 'READ COMMITTED' } = {}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SET TRANSACTION ISOLATION LEVEL ${isolation}`);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
