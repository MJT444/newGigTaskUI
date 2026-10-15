// One place for all HTTP calls. Keep server diagnostics in the Network response,
// while Error.message stays safe to render in the UI.

const USER_MESSAGES = {
  INSUFFICIENT_BALANCE: 'Not enough money in escrow to fund this gig. Nothing was charged.',
  GIG_ALREADY_IN_PROGRESS: 'This freelancer is already working on another gig.',
  INVALID_AMOUNT: 'Enter an amount greater than zero with at most two decimal places.',
  AMOUNT_TOO_LARGE: 'That amount is too large.',
  CLIENT_NOT_FOUND: 'That client does not exist.',
  FREELANCER_NOT_FOUND: 'That freelancer does not exist.',
  CONTRACT_NOT_FOUND: 'That contract does not exist.',
  INVALID_STATUS_TRANSITION: 'This contract cannot move to that status.',
  CONCURRENT_UPDATE: 'This record changed during your request. Please try again.',
  // Workers map and reviews
  UNKNOWN_JOB_SITE: 'That job site does not exist. Pick one from the list or click the map.',
  ORIGIN_REQUIRED: 'Choose a job site or click a point on the map.',
  INVALID_NUMBER: 'One of the values in this request is out of range.',
  INVALID_ID: 'That link is not valid. It may have been copied incompletely.',
  INVALID_PERIOD: 'Choose a period of 30 days, 90 days, 1 year or all time.',
  INVALID_RATING: 'Choose a rating from 1 to 5 stars.',
  INVALID_DATE: 'Enter dates as YYYY-MM-DD.',
  INVALID_JSON: 'The request could not be read. Please try again.',
  NOT_FOUND: 'That page does not exist.',
};

function displayMessage(status, code) {
  if (status >= 500 || code === 'NETWORK' || code === 'DATABASE_UNAVAILABLE') {
    return 'The service is temporarily unavailable. Please try again.';
  }
  return USER_MESSAGES[code] || 'The request could not be completed. Please try again.';
}

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(displayMessage(status, code));
    this.status = status;
    this.code = code;
    this.details = details;
    this.serverMessage = message;
  }
}

async function request(method, path, body) {
  let res;
  try {
    res = await fetch(path, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Cannot reach the API server. Is it running on port 4000?');
  }

  let json = null;
  try {
    json = await res.json();
  } catch {
    // Non-JSON response (e.g. the Vite proxy's 502 page when the API is down)
  }

  if (!res.ok) {
    const e = json?.error;
    if (e) throw new ApiError(res.status, e.code, e.message, e.details);
    throw new ApiError(
      res.status,
      res.status === 502 || res.status === 504 ? 'NETWORK' : 'HTTP_ERROR',
      res.status === 502 || res.status === 504
        ? 'Cannot reach the API server. Is it running on port 4000?'
        : `Request failed (${res.status})`,
    );
  }
  return json;
}

/** Build "?a=1&b=2", skipping empty values. */
export function qs(params) {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') sp.set(k, String(v));
  });
  const s = sp.toString();
  return s ? `?${s}` : '';
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body = {}) => request('POST', path, body),
  patch: (path, body = {}) => request('PATCH', path, body),
};
