// The transaction form matters most, so it gets the UI tests: one success and
// the two database-enforced failures (insufficient escrow, freelancer already
// busy = partial unique index). The API is mocked here; the same flows run
// against the real database in api/integration-tests.
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ActorProvider } from '../context/ActorContext.jsx';
import { FundGigPage } from './FundGigPage.jsx';

const CLIENT = { id: '11111111-1111-4111-8111-111111111111', name: 'Acme Builders' };
const FREELANCER = {
  id: '22222222-2222-4222-8222-222222222222',
  name: 'Meera Iyer',
  is_available: true,
  in_progress_contract_id: null,
};

const json = (status, body) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));

function mockApi(onFund, { freelancerDetail = () => FREELANCER } = {}) {
  globalThis.fetch = vi.fn((url, init = {}) => {
    const u = String(url);
    if (u.startsWith('/api/freelancers?')) return json(200, { items: [FREELANCER], page: 1, pageSize: 8, total: 1, totalPages: 1 });
    if (u === `/api/freelancers/${FREELANCER.id}`) return json(200, freelancerDetail());
    if (u === `/api/clients/${CLIENT.id}`) {
      return json(200, { ...CLIENT, escrow_balance: '5000.00', stats: { funded: 1, in_progress: 0, completed: 3 } });
    }
    if (u === '/api/gigs/fund' && init.method === 'POST') return onFund(JSON.parse(init.body));
    return json(404, { error: { code: 'NOT_FOUND', message: `unmocked ${u}` } });
  });
}

function renderPage() {
  window.localStorage.setItem('gigtask.actor', JSON.stringify(CLIENT));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/fund']}>
        <ActorProvider>
          <FundGigPage />
        </ActorProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function fillAndSubmit(budget, { startNow = true } = {}) {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Freelancer' }));
  await user.click(await screen.findByRole('option', { name: /Meera Iyer/ }));
  await user.type(screen.getByLabelText(/Budget/), budget);
  if (!startNow) await user.click(screen.getByRole('checkbox', { name: /Start work now/ }));
  await user.click(screen.getByRole('button', { name: 'Fund gig' }));
}

beforeEach(() => window.localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('Fund gig', () => {
  test('success shows escrow before/after and the recorded account activity', async () => {
    const calls = [];
    let started = false;
    mockApi((body) => {
      calls.push(body);
      started = true;
      return json(201, {
        balanceBefore: '5000.00',
        balanceAfter: '3500.00',
        startedNow: true,
        contract: {
          id: 'k-1',
          freelancer_name: FREELANCER.name,
          budget: '1500.00',
          status: 'IN_PROGRESS',
          created_at: new Date().toISOString(),
        },
        auditEntry: {
          id: 'audit-1',
          action_type: 'DEBIT',
          amount_changed: '-1500.00',
          balance_after: '3500.00',
          created_at: new Date().toISOString(),
        },
      });
    }, { freelancerDetail: () => ({ ...FREELANCER, in_progress_contract_id: started ? 'k-1' : null }) });
    renderPage();
    await fillAndSubmit('1500');

    expect(await screen.findByRole('heading', { name: 'Gig funded' })).toBeInTheDocument();
    expect(calls).toEqual([{ clientId: CLIENT.id, freelancerId: FREELANCER.id, budget: '1500', startNow: true }]);
    expect(screen.getByText('Escrow activity')).toBeInTheDocument();
    expect(screen.getByText('audit-1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mark completed' })).toBeInTheDocument();
    expect(await screen.findByText('Gig in progress')).toBeInTheDocument();
  });

  test('unticking "Start work now" sends startNow: false', async () => {
    const calls = [];
    mockApi((body) => {
      calls.push(body);
      return json(409, { error: { code: 'X', message: 'stop' } });
    });
    renderPage();
    await fillAndSubmit('100', { startNow: false });
    await screen.findByRole('heading', { name: 'The gig was not funded' });
    expect(calls[0].startNow).toBe(false);
  });

  test('insufficient escrow explains the shortfall and offers a top-up', async () => {
    mockApi(() =>
      json(409, {
        error: {
          code: 'INSUFFICIENT_BALANCE',
          message: 'Not enough money in escrow to fund this gig. Nothing was charged.',
          details: { balance: '5000.00', requested: '9000' },
        },
      }),
    );
    renderPage();
    await fillAndSubmit('9000');

    expect(await screen.findByRole('heading', { name: 'Not enough money in escrow' })).toBeInTheDocument();
    expect(screen.getByText(/Nothing was charged/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Top up .*4,000\.00/ })).toBeInTheDocument();
  });

  test('busy freelancer shows a clear next step and the blocking contract', async () => {
    mockApi(() =>
      json(409, {
        error: {
          code: 'GIG_ALREADY_IN_PROGRESS',
          message: 'This freelancer is already working on another gig.',
          details: { activeContract: { id: 'k-0', budget: '800.00', client_name: 'Other Co', status: 'IN_PROGRESS' } },
        },
      }),
    );
    renderPage();
    await fillAndSubmit('300');

    expect(await screen.findByRole('heading', { name: 'This freelancer already has a gig in progress' })).toBeInTheDocument();
    expect(screen.getByText(/Turn off “Start work now” to fund this gig for later/)).toBeInTheDocument();
    expect(screen.queryByText(/idx_active_gig/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mark that contract completed' })).toBeInTheDocument();
  });

  test('an invalid budget cannot be submitted', async () => {
    mockApi(() => json(500, {}));
    renderPage();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/Budget/), '12.345');
    expect(screen.getByRole('button', { name: 'Fund gig' })).toBeDisabled();
  });

  test('zero budget cannot be submitted', async () => {
    mockApi(() => json(500, {}));
    renderPage();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Freelancer' }));
    await user.click(await screen.findByRole('option', { name: /Meera Iyer/ }));
    await user.type(screen.getByLabelText(/Budget/), '0');
    expect(screen.getByRole('button', { name: 'Fund gig' })).toBeDisabled();
  });
});
