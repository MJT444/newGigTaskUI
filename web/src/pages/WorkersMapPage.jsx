// Workflow 3 (MongoDB): available workers within 5 km of a job site.
//
// Data flow
//   1. Origin = a preset job site, or a point clicked on the map (kept in the URL).
//   2. GET /api/workers/nearby runs $geoNear on WorkerLocations; names and
//      "busy" come from PostgreSQL by freelancer_id.
//   3. React Query re-runs it every 5 s while Live is on (polling), keeping the
//      previous result on screen meanwhile - no flicker, no page reload.
//   4. Ping ids not in the previous poll are "new" and pulse.
//   5. "Add fresh pings" inserts pings, because all seeded pings share one
//      created_at and the 2-hour TTL index deletes them together.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, qs } from '../api/client.js';
import { AGE_BUCKETS, colorForAge, WorkerMap } from '../components/mongo/WorkerMap.jsx';
import { EmptyState, ErrorState, Loading } from '../components/StateViews.jsx';
import { Alert, Badge, Button, Card, Field, PageHeader, StatCard, Tabs } from '../components/ui.jsx';
import { formatAge, formatDateTime, formatInt } from '../lib/format.js';

const POLL_MS = 5_000;
const AUTO_SIM_MS = 10_000;

function useNow(ms) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

export function WorkersMapPage() {
  const [params, setParams] = useSearchParams();
  const queryClient = useQueryClient();

  // ---- origin (job site preset or clicked point), kept in the URL
  const jobSite = params.get('site') || (params.get('lat') ? '' : 'part-a');
  const pointLat = params.get('lat');
  const pointLng = params.get('lng');
  const originQuery = jobSite ? { jobSite } : { lat: pointLat, lng: pointLng };

  const sites = useQuery({ queryKey: ['workers', 'job-sites'], queryFn: () => api.get('/api/workers/job-sites'), staleTime: Infinity });

  // ---- options
  const [mode, setMode] = useState('workers');
  const [maxAge, setMaxAge] = useState('');
  const [live, setLive] = useState(true);
  const [autoSim, setAutoSim] = useState(false);
  const [highlightId, setHighlightId] = useState(null);

  const nearby = useQuery({
    queryKey: ['workers', 'nearby', originQuery, mode, maxAge],
    queryFn: () => api.get(`/api/workers/nearby${qs({ ...originQuery, mode, maxAgeMinutes: mode === 'workers' ? maxAge : '' })}`),
    refetchInterval: live ? POLL_MS : false,
    refetchIntervalInBackground: false,
    placeholderData: keepPreviousData,
  });

  const stats = useQuery({
    queryKey: ['workers', 'stats'],
    queryFn: () => api.get('/api/workers/stats'),
    refetchInterval: live ? 30_000 : false,
  });

  const simulate = useMutation({
    mutationFn: () => api.post('/api/workers/pings/simulate', { ...originQuery, count: 8 }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['workers'] }),
  });

  // Auto-add pings while switched on (keeps the map moving in the demo).
  const simulateRef = useRef(simulate.mutate);
  simulateRef.current = simulate.mutate;
  const originKey = JSON.stringify(originQuery);
  useEffect(() => {
    if (!autoSim) return undefined;
    const t = setInterval(() => simulateRef.current(), AUTO_SIM_MS);
    return () => clearInterval(t);
  }, [autoSim, originKey]);

  // ---- "new since the previous poll" (reset when origin/mode change)
  const prev = useRef({ key: null, ids: new Set() });
  const resultKey = JSON.stringify([originQuery, mode, maxAge]);
  const results = nearby.data?.results;
  const newIds = useMemo(() => {
    if (!results || prev.current.key !== resultKey) return new Set();
    return new Set(results.filter((r) => !prev.current.ids.has(r.pingId)).map((r) => r.pingId));
  }, [results, resultKey]);
  useEffect(() => {
    if (results && !nearby.isPlaceholderData) prev.current = { key: resultKey, ids: new Set(results.map((r) => r.pingId)) };
  }, [results, resultKey, nearby.isPlaceholderData]);

  // ---- ages keep counting between polls
  const now = useNow(1000);
  const sinceFetch = nearby.data ? Math.max(0, (now - Date.parse(nearby.data.generatedAt)) / 1000) : 0;
  const rows = (results || []).map((r) => ({ ...r, age: r.ageSeconds + sinceFetch }));
  const origin = nearby.data?.origin;

  return (
    <>
      <PageHeader
        title="Workers near a job site"
        description="Available workers within 5 km of the job site, nearest first. The map updates on its own as workers send their location."
      />

      <Card>
        <div className="toolbar">
          <Field label="Job site" htmlFor="workers-site">
            <select
              id="workers-site"
              className="input"
              value={jobSite}
              onChange={(e) => setParams(e.target.value ? { site: e.target.value } : {}, { replace: true })}
            >
              {!jobSite && <option value="">Custom point (clicked on map)</option>}
              {sites.data?.items.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Show">
            <Tabs
              label="Result type"
              value={mode}
              onChange={setMode}
              tabs={[
                { value: 'workers', label: 'Workers' },
                { value: 'pings', label: 'Latest pings (5 nearest)' },
              ]}
            />
          </Field>
          <Field label="Ping age" htmlFor="workers-age">
            <select id="workers-age" className="input" value={maxAge} onChange={(e) => setMaxAge(e.target.value)} disabled={mode === 'pings'}>
              <option value="">Any (last 2 hours)</option>
              <option value="15">Last 15 minutes</option>
              <option value="60">Last hour</option>
            </select>
          </Field>
          <div className="toolbar-actions">
            <label className="switch">
              <input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} />
              <span>Live (poll every {POLL_MS / 1000} s)</span>
            </label>
            <label className="switch">
              <input type="checkbox" checked={autoSim} onChange={(e) => setAutoSim(e.target.checked)} />
              <span>Auto-add pings every {AUTO_SIM_MS / 1000} s</span>
            </label>
            <Button variant="secondary" loading={simulate.isPending} onClick={() => simulate.mutate()}>
              Add fresh pings
            </Button>
          </div>
        </div>
        <p className="field-hint">Tip: click anywhere on the map to search around that point.</p>
        {simulate.isError && <Alert tone="danger">{simulate.error.message}</Alert>}
      </Card>

      {nearby.isPending && <Loading label="Finding nearby workers…" />}
      {nearby.isError && !nearby.data && <ErrorState error={nearby.error} onRetry={() => nearby.refetch()} />}

      {nearby.data && origin && (
        <>
          {nearby.isError && (
            <Alert tone="warning" title="Last update failed — showing the previous result">
              {nearby.error.message}
            </Alert>
          )}
          <div className="live-bar" aria-live="polite">
            <span className={`live-dot ${live ? 'is-live' : ''}`} aria-hidden="true" />
            {live ? 'Live' : 'Paused'} · updated {formatAge(sinceFetch)} · {rows.length} {mode === 'workers' ? 'workers' : 'pings'}
            {newIds.size > 0 && <Badge tone="success">{newIds.size} new</Badge>}
            {nearby.isFetching && <span className="spinner spinner-inline" aria-label="Updating" />}
          </div>

          <div className="map-layout">
            <div className="map-panel">
              <WorkerMap
                origin={origin}
                results={rows}
                newIds={newIds}
                highlightId={highlightId}
                onHighlight={setHighlightId}
                onPick={({ lat, lng }) => setParams({ lat: lat.toFixed(5), lng: lng.toFixed(5) }, { replace: true })}
              />
              <div className="map-legend" aria-label="Legend">
                <span>
                  <i className="legend-dot legend-origin" /> Job site
                </span>
                {AGE_BUCKETS.map((b) => (
                  <span key={b.label}>
                    <i className="legend-dot" style={{ background: b.color }} /> {b.label}
                  </span>
                ))}
                <span>
                  <i className="legend-dot" style={{ background: '#fff', boxShadow: '0 0 0 2px #b45309' }} /> Gig in progress
                </span>
                <span>
                  <i className="legend-ring" /> 5 km radius
                </span>
              </div>
            </div>

            <Card title="Nearest first" subtitle={`${origin.label} · ${origin.lat.toFixed(4)}, ${origin.lng.toFixed(4)}`} className="results-card">
              {rows.length === 0 ? (
                <EmptyState title="No available workers within 5 km">
                  Locations older than 2 hours are removed automatically. Press “Add fresh pings” to simulate workers sending
                  their location, or turn on auto-add.
                </EmptyState>
              ) : (
                <ol className="worker-list">
                  {rows.map((r, i) => (
                    <li
                      key={r.pingId}
                      className={`worker-item ${r.pingId === highlightId ? 'is-highlighted' : ''} ${newIds.has(r.pingId) ? 'is-new' : ''}`}
                      onMouseEnter={() => setHighlightId(r.pingId)}
                      onMouseLeave={() => setHighlightId(null)}
                    >
                      <span className="list-rank">{i + 1}</span>
                      <span className="legend-dot" style={{ background: colorForAge(r.age) }} aria-hidden="true" />
                      <span className="worker-main">
                        <Link to={`/freelancers/${r.freelancerId}`}>{r.name}</Link>
                        <span className="muted">
                          {formatAge(r.age)}
                          {mode === 'workers' && r.pingsInRadius > 1 && ` · ${r.pingsInRadius} pings here`}
                          {r.busy && ' · gig in progress'}
                        </span>
                      </span>
                      <span className="worker-distance">{r.distanceKm.toFixed(2)} km</span>
                    </li>
                  ))}
                </ol>
              )}
            </Card>
          </div>
        </>
      )}

      <Card title="Location updates" subtitle="Each worker’s phone reports where they are">
        {stats.isPending && <Loading />}
        {stats.isError && <ErrorState error={stats.error} onRetry={() => stats.refetch()} />}
        {stats.data && (
          <>
            <div className="stats-grid">
              <StatCard label="Locations stored" value={formatInt(stats.data.totalPings)} hint="approximate" />
              <StatCard label="Available" value={formatInt(stats.data.availablePings)} hint="locations from available workers" />
              <StatCard label="Newest location" value={formatDateTime(stats.data.newestPingAt)} />
              <StatCard label="Oldest location" value={formatDateTime(stats.data.oldestPingAt)} />
            </div>
            <p className="muted">
              Locations are kept for {stats.data.ttlSeconds ? `${stats.data.ttlSeconds / 3600} hours` : 'a limited time'} and then
              removed automatically, so the map only shows where workers are now.
            </p>
          </>
        )}
      </Card>

      <details className="explain">
        <summary>How this works</summary>
        <ol className="explain-list">
          <li>
            <code>$geoNear</code> (must be the first stage) walks the <code>2dsphere</code> index of <code>WorkerLocations</code>{' '}
            outward from the job site, keeps <code>is_available: true</code> pings within <code>maxDistance: 5000</code> m and adds{' '}
            <code>distance_meters</code>. Part A had no <code>maxDistance</code>; we added it.
          </li>
          <li>
            <strong>Latest pings</strong> = the Part A pipeline: <code>$limit 5</code>, <code>$project</code>. Each worker has ~250
            pings, so one worker can fill several places.
          </li>
          <li>
            <strong>Workers</strong> adds <code>$sort</code> newest-first, <code>$group</code> by <code>freelancer_id</code> with{' '}
            <code>$first</code> (= latest ping), then sorts by distance again because <code>$group</code> loses order.
          </li>
          <li>Names and “gig in progress” come from PostgreSQL in one query, joined on <code>freelancer_id</code>.</li>
          <li>
            A TTL index on <code>created_at</code> deletes pings after 2 hours. The seeder gives every ping the same{' '}
            <code>created_at</code>, so all seeded pings disappear together; “Add fresh pings” inserts new ones with the same
            document shape.
          </li>
          {nearby.data && <li>Last query: {nearby.data.queryMs} ms.</li>}
        </ol>
      </details>
    </>
  );
}
