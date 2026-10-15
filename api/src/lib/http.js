// Small HTTP helpers shared by all routes. Pure functions: unit-tested.

export class HttpError extends Error {
  /**
   * @param {number} status HTTP status
   * @param {string} code   stable machine-readable code the UI switches on
   * @param {string} message human-readable explanation shown to the user
   * @param {object} [details] extra data for the UI (e.g. current balance)
   */
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/** Wrap an async Express handler so rejected promises reach the error middleware. */
export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function requireUuid(value, name = 'id') {
  if (typeof value !== 'string' || !UUID_RE.test(value)) {
    throw new HttpError(400, 'INVALID_ID', `${name} must be a UUID`);
  }
  return value;
}

export function optionalUuid(value, name) {
  if (value === undefined || value === '') return null;
  return requireUuid(value, name);
}

/** page >= 1, 1 <= pageSize <= 100. Returns { page, pageSize, limit, offset }. */
export function parsePagination(q, { defaultPageSize = 20, maxPageSize = 100 } = {}) {
  const page = Math.max(1, Number.parseInt(q.page, 10) || 1);
  // pageSize or page_size (the team's API plan uses page_size)
  const rawSize = Number.parseInt(q.pageSize ?? q.page_size, 10) || defaultPageSize;
  const pageSize = Math.min(maxPageSize, Math.max(1, rawSize));
  return { page, pageSize, limit: pageSize, offset: (page - 1) * pageSize };
}

export function paged(items, total, { page, pageSize }) {
  return {
    items,
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

const MONEY_RE = /^\d{1,8}(\.\d{1,2})?$/;

/**
 * Accepts "250", "250.5", "250.50" (or the same as a number).
 * Max 99,999,999.99 because the column is DECIMAL(10,2).
 * We only check the *format* here; the stored procedure still checks > 0
 * and the balance, so the database stays the single source of truth.
 */
export function parseMoney(value, name = 'amount') {
  const text = typeof value === 'number' ? String(value) : String(value ?? '').trim();
  if (!MONEY_RE.test(text)) {
    throw new HttpError(
      400,
      'INVALID_AMOUNT',
      `${name} must be a number with at most 2 decimal places and at most 99,999,999.99`,
    );
  }
  return text;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function optionalDate(value, name) {
  if (value === undefined || value === '') return null;
  if (!DATE_RE.test(value) || Number.isNaN(Date.parse(value))) {
    throw new HttpError(400, 'INVALID_DATE', `${name} must be a date in YYYY-MM-DD format`);
  }
  return value;
}

/**
 * Missing or blank -> null. Otherwise a finite number in [min, max]
 * (a whole number when integer is true), else 400 INVALID_NUMBER.
 * Blank strings are "missing": Number('  ') is 0, which would silently turn
 * ?lat=%20 into latitude 0.
 */
export function optionalNumber(value, name, { min = -Infinity, max = Infinity, integer = false } = {}) {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max || (integer && !Number.isInteger(n))) {
    const kind = integer ? 'a whole number' : 'a number';
    throw new HttpError(400, 'INVALID_NUMBER', `${name} must be ${kind} between ${min} and ${max}`);
  }
  return n;
}
