// Workflow 3: nearest available workers to a job site ($geoNear, 5 km).
//
//   GET  /api/workers/job-sites         preset origins (central Delhi NCR)
//   GET  /api/workers/nearby            map + list, polled by the UI
//   GET  /api/workers/stats             collection size, newest/oldest ping, TTL
//   POST /api/workers/pings/simulate    insert fresh pings so the map moves
import { Router } from 'express';
import { query } from '../db/postgres.js';
import { getMongoDb } from '../db/mongo.js';
import { asyncHandler, HttpError, optionalNumber } from '../lib/http.js';
import { freelancerInfo } from '../lib/lookups.js';
import { randomPointNear } from '../mongo/geo.js';
import { geoNearPingsPipeline, geoNearWorkersPipeline, PART_A_JOB_SITE, RADIUS_METERS } from '../mongo/pipelines.js';

export const workersRouter = Router();

// GigTask has no job-site table, so job sites are presets inside the area the
// seeder uses for freelancers (lat 28.40-28.90, lng 76.90-77.40), plus any
// point clicked on the map. The first one is Part A's own example point.
export const JOB_SITES = [
  { id: 'part-a', name: 'Janpath', ...PART_A_JOB_SITE }, // Part A's example point
  { id: 'connaught-place', name: 'Connaught Place', lat: 28.6315, lng: 77.2167 },
  { id: 'karol-bagh', name: 'Karol Bagh', lat: 28.6519, lng: 77.1909 },
  { id: 'saket', name: 'Saket', lat: 28.5245, lng: 77.2066 },
  { id: 'dwarka', name: 'Dwarka Sector 21', lat: 28.5523, lng: 77.0586 },
  { id: 'rohini', name: 'Rohini', lat: 28.7495, lng: 77.0565 },
  { id: 'cyber-city', name: 'Gurugram Cyber City', lat: 28.495, lng: 77.0895 },
  { id: 'noida-18', name: 'Noida Sector 18', lat: 28.57, lng: 77.326 },
];

workersRouter.get('/job-sites', (_req, res) => res.json({ items: JOB_SITES, radiusKm: RADIUS_METERS / 1000 }));

function resolveOrigin(q) {
  if (q.jobSite) {
    const site = JOB_SITES.find((s) => s.id === q.jobSite);
    if (!site) throw new HttpError(400, 'UNKNOWN_JOB_SITE', 'Unknown job site.');
    return { lng: site.lng, lat: site.lat, label: site.name, jobSite: site.id };
  }
  const lng = optionalNumber(q.lng, 'lng', { min: -180, max: 180 });
  const lat = optionalNumber(q.lat, 'lat', { min: -90, max: 90 });
  if (lng === null || lat === null) {
    throw new HttpError(400, 'ORIGIN_REQUIRED', 'Provide jobSite, or both lng and lat.');
  }
  return { lng, lat, label: 'Custom point', jobSite: null };
}

// GET /api/workers/nearby?jobSite=|lng=&lat=&mode=workers|pings&limit=&maxAgeMinutes=
workersRouter.get(
  '/nearby',
  asyncHandler(async (req, res) => {
    const origin = resolveOrigin(req.query);
    const mode = req.query.mode === 'pings' ? 'pings' : 'workers';
    const limit = optionalNumber(req.query.limit, 'limit', { min: 1, max: 100, integer: true }) ?? (mode === 'pings' ? 5 : 25);
    const maxAgeMinutes = optionalNumber(req.query.maxAgeMinutes, 'maxAgeMinutes', { min: 1, max: 1440, integer: true });

    const pipeline =
      mode === 'pings'
        ? geoNearPingsPipeline({ lng: origin.lng, lat: origin.lat, limit })
        : geoNearWorkersPipeline({
            lng: origin.lng,
            lat: origin.lat,
            limit,
            since: maxAgeMinutes ? new Date(Date.now() - maxAgeMinutes * 60_000) : null,
          });

    const db = await getMongoDb();
    const started = Date.now();
    const docs = await db.collection('WorkerLocations').aggregate(pipeline).toArray();
    const queryMs = Date.now() - started;

    // Cross-database: names + whether the worker is busy (has an IN_PROGRESS
    // contract) come from PostgreSQL, in one query.
    const info = await freelancerInfo(docs.map((d) => d.freelancer_id));
    const now = Date.now();

    res.json({
      origin,
      radiusKm: RADIUS_METERS / 1000,
      mode,
      limit,
      maxAgeMinutes,
      queryMs,
      generatedAt: new Date(now).toISOString(),
      results: docs.map((d) => {
        const [lng, lat] = d.location.coordinates;
        const created = d.created_at instanceof Date ? d.created_at : new Date(d.created_at);
        const pg = info.get(d.freelancer_id);
        return {
          pingId: String(d._id),
          freelancerId: d.freelancer_id,
          name: pg?.name ?? 'Unknown worker',
          busy: Boolean(pg?.in_progress_contract_id),
          lng,
          lat,
          distanceKm: Math.round(d.distance_meters) / 1000,
          createdAt: created.toISOString(),
          ageSeconds: Math.max(0, Math.round((now - created.getTime()) / 1000)),
          pingsInRadius: d.pings_in_radius ?? null,
        };
      }),
    });
  }),
);

// GET /api/workers/stats - explains why the map changes on its own (TTL)
workersRouter.get(
  '/stats',
  asyncHandler(async (_req, res) => {
    const db = await getMongoDb();
    const pings = db.collection('WorkerLocations');
    const [total, available, newest, oldest, indexes] = await Promise.all([
      pings.estimatedDocumentCount(),
      pings.countDocuments({ is_available: true }),
      pings.find({}, { projection: { created_at: 1 } }).sort({ created_at: -1 }).limit(1).next(),
      pings.find({}, { projection: { created_at: 1 } }).sort({ created_at: 1 }).limit(1).next(),
      pings.indexes(),
    ]);
    const ttl = indexes.find((i) => typeof i.expireAfterSeconds === 'number');
    res.json({
      totalPings: total,
      availablePings: available,
      newestPingAt: newest?.created_at ?? null,
      oldestPingAt: oldest?.created_at ?? null,
      ttlSeconds: ttl ? ttl.expireAfterSeconds : null,
      indexes: indexes.map((i) => ({ name: i.name, key: i.key, expireAfterSeconds: i.expireAfterSeconds })),
    });
  }),
);

// POST /api/workers/pings/simulate  { jobSite } | { lng, lat }, count?
//
// All seeded pings get created_at = seeding time, so the 2-hour TTL index
// deletes all of them at once two hours later and the map goes empty.
// This inserts fresh pings with the seeder's exact document shape:
//   - workers already near the origin "move" up to ~150 m (new ping each)
//   - the rest are available freelancers (picked in PostgreSQL) placed within
//     4 km of the origin
workersRouter.post(
  '/pings/simulate',
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    const origin = resolveOrigin(body);
    const count = optionalNumber(body.count, 'count', { min: 1, max: 50, integer: true }) ?? 8;

    const db = await getMongoDb();
    const pings = db.collection('WorkerLocations');
    const near = await pings
      .aggregate(geoNearWorkersPipeline({ lng: origin.lng, lat: origin.lat, limit: Math.ceil(count / 2) }))
      .toArray();

    const now = new Date();
    const docs = near.map((d) => {
      const [lng, lat] = d.location.coordinates;
      return makePing(d.freelancer_id, randomPointNear(lng, lat, 150), now);
    });

    const needed = count - docs.length;
    if (needed > 0) {
      const { rows } = await query(
        'SELECT id FROM freelancers WHERE is_available ORDER BY random() LIMIT $1',
        [needed],
      );
      rows.forEach((r) => docs.push(makePing(r.id, randomPointNear(origin.lng, origin.lat, RADIUS_METERS * 0.8), now)));
    }

    if (docs.length) await pings.insertMany(docs, { ordered: false });
    res.status(201).json({ inserted: docs.length, movedWorkers: near.length, at: now.toISOString() });
  }),
);

function makePing(freelancerId, { lng, lat }, at) {
  return {
    freelancer_id: freelancerId,
    location: { type: 'Point', coordinates: [lng, lat] },
    is_available: true,
    created_at: at,
  };
}
