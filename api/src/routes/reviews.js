// Workflow 4: GigReviews analytics ($facet) and the review list.
//
//   GET /api/reviews/summary?freelancerId=&days=30|90|365|all
//   GET /api/reviews?freelancerId=&rating=1..5&page=&pageSize=
//
// The flexible catalog document (Portfolios) is served by
// GET /api/freelancers/:id/portfolio (routes/freelancers.js).
import { Router } from 'express';
import { getMongoDb } from '../db/mongo.js';
import { asyncHandler, HttpError, optionalUuid, paged, parsePagination } from '../lib/http.js';
import { freelancerInfo } from '../lib/lookups.js';
import { reviewFacetPipeline, shapeFacetResult } from '../mongo/pipelines.js';

export const reviewsRouter = Router();

const PERIODS = { 30: 30, 90: 90, 365: 365, all: null };

function parsePeriod(value, fallback) {
  const key = value ?? fallback;
  if (!(key in PERIODS)) throw new HttpError(400, 'INVALID_PERIOD', 'days must be 30, 90, 365 or all');
  return { key: String(key), days: PERIODS[key] };
}

// GET /api/reviews/summary
// Default (all freelancers, 90 days) = the Part A analysis. With a freelancer
// the same pipeline runs for that freelancer only.
reviewsRouter.get(
  '/summary',
  asyncHandler(async (req, res) => {
    // Mongo stores ids in lower case; PostgreSQL accepts either.
    const freelancerId = optionalUuid(req.query.freelancerId, 'freelancerId')?.toLowerCase() ?? null;
    const period = parsePeriod(req.query.days, freelancerId ? 'all' : '90');
    const since = period.days ? new Date(Date.now() - period.days * 86_400_000) : null;

    const db = await getMongoDb();
    const started = Date.now();
    // $facet always returns exactly one document (empty arrays if nothing matched).
    const [facetDoc] = await db
      .collection('GigReviews')
      .aggregate(reviewFacetPipeline({ since, freelancerId }))
      .toArray();
    const queryMs = Date.now() - started;

    const shaped = shapeFacetResult(facetDoc);
    const info = await freelancerInfo([...shaped.topWorkers.map((w) => w.freelancerId), freelancerId].filter(Boolean));
    // A well-formed id that is not a freelancer: say so, instead of an empty
    // summary for "Unknown".
    if (freelancerId && !info.has(freelancerId)) {
      throw new HttpError(404, 'FREELANCER_NOT_FOUND', 'That freelancer does not exist.');
    }

    res.json({
      period: period.key,
      freelancer: freelancerId ? { id: freelancerId, name: info.get(freelancerId)?.name ?? 'Unknown' } : null,
      queryMs,
      ...shaped,
      topWorkers: shaped.topWorkers.map((w) => ({ ...w, name: info.get(w.freelancerId)?.name ?? 'Unknown' })),
    });
  }),
);

// GET /api/reviews  - newest first, paginated
reviewsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const freelancerId = optionalUuid(req.query.freelancerId, 'freelancerId')?.toLowerCase() ?? null;
    const pg = parsePagination(req.query, { defaultPageSize: 10, maxPageSize: 50 });
    const filter = {};
    if (freelancerId) filter.freelancer_id = freelancerId;
    if (req.query.rating) {
      const rating = Number(req.query.rating);
      if (![1, 2, 3, 4, 5].includes(rating)) throw new HttpError(400, 'INVALID_RATING', 'rating must be 1-5');
      filter.rating = rating;
    }

    const db = await getMongoDb();
    const reviews = db.collection('GigReviews');
    const [docs, total] = await Promise.all([
      reviews.find(filter).sort({ created_at: -1, _id: 1 }).skip(pg.offset).limit(pg.limit).toArray(),
      reviews.countDocuments(filter),
    ]);
    const info = await freelancerInfo(docs.map((d) => d.freelancer_id));

    res.json(
      paged(
        docs.map((d) => ({
          id: String(d._id),
          freelancerId: d.freelancer_id,
          freelancerName: info.get(d.freelancer_id)?.name ?? 'Unknown',
          clientName: d.client_name,
          rating: d.rating,
          comment: d.comment,
          tags: d.skill_tags || [],
          createdAt: d.created_at,
        })),
        total,
        pg,
      ),
    );
  }),
);
