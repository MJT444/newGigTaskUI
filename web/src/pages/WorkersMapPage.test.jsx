// Workers map (Workflow 3, MongoDB $geoNear) - tested the way a user uses it.
// The Leaflet map is replaced by a stub: jsdom cannot draw map tiles, and the
// page logic (which request is sent, what the list shows) is what we test.
import { afterEach, expect, test, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WorkersMapPage } from './WorkersMapPage.jsx';

vi.mock('../components/mongo/WorkerMap.jsx', () => ({
  AGE_BUCKETS: [{ maxSeconds: Infinity, color: '#7c8786', dot: '#a3aab5', label: 'any age' }],
  MAP_STYLES: [{ id: 'night', label: 'Night' }, { id: 'streets', label: 'Streets' }],
  colorForAge: () => '#7c8786',
  WorkerMap: ({ results, onPick }) => (
    <button type="button" data-testid="map" onClick={() => onPick({ lat: 28.55, lng: 77.25 })}>
      map with {results.length} dots
    </button>
  ),
}));

const ORIGIN = { lng: 77.209, lat: 28.6139, label: 'Janpath', jobSite: 'part-a' };

const worker = (over) => ({
  pingId: 'p1',
  freelancerId: 'f1',
  name: 'Asha Rao',
  busy: false,
  lng: 77.21,
  lat: 28.62,
  distanceKm: 0.42,
  createdAt: new Date().toISOString(),
  ageSeconds: 30,
  pingsInRadius: 3,
  ...over,
});

const nearbyBody = (results, origin = ORIGIN) => ({
  origin,
  radiusKm: 5,
  mode: 'workers',
  limit: 25,
  maxAgeMinutes: null,
  queryMs: 4,
  generatedAt: new Date().toISOString(),
  results,
});

const json = (body, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));

/** fetch stub: `nearby(url)` decides the /nearby answer; everything else is fixed. */
function stubApi(nearby) {
  const fetchMock = vi.fn((url, init) => {
    const path = String(url);
    if (path === '/api/workers/job-sites') {
      return json({ items: [{ id: 'part-a', name: ORIGIN.label, lat: ORIGIN.lat, lng: ORIGIN.lng }], radiusKm: 5 });
    }
    if (path === '/api/workers/stats') {
      return json({ totalPings: 500000, availablePings: 350000, newestPingAt: null, oldestPingAt: null, ttlSeconds: 7200 });
    }
    if (path.startsWith('/api/workers/nearby')) return nearby(path);
    if (path === '/api/workers/pings/simulate' && init?.method === 'POST') {
      return json({ inserted: 8, movedWorkers: 2, at: new Date().toISOString() }, 201);
    }
    return json({ error: { code: 'NOT_FOUND', message: 'unexpected ' + path } }, 404);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const nearbyCalls = (fetchMock) => fetchMock.mock.calls.map(([u]) => String(u)).filter((u) => u.startsWith('/api/workers/nearby'));

function LocationProbe() {
  const { search } = useLocation();
  return <span data-testid="location">{search}</span>;
}

function renderPage(url = '/workers') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[url]}>
        <LocationProbe />
        <Routes>
          <Route path="/workers" element={<WorkersMapPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => vi.unstubAllGlobals());

test('lists available workers nearest first, around the Part A job site by default', async () => {
  const fetchMock = stubApi(() =>
    json(nearbyBody([worker(), worker({ pingId: 'p2', freelancerId: 'f2', name: 'Ravi Kumar', distanceKm: 1.75, busy: true })])),
  );
  const { container } = renderPage();

  expect(await screen.findByRole('link', { name: 'Asha Rao' })).toHaveAttribute('href', '/freelancers/f1');
  const rows = [...container.querySelectorAll('.worker-item')].map((li) => li.textContent);
  expect(rows[0]).toContain('Asha Rao');
  expect(rows[0]).toContain('0.42 km');
  expect(rows[1]).toContain('Ravi Kumar');
  expect(rows[1]).toContain('1.75 km');
  expect(rows[1]).toContain('on a gig');
  expect(screen.getByTestId('map')).toHaveTextContent('map with 2 dots');

  // client-facing view only: no raw-pings tab, no database statistics
  expect(screen.queryByRole('tab')).not.toBeInTheDocument();
  expect(screen.queryByText('Location updates')).not.toBeInTheDocument();

  const first = nearbyCalls(fetchMock)[0];
  expect(first).toContain('jobSite=part-a');
  expect(first).toContain('mode=workers');
});

test('shows the TTL explanation when nobody is within 5 km', async () => {
  stubApi(() => json(nearbyBody([])));
  renderPage();
  expect(await screen.findByText('No available workers within 5 km')).toBeInTheDocument();
  expect(screen.getByText(/Locations older than 2 hours are removed automatically/)).toBeInTheDocument();
});

test('shows an error with Try again when MongoDB is unavailable, and recovers', async () => {
  let mongoUp = false;
  stubApi(() =>
    mongoUp
      ? json(nearbyBody([worker()]))
      : json({ error: { code: 'DATABASE_UNAVAILABLE', message: 'MongoDB is not reachable. Is it running?' } }, 503),
  );
  renderPage();

  expect(await screen.findByText('Could not load this')).toBeInTheDocument();
  mongoUp = true;
  await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByRole('link', { name: 'Asha Rao' })).toBeInTheDocument();
});

test('Last seen adds maxAgeMinutes to the workers query', async () => {
  const fetchMock = stubApi(() => json(nearbyBody([worker()])));
  renderPage();
  await screen.findByRole('link', { name: 'Asha Rao' });

  await userEvent.selectOptions(screen.getByLabelText('Last seen'), '15');
  await waitFor(() => expect(nearbyCalls(fetchMock).some((u) => u.includes('maxAgeMinutes=15'))).toBe(true));
});

test('Add fresh pings inserts pings at the current job site and reloads the list', async () => {
  const fetchMock = stubApi(() => json(nearbyBody([worker()])));
  renderPage();
  await screen.findByRole('link', { name: 'Asha Rao' });
  const before = nearbyCalls(fetchMock).length;

  await userEvent.click(screen.getByRole('button', { name: 'Add fresh pings' }));

  await waitFor(() => {
    const post = fetchMock.mock.calls.find(([u, init]) => u === '/api/workers/pings/simulate' && init?.method === 'POST');
    expect(post).toBeTruthy();
    expect(JSON.parse(post[1].body)).toEqual({ jobSite: 'part-a', count: 8 });
  });
  await waitFor(() => expect(nearbyCalls(fetchMock).length).toBeGreaterThan(before));
});

test('clicking the map searches around the clicked point and keeps it in the URL', async () => {
  const fetchMock = stubApi((path) =>
    path.includes('lat=')
      ? json(nearbyBody([worker({ name: 'Clicked Point Worker' })], { lng: 77.25, lat: 28.55, label: 'Custom point', jobSite: null }))
      : json(nearbyBody([worker()])),
  );
  renderPage();
  await screen.findByRole('link', { name: 'Asha Rao' });

  await userEvent.click(screen.getByTestId('map'));

  expect(await screen.findByRole('link', { name: 'Clicked Point Worker' })).toBeInTheDocument();
  expect(screen.getByTestId('location')).toHaveTextContent('lat=28.55000&lng=77.25000');
  expect(nearbyCalls(fetchMock).some((u) => u.includes('lat=28.55000') && u.includes('lng=77.25000'))).toBe(true);
});

test('spotlights the nearest worker with distance and a travel estimate', async () => {
  stubApi(() => json(nearbyBody([worker({ distanceKm: 1.5 }), worker({ pingId: 'p2', freelancerId: 'f2', name: 'Ravi Kumar', distanceKm: 3.2 })])));
  const { container } = renderPage();
  await screen.findByRole('link', { name: 'Asha Rao' });

  const spotlight = container.querySelector('.spotlight');
  expect(spotlight).toHaveTextContent('Asha Rao');
  expect(spotlight).toHaveTextContent('1.50 km');
  expect(spotlight).toHaveTextContent('about 5 min by scooter');
  expect(screen.getByRole('link', { name: 'View profile' })).toHaveAttribute('href', '/freelancers/f1');
  // grouped by distance band
  expect(screen.getByText('1 to 3 km')).toBeInTheDocument();
  expect(screen.getByText('3 to 5 km')).toBeInTheDocument();
});

test('a job site that does not exist shows a way back instead of Try again', async () => {
  stubApi(() => json({ error: { code: 'UNKNOWN_JOB_SITE', message: 'Unknown job site.' } }, 400));
  renderPage('/workers?site=mars');

  expect(await screen.findByText('We couldn’t find that location')).toBeInTheDocument();
  expect(screen.getByText(/That job site does not exist/)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Add fresh pings' })).toBeDisabled();

  await userEvent.click(screen.getByRole('button', { name: 'Go to the default job site' }));
  expect(screen.getByTestId('location')).toHaveTextContent(/^$/);
});

test('the map style switch changes the look and is remembered', async () => {
  stubApi(() => json(nearbyBody([worker()])));
  window.localStorage.removeItem('gigtask.mapLook');
  renderPage();
  await screen.findByRole('link', { name: 'Asha Rao' });

  expect(screen.getByRole('button', { name: 'Night' })).toHaveAttribute('aria-pressed', 'true');
  await userEvent.click(screen.getByRole('button', { name: 'Streets' }));
  expect(screen.getByRole('button', { name: 'Streets' })).toHaveAttribute('aria-pressed', 'true');
  expect(window.localStorage.getItem('gigtask.mapLook')).toBe('streets');
});

test('Simulate workers moving adds a batch as soon as it is switched on', async () => {
  const fetchMock = stubApi(() => json(nearbyBody([worker()])));
  renderPage();
  await screen.findByRole('link', { name: 'Asha Rao' });

  await userEvent.click(screen.getByRole('checkbox', { name: 'Simulate workers moving' }));
  await waitFor(() =>
    expect(fetchMock.mock.calls.some(([u, init]) => u === '/api/workers/pings/simulate' && init?.method === 'POST')).toBe(true),
  );
  await userEvent.click(screen.getByRole('checkbox', { name: 'Simulate workers moving' })); // stop the timer
});
