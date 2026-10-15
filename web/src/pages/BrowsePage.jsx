// Browse clients, freelancers and contracts. Server-side pagination and search:
// the browser holds one page at a time, never the 50,000 contracts.
// Screen state is in the URL (?tab=contracts&status=IN_PROGRESS&page=3) so the
// back button and shared links work.
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api, qs } from '../api/client.js';
import { DataTable, Pagination } from '../components/DataTable.jsx';
import { FreelancerState } from '../components/pickers.jsx';
import { QueryState } from '../components/StateViews.jsx';
import { Card, Money, PageHeader, StatusBadge, Tabs } from '../components/ui.jsx';
import { useActor } from '../context/ActorContext.jsx';
import { CONTRACT_STATUSES, statusLabel } from '../lib/contractStatus.js';
import { formatDateTime } from '../lib/format.js';
import { useDebounced } from '../lib/useDebounced.js';

const TABS = [
  { value: 'clients', label: 'Clients' },
  { value: 'freelancers', label: 'Freelancers' },
  { value: 'contracts', label: 'Contracts' },
];

export function BrowsePage() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.some((t) => t.value === params.get('tab')) ? params.get('tab') : 'clients';

  const update = (patch) => {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
    setParams(next);
  };

  return (
    <>
      <PageHeader title="Explore" description="Search clients and freelancers, then review their gigs and progress." />
      <Tabs label="Explore sections" tabs={TABS} value={tab} onChange={(t) => setParams(new URLSearchParams({ tab: t }))} />
      {tab === 'clients' && <ClientsTab params={params} update={update} />}
      {tab === 'freelancers' && <FreelancersTab params={params} update={update} />}
      {tab === 'contracts' && <ContractsTab params={params} update={update} />}
    </>
  );
}

const pageOf = (params) => Math.max(1, Number(params.get('page')) || 1);

function SearchBox({ initial, onSearch, placeholder }) {
  const [text, setText] = useState(initial || '');
  const debounced = useDebounced(text, 300);
  const onSearchRef = useRef(onSearch);
  onSearchRef.current = onSearch;
  const lastRef = useRef(initial || '');
  // Browser back/forward can change the URL while this input stays mounted.
  useEffect(() => {
    const next = initial || '';
    lastRef.current = next;
    setText(next);
  }, [initial]);
  // Push the value up once typing pauses (not on first render).
  useEffect(() => {
    if (debounced !== lastRef.current) {
      lastRef.current = debounced;
      onSearchRef.current(debounced);
    }
  }, [debounced]);
  return (
    <input
      type="search"
      className="input search-input"
      placeholder={placeholder}
      value={text}
      onChange={(e) => setText(e.target.value)}
      aria-label={placeholder}
    />
  );
}

function ClientsTab({ params, update }) {
  const navigate = useNavigate();
  const page = pageOf(params);
  const search = params.get('search') || '';
  const q = useQuery({
    queryKey: ['clients', 'list', { page, search }],
    queryFn: () => api.get(`/api/clients${qs({ page, search, pageSize: 20 })}`),
    placeholderData: keepPreviousData,
  });
  return (
    <Card title="Clients" subtitle="See who is funding gigs and check their escrow balance." actions={<SearchBox initial={search} placeholder="Search clients by name" onSearch={(s) => update({ search: s, page: '' })} />}>
      <QueryState query={q} isEmpty={(d) => d.items.length === 0} emptyTitle="No clients found" empty={search && `Nothing matches “${search}”.`}>
        {(d) => (
          <>
            <DataTable
              caption="Clients"
              dimmed={q.isPlaceholderData}
              rows={d.items}
              onRowClick={(c) => navigate(`/clients/${c.id}`, { state: { browseSearch: params.toString() } })}
              columns={[
                { key: 'name', header: 'Client' },
                { key: 'escrow_balance', header: 'Escrow balance', align: 'right', render: (c) => <Money value={c.escrow_balance} /> },
                { key: 'active_contracts', header: 'Funded / in progress', align: 'right' },
              ]}
            />
            <Pagination page={d.page} totalPages={d.totalPages} total={d.total} isFetching={q.isFetching} onPage={(p) => update({ page: String(p) })} />
          </>
        )}
      </QueryState>
    </Card>
  );
}

function FreelancersTab({ params, update }) {
  const navigate = useNavigate();
  const page = pageOf(params);
  const search = params.get('search') || '';
  const available = params.get('available') || '';
  const q = useQuery({
    queryKey: ['freelancers', 'list', { page, search, available }],
    queryFn: () => api.get(`/api/freelancers${qs({ page, search, available, pageSize: 20 })}`),
    placeholderData: keepPreviousData,
  });
  return (
    <Card
      title="Freelancers"
      subtitle="Find available talent and view their current workload."
      actions={
        <div className="filters">
          <select className="input" value={available} aria-label="Availability" onChange={(e) => update({ available: e.target.value, page: '' })}>
            <option value="">Any availability</option>
            <option value="true">Available to start</option>
            <option value="false">Unavailable or busy</option>
          </select>
          <SearchBox initial={search} placeholder="Search freelancers by name" onSearch={(s) => update({ search: s, page: '' })} />
        </div>
      }
    >
      <QueryState query={q} isEmpty={(d) => d.items.length === 0} emptyTitle="No freelancers found">
        {(d) => (
          <>
            <DataTable
              caption="Freelancers"
              dimmed={q.isPlaceholderData}
              rows={d.items}
              onRowClick={(f) => navigate(`/freelancers/${f.id}`, { state: { browseSearch: params.toString() } })}
              columns={[
                { key: 'name', header: 'Freelancer' },
                { key: 'state', header: 'Status', render: (f) => <FreelancerState f={f} /> },
                { key: 'base', header: 'Base (lat, lng)', render: (f) => `${Number(f.latitude).toFixed(4)}, ${Number(f.longitude).toFixed(4)}` },
              ]}
            />
            <Pagination page={d.page} totalPages={d.totalPages} total={d.total} isFetching={q.isFetching} onPage={(p) => update({ page: String(p) })} />
          </>
        )}
      </QueryState>
    </Card>
  );
}

function ContractsTab({ params, update }) {
  const navigate = useNavigate();
  const { actor } = useActor();
  const page = pageOf(params);
  const status = params.get('status') || '';
  const mine = params.get('mine') === '1' && actor;
  const q = useQuery({
    queryKey: ['contracts', 'list', { page, status, clientId: mine ? actor.id : null }],
    queryFn: () => api.get(`/api/contracts${qs({ page, status, clientId: mine ? actor.id : '', pageSize: 20 })}`),
    placeholderData: keepPreviousData,
  });
  return (
    <Card
      title="Contracts"
      subtitle="See funded, active, and completed gigs."
      actions={
        <div className="filters">
          <select className="input" value={status} aria-label="Filter by status" onChange={(e) => update({ status: e.target.value, page: '' })}>
            <option value="">All statuses</option>
            {CONTRACT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {statusLabel(s)}
              </option>
            ))}
          </select>
          <label className="checkbox">
            <input type="checkbox" checked={Boolean(mine)} disabled={!actor} onChange={(e) => update({ mine: e.target.checked ? '1' : '', page: '' })} />
            Only {actor ? actor.name : 'my'} contracts
          </label>
        </div>
      }
    >
      <QueryState query={q} isEmpty={(d) => d.items.length === 0} emptyTitle="No contracts match these filters">
        {(d) => (
          <>
            <DataTable
              caption="Contracts"
              dimmed={q.isPlaceholderData}
              rows={d.items}
              onRowClick={(k) => navigate(`/contracts/${k.id}`, { state: { browseSearch: params.toString() } })}
              columns={[
                { key: 'created_at', header: 'Funded', render: (k) => formatDateTime(k.created_at) },
                { key: 'client_name', header: 'Client' },
                { key: 'freelancer_name', header: 'Freelancer' },
                { key: 'budget', header: 'Budget', align: 'right', render: (k) => <Money value={k.budget} /> },
                { key: 'status', header: 'Status', render: (k) => <StatusBadge status={k.status} /> },
              ]}
            />
            <Pagination page={d.page} totalPages={d.totalPages} total={d.total} isFetching={q.isFetching} onPage={(p) => update({ page: String(p) })} />
          </>
        )}
      </QueryState>
    </Card>
  );
}
