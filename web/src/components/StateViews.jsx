// Loading / empty / error states. Every screen goes through these, so none of
// them can end up as a blank page.
import { Button } from './ui.jsx';

export function Loading({ label = 'Loading…' }) {
  return (
    <div className="state state-loading" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

export function EmptyState({ title = 'Nothing here yet', children }) {
  return (
    <div className="state state-empty">
      <strong>{title}</strong>
      {children && <p>{children}</p>}
    </div>
  );
}

export function ErrorState({ error, onRetry }) {
  return (
    <div className="state state-error" role="alert">
      <strong>Could not load this</strong>
      <p>{error?.message || 'The service is temporarily unavailable. Please try again.'}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

/**
 * Renders the right state for a React Query result.
 *   <QueryState query={q} isEmpty={(d) => d.items.length === 0} empty="No contracts">
 *     {(data) => <Table rows={data.items} />}
 *   </QueryState>
 */
export function QueryState({ query, isEmpty, empty, emptyTitle, loadingLabel, children }) {
  if (query.isPending) return <Loading label={loadingLabel} />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  if (isEmpty && isEmpty(query.data)) return <EmptyState title={emptyTitle}>{empty}</EmptyState>;
  return children(query.data);
}
