// Workflow 2 + materialized view.
//   Chart:   one freelancer's daily revenue + 7-day moving average (the inherited formula)
//   Table:   the inherited db/sql/06_window_analytics.sql output (DENSE_RANK), period selectable
//   Summary: freelancer_lifetime_stats with last-refreshed time and a refresh button
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api, qs } from '../api/client.js';
import { DataTable, Pagination } from '../components/DataTable.jsx';
import { FreelancerSearch } from '../components/pickers.jsx';
import { EmptyState, QueryState } from '../components/StateViews.jsx';
import { Alert, Button, Card, Money, PageHeader, StatCard, Tabs } from '../components/ui.jsx';
import { formatCompact, formatDateTime, formatInt, formatMoney, formatShortDate } from '../lib/format.js';
import { chartColors } from '../lib/theme.js';

const CHART_PERIODS = [
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
  { value: '365', label: '1 year' },
];

export function AnalyticsPage() {
  const [params, setParams] = useSearchParams();
  const freelancerId = params.get('freelancer') || '';
  const select = (id) => {
    const next = new URLSearchParams(params);
    if (id) next.set('freelancer', id);
    else next.delete('freelancer');
    setParams(next, { replace: true });
  };

  return (
    <>
      <PageHeader
        title="Freelancer revenue"
        description="Revenue from completed contracts. Click a ranking row for the chart."
      />
      <SummaryPanel />
      <div className="grid-analytics">
        <MovingAverageChart freelancerId={freelancerId} onSelect={select} />
        <RankingCard selectedId={freelancerId} onSelect={select} />
      </div>
    </>
  );
}

function SummaryPanel() {
  const queryClient = useQueryClient();
  const q = useQuery({ queryKey: ['analytics', 'lifetime'], queryFn: () => api.get('/api/analytics/lifetime') });
  const refresh = useMutation({
    mutationFn: () => api.post('/api/analytics/refresh'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['analytics', 'lifetime'] }),
  });

  return (
    <Card
      title="Lifetime summary"
      subtitle={
        q.data?.lastRefresh
          ? `Last updated ${formatDateTime(q.data.lastRefresh.finished_at)}`
          : 'Not updated from this app yet'
      }
      actions={
        <Button loading={refresh.isPending} onClick={() => refresh.mutate()}>
          Update summary
        </Button>
      }
    >
      {refresh.isError && <Alert tone="danger">{refresh.error.message}</Alert>}
      <QueryState query={q}>
        {(d) =>
          !d.isPopulated ? (
            <EmptyState title="The summary has no data yet">Press “Update summary”.</EmptyState>
          ) : (
            <>
              <div className="stats-grid">
                <StatCard label="Total earnings" value={<Money value={d.totals.total_earnings} />} />
                <StatCard label="Completed contracts" value={formatInt(d.totals.completed_contracts)} />
                <StatCard label="Freelancers earning" value={`${formatInt(d.totals.earning_freelancers)} / ${formatInt(d.totals.freelancers)}`} />
                <StatCard label="Average per earner" value={<Money value={d.totals.avg_earnings} />} hint={`max ${formatMoney(d.totals.max_earnings)}`} />
              </div>
              {d.pendingCompleted > 0 ? (
                <Alert tone="warning" title="The summary is out of date">
                  {formatInt(d.pendingCompleted)} {Number(d.pendingCompleted) === 1 ? 'contract was' : 'contracts were'} completed after the last
                  update. Press “Update summary” to include them.
                </Alert>
              ) : (
                <p className="muted">The summary includes every completed contract.</p>
              )}
              {d.topEarners.length > 0 && (
                <div className="top-list">
                  <span className="stat-label">Top lifetime earners</span>
                  <ol>
                    {d.topEarners.map((r) => (
                      <li key={r.freelancer_id}>
                        {r.freelancer_name} <span className="muted">· {formatMoney(r.total_earnings)} · {formatInt(r.completed_contracts)} {Number(r.completed_contracts) === 1 ? 'contract' : 'contracts'}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </>
          )
        }
      </QueryState>
    </Card>
  );
}

function MovingAverageChart({ freelancerId, onSelect }) {
  const [days, setDays] = useState('90');
  const q = useQuery({
    queryKey: ['analytics', 'revenue', freelancerId, days],
    queryFn: () => api.get(`/api/analytics/revenue${qs({ freelancerId, days })}`),
    placeholderData: keepPreviousData,
  });
  const data = useMemo(
    () =>
      (q.data?.points || []).map((p) => ({
        date: p.date,
        daily: Number(p.dailyRevenue),
        // null on days without revenue: the inherited window only produces rows for revenue days
        avg: p.movingAvg7Day === null ? null : Number(p.movingAvg7Day),
      })),
    [q.data],
  );
  const f = q.data?.freelancer;

  return (
    <Card
      title="Daily revenue and 7-day average"
      subtitle={f ? `${f.name}${q.data.rank ? ` · rank ${q.data.rank}` : ''} · ${formatMoney(q.data.periodRevenue)} in the period` : 'Choose a freelancer'}
      actions={
        <>
          <FreelancerSearch value={f} onSelect={(x) => onSelect(x.id)} />
          <Tabs label="Chart period" tabs={CHART_PERIODS} value={days} onChange={setDays} />
        </>
      }
    >
      <QueryState
        query={q}
        isEmpty={(d) => d.points.every((p) => Number(p.dailyRevenue) === 0)}
        emptyTitle="No completed revenue in this period"
        empty="This freelancer has no completed contracts in this period. Try a longer period or pick a freelancer from the ranking."
      >
        {() => (
          <div className={`chart ${q.isPlaceholderData ? 'is-dimmed' : ''}`} role="img" aria-label="Daily revenue bars with a 7-day moving average line">
            <ResponsiveContainer width="100%" height={320}>
              <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={chartColors.grid} vertical={false} />
                <XAxis dataKey="date" tickFormatter={formatShortDate} minTickGap={24} tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={(v) => `₹${formatCompact(v)}`} width={56} tick={{ fontSize: 12 }} />
                <Tooltip formatter={(value, name) => [formatMoney(value), name]} labelFormatter={(dd) => formatShortDate(dd)} />
                <Legend />
                <Bar dataKey="daily" name="Daily completed revenue" fill={chartColors.accentSoft} radius={[2, 2, 0, 0]} />
                <Line dataKey="avg" name="7-day moving average" stroke={chartColors.accent} strokeWidth={2.5} dot={{ r: 3 }} connectNulls type="linear" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </QueryState>
      <details className="explain">
        <summary>How the 7-day average works</summary>
        <p>
          For each day with revenue, the line shows the average daily revenue over that day and the 6 days before it, counting
          only the days that had revenue. So a single busy day on its own has an average equal to that day’s revenue. The bars
          show every day; the line has a point only on days with revenue.
        </p>
      </details>
    </Card>
  );
}

const RANK_PERIODS = [
  { value: '30', label: '30 days' },
  { value: '60', label: '60 days' },
  { value: '90', label: '90 days' },
];

function RankingCard({ selectedId, onSelect }) {
  const [days, setDays] = useState('30');
  const [page, setPage] = useState(1);
  const q = useQuery({
    queryKey: ['analytics', 'ranking', days],
    queryFn: () => api.get(`/api/analytics/ranking${qs({ days })}`),
    placeholderData: keepPreviousData,
  });
  const size = 10;

  return (
    <Card
      title="Best earning days"
      subtitle="The 50 highest 7-day averages. Click a row to see their chart."
      actions={
        <Tabs
          label="Ranking period"
          tabs={RANK_PERIODS}
          value={days}
          onChange={(v) => {
            setDays(v);
            setPage(1);
          }}
        />
      }
    >
      <QueryState query={q} isEmpty={(d) => d.items.length === 0} emptyTitle="No completed contracts in this period">
        {(d) => {
          const totalPages = Math.max(1, Math.ceil(d.items.length / size));
          const p = Math.min(page, totalPages);
          return (
            <>
              <DataTable
                caption="Freelancer revenue ranking"
                dimmed={q.isPlaceholderData}
                rows={d.items.slice((p - 1) * size, p * size)}
                rowKey={(r) => `${r.freelancer_id}-${r.revenue_date}`}
                onRowClick={(r) => onSelect(r.freelancer_id)}
                columns={[
                  { key: 'revenue_rank', header: 'Rank', align: 'right' },
                  {
                    key: 'freelancer_name',
                    header: 'Freelancer',
                    render: (r) => (r.freelancer_id === selectedId ? <strong>{r.freelancer_name}</strong> : r.freelancer_name),
                  },
                  { key: 'revenue_date', header: 'Day', render: (r) => formatShortDate(r.revenue_date) },
                  { key: 'daily_total', header: 'Day revenue', align: 'right', render: (r) => <Money value={r.daily_total} /> },
                  { key: 'moving_avg_7d', header: '7-day avg', align: 'right', render: (r) => <Money value={r.moving_avg_7d} /> },
                ]}
              />
              <Pagination page={p} totalPages={totalPages} total={d.items.length} onPage={setPage} isFetching={q.isFetching} />
            </>
          );
        }}
      </QueryState>
    </Card>
  );
}
