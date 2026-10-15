# MongoDB front end — how it works, file by file

The two MongoDB screens: **Workers map** (Workflow 3, `$geoNear` on `WorkerLocations`) and
**Reviews & portfolios** (Workflow 4, `$facet` on `GigReviews` + the flexible `Portfolios` documents).

## 1. One request, end to end

```
Browser (React)                      API (Express)                        Databases
───────────────                      ─────────────                        ─────────
WorkersMapPage.jsx                   routes/workers.js
  useQuery(['workers','nearby',…])     GET /api/workers/nearby
  refetchInterval: 5000 ───────────►     resolveOrigin()  (preset job site or clicked point)
                                         geoNearWorkersPipeline()  (mongo/pipelines.js)
                                         WorkerLocations.aggregate() ─────► MongoDB 2dsphere index
                                         freelancerInfo(ids) ─────────────► PostgreSQL: names, busy
  ◄──────────────── { origin, results[], queryMs, generatedAt }
WorkerMap.jsx: circle + dots;  list on the right, nearest first
```

The browser never talks to a database. The API holds the credentials and joins the two stores on
`freelancer_id` (the PostgreSQL `freelancers.id` UUID stored as a string in every Mongo document).

## 2. Files

| File | Role |
|---|---|
| `db/mongo/01_collections_and_indexes.js` | inherited: collections, `location_2dsphere`, TTL 7200 s, review indexes |
| `db/mongo/02_workflow3_geonear.js` | inherited `$geoNear` (unchanged) |
| `db/mongo/03_workflow4_facet.js` | inherited `$facet` (unchanged) |
| `api/src/mongo/pipelines.js` | builds the pipelines from the inherited ones + what Assignment 2 needs; pure functions, unit-tested |
| `api/src/mongo/geo.js` | random point in a circle (simulated pings), haversine (tests) |
| `api/src/lib/lookups.js` | `freelancerInfo(ids)`: one PostgreSQL query for names + “busy” |
| `api/src/routes/workers.js` | job sites, nearby, stats, simulate |
| `api/src/routes/reviews.js` | facet summary, review list |
| `api/src/routes/freelancers.js` | `GET /:id/portfolio` |
| `web/src/pages/WorkersMapPage.jsx` | map screen: origin, polling, new-ping detection, live ages, simulation |
| `web/src/components/mongo/WorkerMap.jsx` | Leaflet: tiles, 5 km circle, job site, worker dots, click-to-pick |
| `web/src/pages/ReviewsPage.jsx` | facet stats, charts, top workers, review list |
| `web/src/components/mongo/PortfolioCard.jsx` | renders a Portfolios document, present/missing fields, raw JSON |

## 3. Workflow 3 — nearest workers to a job site

### Data

```js
// WorkerLocations (500,000 docs from mongo_seeder.py)
{ freelancer_id: "<postgres uuid>", is_available: true,
  location: { type: "Point", coordinates: [lng, lat] },   // GeoJSON: longitude FIRST
  created_at: ISODate }                                     // TTL: deleted 7200 s later
```

Each of the 2,000 freelancers has ~250 pings within ±0.05° (~5 km) of their base in Delhi NCR.

### Pipeline, stage by stage

**Raw pings** (`GET /api/workers/nearby?mode=pings`, not shown in the UI; demonstrated in mongosh) = Part A + the 5 km limit:

| Stage | Why |
|---|---|
| `$geoNear { near, distanceField: "distance_meters", maxDistance: 5000, spherical: true, query: { is_available: true } }` | Must be the **first** stage — the only one that can use the 2dsphere index. Output is sorted nearest-first, distance in metres. `query` filters during the index walk. The Part A spec asked for the closest worker at any distance, so the inherited file has no `maxDistance`; Assignment 2's map needs 5 km, so the API adds it (the file is unchanged). |
| `$limit 5` | Part A's size |
| `$project` | `distance_meters` rounded; we keep `_id` (React key per dot) |

**Workers** (default) — same `$geoNear`, then:

| Stage | Why |
|---|---|
| `$sort { freelancer_id: 1, created_at: -1 }` | newest ping first inside each worker |
| `$group { _id: "$freelancer_id", latest: { $first: "$$ROOT" }, pings_in_radius: { $sum: 1 } }` | one row per worker; `$first` after that sort = latest ping |
| `$replaceRoot` | back to a flat ping document |
| `$sort { distance_meters: 1 }` | **`$group` loses order**, so sort by distance again |
| `$limit`, `$project` | size and shape |

Optional freshness (`maxAgeMinutes`): `created_at: { $gte: since }` is added **inside** `$geoNear.query`.

Why both: with ~250 pings per worker, Part A's nearest 5 pings are often one or two people. A client
asks “which **workers** are near?”, so that is the default.

### Origin

Presets (`GET /api/workers/job-sites`) — the first is Part A's own point `[77.2090, 28.6139]` — or any
point clicked on the map (`?lat=&lng=` in the URL). GigTask has no job-site table.

### “New pings appear without a page reload”

1. `useQuery({ refetchInterval: 5000, placeholderData: keepPreviousData })` re-runs every 5 s; old dots stay while loading.
2. `newIds` = ping ids not in the previous result for the same origin/mode (a `useRef` remembers them; reset when the origin changes).
3. New dots pulse (`ping-new`), new rows flash, the live bar shows “N new”.
4. Ages count up every second between polls (`useNow(1000)` + seconds since `generatedAt`).
5. Colour = age bucket (< 2 min, 2–15 min, older); orange ring = has a gig **in progress** in PostgreSQL.

### Why “Add fresh pings” exists

The seeder gives **all** pings the same `created_at`, so the TTL index deletes the whole collection two hours
after seeding. `POST /api/workers/pings/simulate`:
- finds workers near the origin now and gives each a new ping ≤ 150 m away (they “move”);
- adds the rest as random **available** freelancers from PostgreSQL placed within 4 km
  (`randomPointNear` uses `sqrt(random)` on the radius so points spread evenly over the disc);
- inserts documents with the seeder's exact shape, so the indexes and TTL treat them normally.

### Map details

- **Leaflet + OpenStreetMap**: no API key; needs internet in the browser.
- **`CircleMarker`** (SVG), not Leaflet's `Marker`: default markers load PNG icons by relative URL, which Vite breaks.
- `FitToOrigin` frames the whole circle when the origin changes; the circle is `radius={5000}` — the same number as `maxDistance`.
- GeoJSON is `[lng, lat]`, Leaflet is `[lat, lng]`: the API unpacks `coordinates` into `lng`, `lat` fields.

## 4. Workflow 4 — reviews and portfolios

### `$facet`

```js
[{ $match: { created_at: { $gte: since } } },        // + freelancer_id when one freelancer is chosen
 { $facet: {
     ratingDistribution:   [$group by rating, $sort],
     topSkillTags:         [$unwind skill_tags, $group, $sort count desc, $limit 10],
     overallAverage:       [$group _id:null → $avg + count, $round 2],          // ADDED in the API (Assignment 2 asks for it)
     overallWorkerRatings: [$group by freelancer_id → avg + count, $sort, $limit 10] } }]
```

- One `$match` (inherited index `created_at_1`, or `freelancer_id_1` for one freelancer), then **four sub-pipelines over
  the same documents in one pass**, returning **one** document with four arrays.
- `$unwind` turns a review with `["plumbing","painting"]` into two documents so tags can be counted.
- `$group` with `_id: null` = one group for everything.
- `$facet` returns a document even when nothing matched (all arrays empty) → empty state.
- `shapeFacetResult()` fills missing star values with 0 (fixed chart axis), unwraps the average, adds percentages.
- `topWorkers` ids are turned into names with one PostgreSQL query.

Default view = Part A exactly: all freelancers, last 90 days. Click a top worker → the same pipeline for that
freelancer (default “all time”: ~10 reviews per freelancer per year).

### The flexible catalog: `Portfolios`

```js
{ freelancer_id, name, skills: [...],                  // always
  certifications?: [{ title, issued_by, year }],       // ~70% of documents
  years_experience?, bio?, hourly_rate?, languages? }  // 50% / 40% / 30% / 20%
```

Optional fields differ per document — the reason it lives in MongoDB (in SQL: nullable columns plus a
certifications table). `PortfolioCard` renders only what exists, lists present (✓) and missing (struck-through)
optional fields (the raw document is shown in mongosh during the demo, not in the UI). The API looks it up with
`findOne({ freelancer_id })`. Portfolios has only the `_id` index, so this scans 2,000 small documents — a few milliseconds, so no index was added to the inherited database.

## 5. Wording on screen

Screens never show database names, field names or raw error text, and have no technical explanation sections; the
exact pipelines, indexes and TTL behaviour are documented in this guide and explained in the demo video instead.
Errors are mapped from the API's error `code` to a sentence in `web/src/api/client.js`; a bad link or value (4xx) shows
a way out (e.g. *Go to the default job site*, *Show all freelancers*) instead of a *Try again* that would fail again.

The Workers screen is a dispatch board: distance rings at 1, 3 and 5 km, one ripple from the job site when it changes,
a *Nearest worker free to start* card (with a travel estimate at 18 km/h, the usual city speed on a scooter), the list
grouped by distance band with avatars coloured like the map dots, and a click on a distance flies the map to that worker.

## 6. Errors and empty states

| Situation | User sees |
|---|---|
| MongoDB stopped | red MongoDB dot; map/reviews panels: “MongoDB is not reachable” + *Try again*; PostgreSQL screens keep working |
| no workers within 5 km | empty state that explains the TTL and offers fresh pings |
| a poll fails after a good one | previous map stays + yellow “Last update failed” |
| no reviews in the period | empty state suggesting a longer period |
| freelancer without a portfolio | empty state in the portfolio card |

## 7. Check it yourself (mongosh)

```js
// Docker: docker compose exec mongo mongosh gigtask
db.WorkerLocations.getIndexes()                          // location_2dsphere + created_at TTL 7200
db.WorkerLocations.countDocuments({ created_at: { $gte: new Date(Date.now() - 15*60*1000) } })
db.GigReviews.countDocuments({ created_at: { $gte: new Date(Date.now() - 90*86400000) } })  // = UI total
db.Portfolios.findOne({ certifications: { $exists: false } })                               // a sparse one
```

## 8. Likely viva questions

**Why must `$geoNear` be first?** Only the first stage can use the geospatial index; it also produces the distance and the nearest-first order.

**Why `query` inside `$geoNear` and not a `$match` before it?** Nothing may come before `$geoNear`; `query` filters during the index walk, so `$limit` counts only matching documents.

**Units of `maxDistance`?** Metres (GeoJSON point, `spherical: true`).

**Did you change the Part A pipelines?** No — the files in `db/mongo/` are unchanged. The API builds on them: `maxDistance: 5000` (Assignment 2 wants 5 km; the Part A spec had no radius), grouping per worker (Part A returns pings, so workers repeat), and an `overallAverage` facet (Assignment 2 wants the overall average; the Part A spec asked for per-worker ratings, which is kept).

**What does TTL do here?** A background job (~every 60 s) deletes documents whose `created_at` is older than 7,200 s. Every seeded ping has the same `created_at`, so the whole collection disappears together two hours after seeding.

**Polling vs WebSockets / change streams?** The brief allows polling; it is stateless and simple. Change streams need a replica set, which the single-node Docker MongoDB is not.

**Why `$sort` after `$group`?** `$group` output order is not guaranteed.

**Why `$facet` instead of four queries?** One index scan, one round trip, and every facet sees the same documents.

**How are the two databases linked?** Mongo documents store PostgreSQL `freelancers.id` as `freelancer_id`; the API fetches names and “busy” status in one `WHERE id = ANY($1)` query.

**Why is Portfolios in MongoDB?** Its optional fields vary per freelancer; a document stores only what exists.

**Is the ping simulation cheating?** No — ordinary inserts through the driver, same shape as the seed; the pipeline, indexes and TTL treat them like any ping. It stands in for workers' phones.
