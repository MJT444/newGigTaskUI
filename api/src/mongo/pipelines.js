// MongoDB aggregation pipelines for the Workers map (Workflow 3) and the
// Reviews screen (Workflow 4).
//
// They start from the inherited Part A pipelines in db/mongo/02_workflow3_geonear.js
// and db/mongo/03_workflow4_facet.js (those files are NOT modified) and keep every
// Part A stage and option. What the Assignment 2 screens need on top is added
// here, in the API, and marked "ADDED" with the reason. All functions only build arrays, so
// they are unit-tested without a database (test/pipelines.test.js).

/** Assignment 2 asks for a 5 km radius on the map (the Part A spec did not). */
export const RADIUS_METERS = 5000;

/** Part A's example job site (db/mongo/02_workflow3_geonear.js): central New Delhi. */
export const PART_A_JOB_SITE = { lng: 77.209, lat: 28.6139 };

// ---------------------------------------------------------------------------
// Workflow 3: available workers near a job site
// ---------------------------------------------------------------------------

/**
 * "Raw pings" mode = the Part A pipeline + the Assignment 2 5 km limit.
 * Returns the nearest available ping documents; one worker can appear several
 * times because each worker has ~250 pings around their base.
 */
export function geoNearPingsPipeline({ lng, lat, limit = 5 }) {
  return [
    {
      // Must be the FIRST stage: the only stage that can use the 2dsphere index
      // (location_2dsphere). Output is already sorted nearest-first.
      $geoNear: {
        near: { type: 'Point', coordinates: [lng, lat] }, // GeoJSON order: [longitude, latitude]
        distanceField: 'distance_meters',
        maxDistance: RADIUS_METERS, // ADDED: Assignment 2 map radius (Part A searched any distance, per its spec)
        spherical: true,
        query: { is_available: true }, // applied while walking the index
      },
    },
    { $limit: limit }, // Part A: 5
    {
      $project: {
        _id: 1, // ADDED: stable key for each dot on the map (Part A had _id: 0)
        freelancer_id: 1,
        distance_meters: { $round: ['$distance_meters', 1] },
        location: 1,
        created_at: 1,
      },
    },
  ];
}

/**
 * "Workers" mode (map default): same $geoNear, then ONE row per worker - their
 * most recent available ping inside 5 km - nearest first.
 *
 * @param since optional Date: ignore pings older than this (freshness filter)
 */
export function geoNearWorkersPipeline({ lng, lat, limit = 25, since = null }) {
  const query = { is_available: true };
  if (since) query.created_at = { $gte: since }; // ADDED: freshness, filtered during the index walk

  return [
    {
      $geoNear: {
        near: { type: 'Point', coordinates: [lng, lat] },
        distanceField: 'distance_meters',
        maxDistance: RADIUS_METERS,
        spherical: true,
        query,
      },
    },
    // ADDED: newest ping first inside each worker, so $first below = latest ping
    { $sort: { freelancer_id: 1, created_at: -1, distance_meters: 1 } },
    {
      // ADDED: one row per worker
      $group: {
        _id: '$freelancer_id',
        latest: { $first: '$$ROOT' },
        pings_in_radius: { $sum: 1 },
      },
    },
    { $replaceRoot: { newRoot: { $mergeObjects: ['$latest', { pings_in_radius: '$pings_in_radius' }] } } },
    // $group does not keep order, so sort by distance again
    { $sort: { distance_meters: 1, freelancer_id: 1 } },
    { $limit: limit },
    {
      $project: {
        _id: 1,
        freelancer_id: 1,
        distance_meters: { $round: ['$distance_meters', 1] },
        location: 1,
        created_at: 1,
        pings_in_radius: 1,
      },
    },
  ];
}

// ---------------------------------------------------------------------------
// Workflow 4: review analytics in one $facet
// ---------------------------------------------------------------------------

/**
 * Part A pipeline (db/mongo/03_workflow4_facet.js) with:
 *   - the period as a parameter (Part A: fixed 90 days); since = null = all time
 *   - an optional freelancer filter (ADDED) so one freelancer can be analysed
 *   - an overallAverage facet (ADDED: Assignment 2 asks for the overall average;
 *     the Part A spec asked for per-worker ratings, which overallWorkerRatings keeps)
 *
 * The $match uses the inherited indexes created_at_1 (all freelancers) and
 * freelancer_id_1 (one freelancer).
 */
export function reviewFacetPipeline({ since = null, freelancerId = null } = {}) {
  const match = {};
  if (freelancerId) match.freelancer_id = freelancerId;
  if (since) match.created_at = { $gte: since };

  return [
    { $match: match },
    {
      $facet: {
        ratingDistribution: [
          { $group: { _id: '$rating', count: { $sum: 1 } } },
          { $sort: { _id: 1 } },
        ],
        topSkillTags: [
          { $unwind: '$skill_tags' },
          { $group: { _id: '$skill_tags', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 10 },
        ],
        overallAverage: [
          { $group: { _id: null, avg_rating: { $avg: '$rating' }, total_reviews: { $sum: 1 } } },
          { $project: { _id: 0, avg_rating: { $round: ['$avg_rating', 2] }, total_reviews: 1 } },
        ],
        overallWorkerRatings: [
          {
            $group: {
              _id: '$freelancer_id',
              avg_rating: { $avg: '$rating' },
              review_count: { $sum: 1 },
            },
          },
          { $sort: { avg_rating: -1, review_count: -1 } },
          { $limit: 10 },
          { $project: { _id: 1, avg_rating: { $round: ['$avg_rating', 2] }, review_count: 1 } },
        ],
      },
    },
  ];
}

/**
 * Shapes the single $facet document for the UI:
 *  - all five star values (missing = 0) so the chart axis never jumps,
 *  - unwraps overallAverage (array of 0 or 1),
 *  - percentages.
 */
export function shapeFacetResult(facetDoc) {
  const doc = facetDoc || {};
  const overall = (doc.overallAverage || [])[0] || null;
  const total = overall ? overall.total_reviews : 0;
  const byRating = new Map((doc.ratingDistribution || []).map((r) => [r._id, r.count]));

  return {
    totalReviews: total,
    averageRating: overall ? overall.avg_rating : null,
    ratingDistribution: [1, 2, 3, 4, 5].map((rating) => {
      const count = byRating.get(rating) || 0;
      return { rating, count, percent: total ? Math.round((count / total) * 1000) / 10 : 0 };
    }),
    topTags: (doc.topSkillTags || []).map((t) => ({ tag: t._id, count: t.count })),
    topWorkers: (doc.overallWorkerRatings || []).map((w) => ({
      freelancerId: w._id,
      avgRating: w.avg_rating,
      reviewCount: w.review_count,
    })),
  };
}
