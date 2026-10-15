// Contract lifecycle shown in the UI. The database is the authority:
//   idx_active_gig              one IN_PROGRESS contract per freelancer
//   forward-only moves are enforced by the API (PATCH /api/contracts/:id/status)

export const CONTRACT_STATUSES = ['FUNDED', 'IN_PROGRESS', 'COMPLETED'];

/** The next status, or null when the contract is finished. */
export function nextStatus(status) {
  const i = CONTRACT_STATUSES.indexOf(status);
  return i >= 0 && i < CONTRACT_STATUSES.length - 1 ? CONTRACT_STATUSES[i + 1] : null;
}

export const statusLabel = (status) =>
  ({ FUNDED: 'Funded', IN_PROGRESS: 'In progress', COMPLETED: 'Completed' })[status] || status;

export const actionLabel = (next) =>
  ({ IN_PROGRESS: 'Start work', COMPLETED: 'Mark completed' })[next] || `Move to ${statusLabel(next)}`;
