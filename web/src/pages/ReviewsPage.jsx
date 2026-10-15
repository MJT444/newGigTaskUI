// Workflow 4 (MongoDB): GigReviews analytics from ONE $facet pipeline, the
// review documents, and a freelancer's flexible Portfolios document.
//
// Default view = Part A's analysis (all freelancers, last 90 days). Clicking a
// top worker (or arriving from a freelancer page) runs the same pipeline for
// that freelancer and shows their portfolio.
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api, qs } from '../api/client.js';
import { Pagination } from '../components/DataTable.jsx';
import { PortfolioCard } from '../components/mongo/PortfolioCard.jsx';
import { FreelancerSearch } from '../components/pickers.jsx';
import { EmptyState, QueryState } from '../components/StateViews.jsx';
import { Badge, Button, Card, PageHeader, StatCard, Tabs } from '../components/ui.jsx';
import { formatDateTime, formatInt } from '../lib/format.js';
import { chartColors } from '../lib/theme.js';

const STAR_COLORS = { 1: chartColors.danger, 2: '#ea580c', 3: '#ca8a04', 4: '#65a30d', 5: chartColors.success };
const PERIODS = [
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
  { value: '365', label: '1 year' },
  { value: 'all', label: 'All time' },
];

export function Stars({ value }) {
  const pct = Math.max(0, Math.min(100, (Number(value) / 5) * 100));
  return (
    <span className="stars" role="img" aria-label={`${value} out of 5 stars`}>
      <span className="stars-bg">★★★★★</span>
      <span className="stars-fg" style={{ width: `${pct}%` }}>
        ★★★★★
      </span>
    </span>
  );
}

export function ReviewsPage() {
  const [params, setParams] = useSearchParams();
  const freelancerId = params.get('freelancer') || '';
  const [days, setDays] = useState(freelancerId ? 'all' : '90');
  const [rating, setRating] = useState(null);

  // One freelancer has ~10 reviews a year, so their default period is "all time".
  useEffect(() => {
    setDays(freelancerId ? 'all' : '90');
    setRating(null);
  }, [freelancerId]);

  const choose = (id) => setParams(id ? { freelancer: id } : {}, { replace: true });

  const summary = useQuery({
    queryKey: ['reviews', 'summary', freelancerId, days],
    queryFn: () => api.get(`/api/reviews/summary${qs({ freelancerId, days })}`),
    placeholderData: keepPreviousData,
  });
  const who = summary.data?.freelancer;

  return (
    <>
      <PageHeader
        title="Reviews & portfolios"
        description="What clients say about freelancers: ratings, most-mentioned skills and the top-rated workers, with each freelancer’s portfolio."
      />

      <Card>
        <div className="toolbar">
          <div className="field">
            <span className="field-label">Freelancer</span>
            <div className="inline-form">
              <FreelancerSearch value={who} onSelect={(f) => choose(f.id)} />
              {freelancerId && (
                <Button variant="ghost" size="sm" onClick={() => choose('')}>
                  All freelancers
                </Button>
              )}
            </div>
          </div>
          <div className="field">
            <span className="field-label">Period</span>
            <Tabs label="Review period" tabs={PERIODS} value={days} onChange={setDays} />
          </div>
        </div>
        <p className="field-hint">
          {freelancerId ? (
            <>
              Showing reviews for <Link to={`/freelancers/${freelancerId}`}>{who?.name || 'this freelancer'}</Link> only.
            </>
          ) : (
            'All freelancers. Pick a period, click a rating bar to filter the reviews, or click a top-rated worker.'
          )}
        </p>
      </Card>

      <QueryState
        query={summary}
        loadingLabel="Loading reviews…"
        isEmpty={(d) => d.totalReviews === 0}
        emptyTitle="No reviews in this period"
        empty="Try a longer period."
      >
        {(d) => {
          const share = (keep) =>
            `${Math.round((d.ratingDistribution.filter((r) => keep(r.rating)).reduce((s, r) => s + r.count, 0) / d.totalReviews) * 100)}%`;
          return (
            <div className={summary.isPlaceholderData ? 'is-dimmed' : ''}>
              <div className="stats-grid">
                <StatCard
                  label="Average rating"
                  value={
                    <span className="rating-big">
                      {Number(d.averageRating).toFixed(2)} <Stars value={d.averageRating} />
                    </span>
                  }
                />
                <StatCard label="Reviews" value={formatInt(d.totalReviews)} />
                <StatCard label="4–5 stars" value={share((r) => r >= 4)} />
                <StatCard label="1–2 stars" value={share((r) => r <= 2)} />
              </div>

              <div className="grid-2">
                <Card title="Rating distribution" subtitle="Click a bar to see only those reviews">
                  <div className="chart" role="img" aria-label="Number of reviews per star rating">
                    <ResponsiveContainer width="100%" height={260}>
                      <BarChart data={d.ratingDistribution} margin={{ top: 20, right: 8, left: 0, bottom: 0 }}>
                        <CartesianGrid stroke={chartColors.grid} vertical={false} />
                        <XAxis dataKey="rating" tickFormatter={(r) => `${r}★`} tick={{ fontSize: 13 }} />
                        <YAxis allowDecimals={false} width={44} tick={{ fontSize: 12 }} />
                        <Tooltip
                          formatter={(value, _n, item) => [`${value} reviews (${item.payload.percent}%)`, `${item.payload.rating} star`]}
                          labelFormatter={() => ''}
                          cursor={{ fill: 'rgba(0,0,0,0.04)' }}
                        />
                        <Bar
                          dataKey="count"
                          radius={[4, 4, 0, 0]}
                          cursor="pointer"
                          onClick={(entry) => {
                            const r = entry?.payload?.rating ?? entry?.rating;
                            if (r) setRating((cur) => (cur === r ? null : r));
                          }}
                        >
                          {d.ratingDistribution.map((r) => (
                            <Cell key={r.rating} fill={STAR_COLORS[r.rating]} fillOpacity={rating && rating !== r.rating ? 0.3 : 1} />
                          ))}
                          <LabelList dataKey="count" position="top" fontSize={12} />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </Card>

                <Card title="Top skill tags" subtitle="Skills mentioned most in reviews">
                  {d.topTags.length === 0 ? (
                    <EmptyState title="No tags" />
                  ) : (
                    <div className="chart" role="img" aria-label="Most frequent skill tags">
                      <ResponsiveContainer width="100%" height={Math.max(220, d.topTags.length * 28)}>
                        <BarChart data={d.topTags} layout="vertical" margin={{ top: 0, right: 40, left: 8, bottom: 0 }}>
                          <XAxis type="number" hide />
                          <YAxis type="category" dataKey="tag" width={110} tick={{ fontSize: 13 }} />
                          <Tooltip formatter={(v) => [`${v} reviews`, 'Count']} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
                          <Bar dataKey="count" fill={chartColors.accent} radius={[0, 4, 4, 0]}>
                            <LabelList dataKey="count" position="right" fontSize={12} />
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </Card>
              </div>

              {!freelancerId && (
                <Card title="Top-rated workers" subtitle="Highest average rating · click a name to see their reviews and portfolio">
                  <ol className="top-workers">
                    {d.topWorkers.map((w, i) => (
                      <li key={w.freelancerId} className="top-worker">
                        <span className="list-rank">{i + 1}</span>
                        <button type="button" onClick={() => choose(w.freelancerId)}>
                          {w.name}
                        </button>
                        <Stars value={w.avgRating} />
                        <span className="muted top-worker-score">
                          {Number(w.avgRating).toFixed(2)} · {formatInt(w.reviewCount)} reviews
                        </span>
                      </li>
                    ))}
                  </ol>
                </Card>
              )}

              <details className="explain">
                <summary>How this works</summary>
                <p>
                  <code>$match</code> on <code>created_at</code> (index <code>created_at_1</code>) — plus <code>freelancer_id</code> when
                  one freelancer is chosen — runs once. <code>$facet</code> then feeds the same documents into four sub-pipelines:{' '}
                  <code>ratingDistribution</code> (<code>$group</code> by rating), <code>topSkillTags</code> (<code>$unwind</code> the
                  tag array, <code>$group</code>, <code>$sort</code>, <code>$limit 10</code>), <code>overallAverage</code> (added: the
                  brief asks for it) and <code>overallWorkerRatings</code>. The result is one document with four arrays. Last
                  run: {d.queryMs} ms.
                </p>
              </details>
            </div>
          );
        }}
      </QueryState>

      <div className="grid-reviews">
        <ReviewList freelancerId={freelancerId} rating={rating} onClear={() => setRating(null)} />
        {freelancerId ? (
          <PortfolioCard freelancerId={freelancerId} />
        ) : (
          <Card title="Portfolio" subtitle="Skills, experience and certifications">
            <EmptyState title="Pick a freelancer to see their portfolio">Click a name in “Top-rated workers” or use the search above.</EmptyState>
          </Card>
        )}
      </div>
    </>
  );
}

function ReviewList({ freelancerId, rating, onClear }) {
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [freelancerId, rating]);
  const q = useQuery({
    queryKey: ['reviews', 'list', freelancerId, rating, page],
    queryFn: () => api.get(`/api/reviews${qs({ freelancerId, rating, page, pageSize: 8 })}`),
    placeholderData: keepPreviousData,
  });

  return (
    <Card
      title="Reviews"
      subtitle="Newest first, all time"
      actions={
        rating && (
          <Button variant="ghost" size="sm" onClick={onClear}>
            {rating}★ only · clear
          </Button>
        )
      }
    >
      <QueryState query={q} isEmpty={(d) => d.items.length === 0} emptyTitle={rating ? `No ${rating}-star reviews` : 'No reviews'}>
        {(d) => (
          <>
            <ul className={`review-list ${q.isPlaceholderData ? 'is-dimmed' : ''}`}>
              {d.items.map((r) => (
                <li key={r.id} className="review">
                  <div className="review-head">
                    <Stars value={r.rating} />
                    <span className="muted">{formatDateTime(r.createdAt)}</span>
                  </div>
                  <p>
                    “{r.comment}” <span className="muted">— {r.clientName}</span>
                  </p>
                  {!freelancerId && (
                    <span className="muted">
                      for <Link to={`/freelancers/${r.freelancerId}`}>{r.freelancerName}</Link>
                    </span>
                  )}
                  <div className="chip-row">
                    {r.tags.map((t) => (
                      <Badge key={t} tone="neutral">
                        {t}
                      </Badge>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
            <Pagination page={d.page} totalPages={d.totalPages} total={d.total} isFetching={q.isFetching} onPage={setPage} />
          </>
        )}
      </QueryState>
    </Card>
  );
}
