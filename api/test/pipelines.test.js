// The Mongo pipelines must keep the Part A stages (db/mongo/02, db/mongo/03) and add
// only what the assignment needs. These tests pin that.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  geoNearPingsPipeline,
  geoNearWorkersPipeline,
  PART_A_JOB_SITE,
  RADIUS_METERS,
  reviewFacetPipeline,
  shapeFacetResult,
} from '../src/mongo/pipelines.js';

const site = PART_A_JOB_SITE;

test('raw pings mode = Part A $geoNear + the 5 km limit, $limit 5', () => {
  const [first, limit] = geoNearPingsPipeline(site);
  assert.deepEqual(first, {
    $geoNear: {
      near: { type: 'Point', coordinates: [77.209, 28.6139] }, // [lng, lat]
      distanceField: 'distance_meters',
      maxDistance: 5000,
      spherical: true,
      query: { is_available: true },
    },
  });
  assert.equal(RADIUS_METERS, 5000);
  assert.deepEqual(limit, { $limit: 5 });
});

test('workers mode groups pings into one row per worker, nearest first', () => {
  const p = geoNearWorkersPipeline({ ...site, limit: 7 });
  assert.equal(Object.keys(p[0])[0], '$geoNear', '$geoNear must be the first stage');
  assert.equal(p[0].$geoNear.maxDistance, 5000);
  const gi = p.findIndex((s) => s.$group);
  assert.equal(p[gi].$group._id, '$freelancer_id');
  assert.deepEqual(p[gi].$group.latest, { $first: '$$ROOT' });
  const sortBefore = p.findIndex((s) => s.$sort?.created_at === -1);
  assert.ok(sortBefore > 0 && sortBefore < gi, 'newest-first sort must come before $group');
  const sortAfter = p.findIndex((s, i) => i > gi && s.$sort?.distance_meters === 1);
  assert.ok(sortAfter > gi, '$group loses order, so re-sort by distance after it');
  assert.ok(p.some((s) => s.$limit === 7));
});

test('freshness filter goes inside $geoNear.query', () => {
  const since = new Date('2026-10-12T10:00:00Z');
  const [first] = geoNearWorkersPipeline({ ...site, since });
  assert.deepEqual(first.$geoNear.query, { is_available: true, created_at: { $gte: since } });
});

test('$facet keeps the three Part A facets and adds overallAverage', () => {
  const since = new Date('2026-07-14T00:00:00Z');
  const p = reviewFacetPipeline({ since });
  assert.deepEqual(p[0], { $match: { created_at: { $gte: since } } });
  const f = p[1].$facet;
  assert.deepEqual(Object.keys(f).sort(), ['overallAverage', 'overallWorkerRatings', 'ratingDistribution', 'topSkillTags']);
  assert.deepEqual(f.topSkillTags[0], { $unwind: '$skill_tags' });
  assert.deepEqual(f.topSkillTags[3], { $limit: 10 });
  assert.deepEqual(f.overallAverage[0].$group, { _id: null, avg_rating: { $avg: '$rating' }, total_reviews: { $sum: 1 } });
});

test('freelancer filter and "all time" change only the $match', () => {
  assert.deepEqual(reviewFacetPipeline({ freelancerId: 'abc' })[0], { $match: { freelancer_id: 'abc' } });
  assert.deepEqual(reviewFacetPipeline()[0], { $match: {} });
});

test('shapeFacetResult: five star buckets, percentages, unwrapped average', () => {
  const s = shapeFacetResult({
    ratingDistribution: [
      { _id: 2, count: 1 },
      { _id: 5, count: 3 },
    ],
    topSkillTags: [{ _id: 'plumbing', count: 4 }],
    overallAverage: [{ avg_rating: 4.25, total_reviews: 4 }],
    overallWorkerRatings: [{ _id: 'f1', avg_rating: 5, review_count: 2 }],
  });
  assert.equal(s.totalReviews, 4);
  assert.equal(s.averageRating, 4.25);
  assert.deepEqual(s.ratingDistribution.map((r) => [r.rating, r.count, r.percent]), [
    [1, 0, 0],
    [2, 1, 25],
    [3, 0, 0],
    [4, 0, 0],
    [5, 3, 75],
  ]);
  assert.deepEqual(s.topTags, [{ tag: 'plumbing', count: 4 }]);
  assert.deepEqual(s.topWorkers, [{ freelancerId: 'f1', avgRating: 5, reviewCount: 2 }]);
});

test('shapeFacetResult: no reviews', () => {
  const s = shapeFacetResult({ ratingDistribution: [], topSkillTags: [], overallAverage: [], overallWorkerRatings: [] });
  assert.equal(s.totalReviews, 0);
  assert.equal(s.averageRating, null);
  assert.ok(s.ratingDistribution.every((r) => r.count === 0 && r.percent === 0));
});
