// Moves a contract one step forward: FUNDED -> IN_PROGRESS -> COMPLETED.
// "Start work" is where the partial unique index idx_active_gig applies; if
// the freelancer is already busy the database refuses and we show which
// contract is blocking, with a button to complete it.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client.js';
import { actionLabel, CONTRACT_STATUSES, nextStatus, statusLabel } from '../lib/contractStatus.js';
import { formatMoney } from '../lib/format.js';
import { Alert, Button, StatusBadge } from './ui.jsx';

export function useContractStatus(onChanged) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }) => api.patch(`/api/contracts/${id}/status`, { status }),
    onSuccess: (updated) => {
      ['contracts', 'clients', 'freelancers', 'analytics'].forEach((k) => queryClient.invalidateQueries({ queryKey: [k] }));
      queryClient.setQueryData(['contract', updated.id], updated);
      onChanged?.(updated);
    },
  });
}

export function ContractStatusControl({ contract, onChanged }) {
  const [blocking, setBlocking] = useState(null);
  const m = useContractStatus((updated) => {
    setBlocking(null);
    onChanged?.(updated);
  });
  const next = nextStatus(contract.status);

  const move = () =>
    m.mutate(
      { id: contract.id, status: next },
      { onError: (e) => setBlocking(e.code === 'GIG_ALREADY_IN_PROGRESS' ? e.details?.activeContract : null) },
    );

  return (
    <div className="status-control">
      <ol className="status-steps" aria-label="Contract progress">
        {CONTRACT_STATUSES.map((s) => (
          <li key={s} className={`status-step ${s === contract.status ? 'is-current' : ''}`}>
            {statusLabel(s)}
          </li>
        ))}
      </ol>
      <div className="status-control-row">
        <StatusBadge status={contract.status} />
        {next ? (
          <Button size="sm" loading={m.isPending} onClick={move}>
            {actionLabel(next)}
          </Button>
        ) : (
          <span className="muted">Completed — counts towards the freelancer’s revenue.</span>
        )}
      </div>
      {m.isError && (
        <Alert tone="danger" title={m.error.code === 'GIG_ALREADY_IN_PROGRESS' ? 'Freelancer is busy' : undefined}>
          {m.error.message}
        </Alert>
      )}
      {blocking && <BlockingContract contract={blocking} onCleared={() => setBlocking(null)} />}
    </div>
  );
}

/** The IN_PROGRESS contract that blocks a freelancer, with a one-click way to finish it. */
export function BlockingContract({ contract, onCleared }) {
  const m = useContractStatus(onCleared);
  const [done, setDone] = useState(false);
  return (
    <div className="alert alert-warning">
      <strong className="alert-title">Blocking contract</strong>
      <div>
        <Link to={`/contracts/${contract.id}`}>{formatMoney(contract.budget)} for {contract.client_name}</Link> is in progress.
        Complete it to free the freelancer.
      </div>
      {done ? (
        <span className="muted">Completed. Try again now.</span>
      ) : (
        <div>
          <Button
            size="sm"
            variant="secondary"
            loading={m.isPending}
            onClick={() => m.mutate({ id: contract.id, status: 'COMPLETED' }, { onSuccess: () => setDone(true) })}
          >
            Mark that contract completed
          </Button>
        </div>
      )}
      {m.isError && <span className="text-danger">{m.error.message}</span>}
    </div>
  );
}
