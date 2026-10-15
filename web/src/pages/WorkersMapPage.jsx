// Workflow 3 (MongoDB): who can reach the job site fastest?
//
// Data flow
//   1. Origin = a preset job site, or a point clicked on the map (kept in the URL).
//   2. GET /api/workers/nearby runs $geoNear on WorkerLocations (5 km); names and
//      "busy" come from PostgreSQL by freelancer_id.
//   3. React Query re-runs it every 5 s (polling), keeping the
//      previous result on screen meanwhile - no flicker, no page reload.
//   4. Ping ids not in the previous update are "new": they pop on the map and
//      flash in the list.
//   5. "Add fresh pings" inserts pings, because all seeded pings share one
//      created_at and the 2-hour TTL index deletes them together.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, qs } from '../api/client.js';
import { AGE_BUCKETS, colorForAge, MAP_STYLES, WorkerMap } from '../components/mongo/WorkerMap.jsx';
import { EmptyState, ErrorState, Loading } from '../components/StateViews.jsx';
import { Alert, Button, Card, Field, PageHeader } from '../components/ui.jsx';
import { formatAge } from '../lib/format.js';

const POLL_MS = 5_000;
const AUTO_SIM_MS = 10_000;
const SCOOTER_KMH = 18; // typical city speed on a two-wheeler, used for the travel estimate

const BANDS = [
  { maxKm: 1, label: 'Within 1 km' },
  { maxKm: 3, label: '1 to 3 km' },
  { maxKm: Infinity, label: '3 to 5 km' },
];

/** Errors caused by the address (bad job site or point), not by the service. */
const BAD_ORIGIN = new Set(['UNKNOWN_JOB_SITE', 'ORIGIN_REQUIRED', 'INVALID_NUMBER']);

/** The chosen map look, remembered in this browser (storage can be unavailable). */
function useMapLook() {
  const KEY = 'gigtask.mapLook';
  const [look, setLook] = useState(() => {
    try {
      const saved = window.localStorage.getItem(KEY);
      return MAP_STYLES.some((s) => s.id === saved) ? saved : 'night';
    } catch {
      return 'night';
    }
  });
  const choose = (next) => {
    setLook(next);
    try {
      window.localStorage.setItem(KEY, next);
    } catch {
      /* not remembered, still applied */
    }
  };
  return [look, choose];
}

function useNow(ms) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

const initials = (name) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');

const travelMinutes = (km) => Math.max(1, Math.round((km / SCOOTER_KMH) * 60));

function Avatar({ name, age, busy, size = 'md' }) {
  return (
    <span
      className={`avatar avatar-${size} ${busy ? 'avatar-busy' : ''}`}
      style={{ background: colorForAge(age) }}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}

export function WorkersMapPage() {
  const [params, setParams] = useSearchParams();
  const queryClient = useQueryClient();

  // ---- origin (job site preset or clicked point), kept in the URL
  const jobSite = params.get('site') || (params.get('lat') ? '' : 'part-a');
  const pointLat = params.get('lat');
  const pointLng = params.get('lng');
  const originQuery = jobSite ? { jobSite } : { lat: pointLat, lng: pointLng };
  const resetOrigin = () => setParams({}, { replace: true });

  const sites = useQuery({ queryKey: ['workers', 'job-sites'], queryFn: () => api.get('/api/workers/job-sites'), staleTime: Infinity });

  // ---- options
  const [maxAge, setMaxAge] = useState('');
  const [autoSim, setAutoSim] = useState(false);
  const [highlightId, setHighlightId] = useState(null);
  const [focus, setFocus] = useState(null);
  const [fitKey, setFitKey] = useState(0);
  const [look, setLook] = useMapLook();
  const showWholeArea = () => {
    setFocus(null);
    setHighlightId(null);
    setFitKey((k) => k + 1);
  };

  const nearby = useQuery({
    queryKey: ['workers', 'nearby', originQuery, maxAge],
    // mode=workers: one row per worker (latest location). The API's mode=pings
    // (Part A's raw nearest-5 pipeline) is not shown in the UI.
    queryFn: () => api.get(`/api/workers/nearby${qs({ ...originQuery, mode: 'workers', maxAgeMinutes: maxAge })}`),
    refetchInterval: (q) => (BAD_ORIGIN.has(q.state.error?.code) ? false : POLL_MS),
    refetchIntervalInBackground: false,
    placeholderData: keepPreviousData,
  });
  const badOrigin = nearby.isError && BAD_ORIGIN.has(nearby.error?.code);

  const simulate = useMutation({
    mutationFn: () => api.post('/api/workers/pings/simulate', { ...originQuery, count: 8 }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['workers'] }),
  });

  // Auto-add pings while switched on (keeps the map moving in the demo).
  const simulateRef = useRef(simulate.mutate);
  simulateRef.current = simulate.mutate;
  const originKey = JSON.stringify(originQuery);
  useEffect(() => {
    if (!autoSim || badOrigin) return undefined;
    simulateRef.current(); // first batch right away, so ticking the box visibly does something
    const t = setInterval(() => simulateRef.current(), AUTO_SIM_MS);
    return () => clearInterval(t);
  }, [autoSim, originKey, badOrigin]);

  // ---- "new since the previous update" (reset when the origin or filter changes)
  const prev = useRef({ key: null, ids: new Set() });
  const resultKey = JSON.stringify([originQuery, maxAge]);
  const results = badOrigin ? undefined : nearby.data?.results;
  const newIds = useMemo(() => {
    if (!results || prev.current.key !== resultKey) return new Set();
    return new Set(results.filter((r) => !prev.current.ids.has(r.pingId)).map((r) => r.pingId));
  }, [results, resultKey]);
  useEffect(() => {
    if (results && !nearby.isPlaceholderData) prev.current = { key: resultKey, ids: new Set(results.map((r) => r.pingId)) };
  }, [results, resultKey, nearby.isPlaceholderData]);

  // ---- ages keep counting between updates
  const now = useNow(1000);
  const sinceFetch = nearby.data ? Math.max(0, (now - Date.parse(nearby.data.generatedAt)) / 1000) : 0;
  const rows = (results || []).map((r) => ({ ...r, age: r.ageSeconds + sinceFetch }));
  const origin = badOrigin ? null : nearby.data?.origin;
  // Spotlight the nearest worker who is free to start; if everyone nearby is on
  // a gig, the nearest one overall (and say so).
  const nearest = rows.find((r) => !r.busy) ?? rows[0];
  const bands = BANDS.map((b, i) => ({
    ...b,
    rows: rows.filter((r) => r.distanceKm <= b.maxKm && (i === 0 || r.distanceKm > BANDS[i - 1].maxKm)),
  })).filter((b) => b.rows.length > 0);

  return (
    <>
      <PageHeader
        title={origin ? `Workers near ${origin.jobSite ? origin.label : 'your pinned point'}` : 'Workers near a job site'}
        description="Available workers within 5 km, nearest first. The map updates by itself as workers send their location."
      />

      <Card className="dispatch-controls">
        <div className="toolbar">
          <Field label="Job site" htmlFor="workers-site">
            <select
              id="workers-site"
              className="input"
              value={jobSite}
              onChange={(e) => setParams(e.target.value ? { site: e.target.value } : {}, { replace: true })}
            >
              {!jobSite && <option value="">Pinned on the map</option>}
              {sites.data?.items.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Last seen" htmlFor="workers-age">
            <select id="workers-age" className="input" value={maxAge} onChange={(e) => setMaxAge(e.target.value)}>
              <option value="">Any time (last 2 hours)</option>
              <option value="15">Last 15 minutes</option>
              <option value="60">Last hour</option>
            </select>
          </Field>
          {/* Stand-ins for workers' phones: seeded locations expire after 2 hours. */}
          <div className="sim-controls">
            <label className="switch">
              <input type="checkbox" checked={autoSim} onChange={(e) => setAutoSim(e.target.checked)} />
              <span>Simulate workers moving</span>
            </label>
            <Button variant="secondary" loading={simulate.isPending} onClick={() => simulate.mutate()} disabled={badOrigin}>
              Add fresh pings
            </Button>
          </div>
        </div>
        <p className="field-hint">Click anywhere on the map to search around that point instead.</p>
        {simulate.isError && <Alert tone="danger">{simulate.error.message}</Alert>}
      </Card>

      {nearby.isPending && <Loading label="Finding nearby workers…" />}

      {badOrigin && (
        <ErrorState title="We couldn’t find that location" error={nearby.error}>
          <Button size="sm" onClick={resetOrigin}>
            Go to the default job site
          </Button>
        </ErrorState>
      )}

      {nearby.isError && !badOrigin && !nearby.data && <ErrorState error={nearby.error} onRetry={() => nearby.refetch()} />}

      {origin && (
        <>
          {nearby.isError && (
            <Alert tone="warning" title="Live update paused">
              The last update did not arrive, so you are seeing the previous result. It will retry on its own.
            </Alert>
          )}

          <div className="dispatch">
            <div className="dispatch-map">
              <WorkerMap
                origin={origin}
                results={rows}
                newIds={newIds}
                highlightId={highlightId}
                onHighlight={setHighlightId}
                focus={focus}
                fitKey={fitKey}
                look={look}
                onPick={({ lat, lng }) => setParams({ lat: lat.toFixed(5), lng: lng.toFixed(5) }, { replace: true })}
              />
              <div className="map-looks" role="group" aria-label="Map style">
                {MAP_STYLES.map((s) => (
                  <button key={s.id} type="button" aria-pressed={look === s.id} onClick={() => setLook(s.id)}>
                    {s.label}
                  </button>
                ))}
              </div>
              <div className="map-key" aria-label="Map key">
                {AGE_BUCKETS.map((b) => (
                  <span key={b.label}>
                    <i className="key-dot" style={{ background: b.dot, color: b.dot }} /> {b.label}
                  </span>
                ))}
                <span>
                  <i className="key-dot key-busy" /> On a gig
                </span>
              </div>
            </div>

            <aside className="dispatch-panel" aria-label="Nearest workers">
              <div className="live-bar" aria-live="polite">
                <span className="live-dot is-live" aria-hidden="true" />
                <span>Live, updated {formatAge(sinceFetch)}</span>
                {newIds.size > 0 && <span className="new-chip">{newIds.size} new</span>}
                {nearby.isFetching && <span className="spinner spinner-inline" aria-label="Updating" />}
                {focus && (
                  <button type="button" className="link-button" onClick={showWholeArea}>
                    Show the whole 5 km area
                  </button>
                )}
              </div>

              {nearest ? (
                <div className="spotlight">
                  <Avatar name={nearest.name} age={nearest.age} busy={nearest.busy} size="lg" />
                  <div className="spotlight-body">
                    <span className="spotlight-kicker">
                      {nearest.busy ? 'Nearest worker (everyone close by is on a gig)' : 'Nearest worker free to start'}
                    </span>
                    <strong className="spotlight-name">{nearest.name}</strong>
                    <span className="spotlight-distance">
                      {nearest.distanceKm.toFixed(2)} km
                      <span title={`Estimate at ${SCOOTER_KMH} km/h, the usual city speed on a scooter`}>
                        about {travelMinutes(nearest.distanceKm)} min by scooter
                      </span>
                    </span>
                    <span className="muted">Seen {formatAge(nearest.age)}</span>
                    <Link className="btn btn-primary btn-sm" to={`/freelancers/${nearest.freelancerId}`}>
                      View profile
                    </Link>
                  </div>
                </div>
              ) : (
                <EmptyState title="No available workers within 5 km">
                  Locations older than 2 hours are removed automatically. Press “Add fresh pings” to simulate workers sending
                  their location, or turn on “Simulate workers moving”.
                </EmptyState>
              )}

              {bands.map((band) => (
                <section key={band.label} className="band">
                  <h3 className="band-title">
                    {band.label}
                    <span className="band-count">
                      {band.rows.length} {band.rows.length === 1 ? 'worker' : 'workers'}
                    </span>
                  </h3>
                  <ol className="worker-list">
                    {band.rows.map((r) => (
                      <li
                        key={r.pingId}
                        className={`worker-item ${r.pingId === highlightId ? 'is-highlighted' : ''} ${newIds.has(r.pingId) ? 'is-new' : ''}`}
                        onMouseEnter={() => setHighlightId(r.pingId)}
                        onMouseLeave={() => !focus && setHighlightId(null)}
                      >
                        <Avatar name={r.name} age={r.age} busy={r.busy} />
                        <span className="worker-main">
                          <Link to={`/freelancers/${r.freelancerId}`}>{r.name}</Link>
                          <span className="muted">
                            Seen {formatAge(r.age)}
                            {r.busy && ', on a gig'}
                          </span>
                        </span>
                        <button
                          type="button"
                          className="worker-distance"
                          onClick={() => {
                            setFocus({ lat: r.lat, lng: r.lng });
                            setHighlightId(r.pingId);
                          }}
                          title="Show on map"
                        >
                          {r.distanceKm.toFixed(2)} km
                          <span className="distance-track" aria-hidden="true">
                            <span style={{ width: `${Math.min(100, (r.distanceKm / 5) * 100)}%` }} />
                          </span>
                        </button>
                      </li>
                    ))}
                  </ol>
                </section>
              ))}
            </aside>
          </div>
        </>
      )}
    </>
  );
}
