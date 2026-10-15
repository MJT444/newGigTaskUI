import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ActorProvider } from '../context/ActorContext.jsx';
import { BrowsePage } from './BrowsePage.jsx';
import { ContractDetailPage } from './DetailPages.jsx';

const contract = {
  id: '33333333-3333-4333-8333-333333333333',
  client_id: '11111111-1111-4111-8111-111111111111',
  freelancer_id: '22222222-2222-4222-8222-222222222222',
  client_name: 'Acme',
  freelancer_name: 'Meera',
  budget: '1500.00',
  status: 'IN_PROGRESS',
  created_at: '2026-10-01T12:00:00Z',
};

const json = (body) => Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } }));

function HistoryControls() {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <span data-testid="location">{location.pathname + location.search}</span>
      <button type="button" onClick={() => navigate(-1)}>Browser back</button>
    </>
  );
}

function renderRoutes(initialUrl) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialUrl]}>
        <ActorProvider>
          <HistoryControls />
          <Routes>
            <Route path="/explore" element={<BrowsePage />} />
            <Route path="/contracts/:id" element={<ContractDetailPage />} />
          </Routes>
        </ActorProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => window.localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

test('contract detail Back link restores the Explore status and page', async () => {
  vi.stubGlobal('fetch', vi.fn((url) => {
    const path = String(url);
    if (path.startsWith('/api/contracts?')) {
      return json({ items: [contract], page: 3, pageSize: 20, total: 80, totalPages: 4 });
    }
    if (path === `/api/contracts/${contract.id}`) return json(contract);
    throw new Error(`Unexpected request: ${path}`);
  }));
  renderRoutes('/explore?tab=contracts&status=IN_PROGRESS&page=3');

  await userEvent.setup().click(await screen.findByText('Meera'));
  const backLink = await screen.findByRole('link', { name: '← Back to contracts' });
  const url = new URL(backLink.getAttribute('href'), 'http://localhost');
  expect(url.searchParams.get('status')).toBe('IN_PROGRESS');
  expect(url.searchParams.get('page')).toBe('3');

  await userEvent.setup().click(backLink);
  expect(screen.getByTestId('location')).toHaveTextContent('/explore?tab=contracts&status=IN_PROGRESS&page=3');
  expect(await screen.findByText(/Page 3 of 4/)).toBeInTheDocument();
});

test('browser Back restores the previous search and input value', async () => {
  vi.stubGlobal('fetch', vi.fn(() => json({ items: [], page: 1, pageSize: 20, total: 0, totalPages: 1 })));
  renderRoutes('/explore?search=Acevedo');
  const search = screen.getByRole('searchbox', { name: 'Search clients by name' });
  expect(search).toHaveValue('Acevedo');

  await userEvent.setup().clear(search);
  await userEvent.setup().type(search, 'Adams');
  await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('search=Adams'));
  await userEvent.setup().click(screen.getByRole('button', { name: 'Browser back' }));
  await waitFor(() => expect(search).toHaveValue('Acevedo'));
  expect(screen.getByTestId('location')).toHaveTextContent('/explore?search=Acevedo');
});
