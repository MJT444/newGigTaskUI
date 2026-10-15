// Workflow 4 (MongoDB): GigReviews analytics from ONE $facet pipeline, the
// review documents, and a freelancer's flexible Portfolios document.
//
// Default view = Part A's analysis (all freelancers, last 90 days). Clicking a
// top worker (or arriving from a freelancer page) runs the same pipeline for
// that freelancer and shows their portfolio.
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api, qs } from '../api/client.js';
import { Pagination } from '../components/DataTable.jsx';
import { PortfolioCard } from '../components/mongo/PortfolioCard.jsx';
import { FreelancerSearch } from '../components/pickers.jsx';
import { EmptyState, ErrorState, Loading, QueryState } from '../components/StateViews.jsx';
import { Button, Card, PageHeader, Tabs } from '../components/ui.jsx';
import { formatInt } from '../lib/format.js';

const formatDay = (value) =>
  new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

const PERIODS = [
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
  { value: '365', label: '1 year' },
  { value: 'all', label: 'All time' },
];
const PERIOD_TEXT = { 30: 'in the last 30 days', 90: 'in the last 90 days', 365: 'in the last year', all: 'in total' };

/** Errors that mean "this freelancer link is wrong", not "the service failed". */
const BAD_FREELANCER = new Set(['FREELANCER_NOT_FOUND', 'INVALID_ID']);

export function Stars({ value, size }) {
  const pct = Math.max(0, Math.min(100, (Number(value) / 5) * 100));
  return (
    <span className={`stars ${size === 'lg' ? 'stars-lg' : ''}`} role="img" aria-label={`${Number(value).toFixed(1)} out of 5 stars`}>
      <span className="stars-bg">★★★★★</span>
      <span className="stars-fg" style={{ width: `${pct}%` }}>
        ★★★★★
      </span>
    </span>
  );
}

const pct = (part, whole) => (whole ? Math.round((part / whole) * 100) : 0);

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
  const badFreelancer = summary.isError && BAD_FREELANCER.has(summary.error?.code);

  return (
    <>
      <PageHeader
        title={who ? `Reviews for ${who.name}` : 'Reviews & portfolios'}
        description={
          who
            ? 'Everything clients said about this freelancer, with their portfolio.'
            : 'What clients say about freelancers: ratings, the skills mentioned most and the top-rated workers.'
        }
      />

      <Card className="reviews-controls">
        <div className="toolbar">
          <div className="field">
            <span className="field-label">Freelancer</span>
            <div className="inline-form">
              <FreelancerSearch value={who} onSelect={(f) => choose(f.id)} />
              {freelancerId && (
                <Button variant="ghost" size="sm" onClick={() => choose('')}>
                  Show all freelancers
                </Button>
              )}
            </div>
          </div>
          <div className="field">
            <span className="field-label">Period</span>
            <Tabs label="Review period" tabs={PERIODS} value={days} onChange={setDays} />
          </div>
        </div>
      </Card>

      {badFreelancer ? (
        <ErrorState title="We couldn’t find that freelancer" error={summary.error}>
          <Button size="sm" onClick={() => choose('')}>
            Show all freelancers
          </Button>
        </ErrorState>
      ) : (
        <>
          <QueryState
            query={summary}
            loadingLabel="Loading reviews…"
            isEmpty={(d) => d.totalReviews === 0}
            emptyTitle="No reviews in this period"
            empty="Choose a longer period above."
          >
            {(d) => (
              <div className={`reviews-summary ${summary.isPlaceholderData ? 'is-dimmed' : ''}`}>
                <section className="score-card" aria-label="Average rating">
                  <span className="score-number">{Number(d.averageRating).toFixed(1)}</span>
                  <Stars value={d.averageRating} size="lg" />
                  <span className="score-caption">
                    {formatInt(d.totalReviews)} reviews {PERIOD_TEXT[days]}
                  </span>
                  <span className="score-split">
                    <span className="split-good">{pct(sum(d, (r) => r >= 4), d.totalReviews)}% gave 4 or 5 stars</span>
                    <span className="split-bad">{pct(sum(d, (r) => r <= 2), d.totalReviews)}% gave 1 or 2 stars</span>
                  </span>
                </section>

                <section className="rating-rows" aria-label="Reviews per star rating">
                  {[...d.ratingDistribution].reverse().map((r) => {
                    const active = rating === r.rating;
                    return (
                      <button
                        key={r.rating}
                        type="button"
                        className={`rating-row ${active ? 'is-active' : ''} ${rating && !active ? 'is-faded' : ''}`}
                        aria-pressed={active}
                        onClick={() => setRating(active ? null : r.rating)}
                        title={active ? 'Show all reviews' : `Show only ${r.rating}-star reviews`}
                      >
                        <span className="rating-row-label">{r.rating} ★</span>
                        <span className="rating-row-bar">
                          <span className={`bar-fill bar-${r.rating}`} style={{ width: `${maxShare(d, r.count)}%` }} />
                        </span>
                        <span className="rating-row-count">{formatInt(r.count)}</span>
                      </button>
                    );
                  })}
                  <span className="field-hint">Click a row to read only those reviews.</span>
                </section>

                <Card title="Skills mentioned most" className="tags-card">
                  {d.topTags.length === 0 ? (
                    <EmptyState title="No skills mentioned yet" />
                  ) : (
                    <ol className="tag-bars">
                      {d.topTags.map((t) => (
                        <li key={t.tag}>
                          <span className="tag-name">{t.tag}</span>
                          <span className="tag-bar">
                            <span style={{ width: `${(t.count / d.topTags[0].count) * 100}%` }} />
                          </span>
                          <span className="tag-count">{formatInt(t.count)}</span>
                        </li>
                      ))}
                    </ol>
                  )}
                </Card>

                {!freelancerId && (
                  <Card title="Top-rated workers" subtitle="Highest average rating, then most reviews" className="top-card">
                    <ol className="top-workers">
                      {d.topWorkers.map((w, i) => (
                        <li key={w.freelancerId} className="top-worker">
                          <span className="list-rank">{i + 1}</span>
                          <button type="button" onClick={() => choose(w.freelancerId)}>
                            {w.name}
                          </button>
                          <Stars value={w.avgRating} />
                          <span className="muted top-worker-score">
                            {Number(w.avgRating).toFixed(1)} ({formatInt(w.reviewCount)} {w.reviewCount === 1 ? 'review' : 'reviews'})
                          </span>
                        </li>
                      ))}
                    </ol>
                  </Card>
                )}
              </div>
            )}
          </QueryState>

          <div className="grid-reviews">
            <ReviewList freelancerId={freelancerId} rating={rating} onClear={() => setRating(null)} />
            {freelancerId ? (
              <PortfolioCard freelancerId={freelancerId} />
            ) : (
              <Card title="Portfolio">
                <EmptyState title="Pick a freelancer to see their portfolio">
                  Click a name under “Top-rated workers”, or search for someone above.
                </EmptyState>
              </Card>
            )}
          </div>
        </>
      )}
    </>
  );
}

const sum = (d, keep) => d.ratingDistribution.filter((r) => keep(r.rating)).reduce((s, r) => s + r.count, 0);
const maxShare = (d, count) => {
  const max = Math.max(...d.ratingDistribution.map((r) => r.count), 1);
  return (count / max) * 100;
};

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
      title={rating ? `${rating}-star reviews` : 'Latest reviews'}
      subtitle="Newest first, from all time"
      actions={
        rating && (
          <Button variant="ghost" size="sm" onClick={onClear}>
            Show all ratings
          </Button>
        )
      }
    >
      {q.isPending && <Loading />}
      {q.isError && <ErrorState error={q.error} onRetry={() => q.refetch()} />}
      {q.data && q.data.items.length === 0 && (
        <EmptyState title={rating ? `No ${rating}-star reviews` : 'No reviews yet'} />
      )}
      {q.data && q.data.items.length > 0 && (
        <>
          <ul className={`review-list ${q.isPlaceholderData ? 'is-dimmed' : ''}`}>
            {q.data.items.map((r) => (
              <li key={r.id} className="review">
                <div className="review-head">
                  <Stars value={r.rating} />
                  <span className="muted">{formatDay(r.createdAt)}</span>
                </div>
                <p className="review-text">“{r.comment}”</p>
                <div className="review-meta">
                  <span className="muted">
                    {r.clientName}
                    {!freelancerId && (
                      <>
                        {' '}
                        reviewed <Link to={`/reviews?freelancer=${r.freelancerId}`}>{r.freelancerName}</Link>
                      </>
                    )}
                  </span>
                  <span className="review-tags">
                    {r.tags.map((t) => (
                      <span key={t} className="review-tag">
                        {t}
                      </span>
                    ))}
                  </span>
                </div>
              </li>
            ))}
          </ul>
          <Pagination page={q.data.page} totalPages={q.data.totalPages} total={q.data.total} isFetching={q.isFetching} onPage={setPage} />
        </>
      )}
    </Card>
  );
}
