import type { ActivityItem, BoardDetail, BoardSummary } from '@taskboard/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { errorResponse, json } from '../../test/http';
import { emptyHomeHandlers, renderApp, stubApi, type FakeRoute } from '../../test/render';

const priya = { id: 'u1', name: 'Priya Sharma', email: 'priya@acme.dev' };
const updatedAt = new Date().toISOString();

function summary(overrides: Partial<BoardSummary> & Pick<BoardSummary, 'id' | 'title'>) {
  return { color: '#2563eb', role: 'owner' as const, updatedAt, ...overrides };
}

const boards: BoardSummary[] = [
  summary({ id: 'b1', title: 'Website Redesign' }),
  summary({ id: 'b2', title: 'Mobile App', role: 'member' }),
  summary({ id: 'b3', title: 'Marketing Site', role: 'viewer' }),
];

function stubHome(handlers: Record<string, FakeRoute> = {}) {
  return stubApi({
    ...emptyHomeHandlers,
    'GET /auth/me': () => json(200, { user: priya }),
    'GET /boards': () => json(200, { boards }),
    ...handlers,
  });
}

const section = (name: string) => screen.getByRole('region', { name });

describe('My boards', () => {
  it('greets the user by first name', async () => {
    stubHome();
    renderApp('/');

    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent(/, Priya$/);
  });

  it('splits owned and shared boards and shows each role', async () => {
    stubHome();
    renderApp('/');

    await screen.findByText('Website Redesign');
    const yours = within(section('Your boards'));
    const shared = within(section('Shared with you'));

    expect(yours.getByRole('link', { name: /Website Redesign/ })).toHaveAttribute('href', '/b/b1');
    expect(yours.getByText('Owner')).toBeVisible();
    expect(yours.queryByText('Mobile App')).not.toBeInTheDocument();
    expect(shared.getByRole('link', { name: /Mobile App/ })).toHaveTextContent('Member');
    expect(shared.getByRole('link', { name: /Marketing Site/ })).toHaveTextContent('Viewer');
  });

  it('shows empty states when the user has no boards', async () => {
    stubHome({ 'GET /boards': () => json(200, { boards: [] }) });
    renderApp('/');

    expect(
      await screen.findByText('Boards that others share with you will appear here.'),
    ).toBeVisible();
    expect(within(section('Your boards')).getByText('+ Create new board')).toBeVisible();
  });

  it('filters both sections by the search box and keeps the search in the URL', async () => {
    stubHome();
    const { router } = renderApp('/');
    const user = userEvent.setup();
    await screen.findByText('Website Redesign');

    await user.type(screen.getByRole('searchbox', { name: 'Search boards' }), 'm');

    expect(screen.queryByText('Website Redesign')).not.toBeInTheDocument();
    expect(screen.getByText('Mobile App')).toBeVisible();
    expect(screen.getByText('Marketing Site')).toBeVisible();
    expect(router.state.location.search).toBe('?q=m');

    await user.type(screen.getByRole('searchbox', { name: 'Search boards' }), 'obile');
    expect(screen.queryByText('Marketing Site')).not.toBeInTheDocument();
    expect(screen.getByText('No boards of yours match "mobile".')).toBeVisible();
  });

  it('offers a retry when boards fail to load', async () => {
    let calls = 0;
    stubHome({
      'GET /boards': () => {
        calls += 1;
        return calls === 1 ? errorResponse(400, 'BAD') : json(200, { boards });
      },
    });
    renderApp('/');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('Website Redesign')).toBeVisible();
  });

  it('lists recent activity with the actor, what happened and the board', async () => {
    const item: ActivityItem = {
      id: 'a1',
      type: 'card.moved',
      createdAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
      actor: { id: 'u2', name: 'Alex Kim' },
      board: { id: 'b1', title: 'Website Redesign', color: '#2563eb' },
      card: { id: 'c1', title: 'Login page' },
      list: { id: 'l3', title: 'Done' },
    };
    stubHome({ 'GET /activity/recent': () => json(200, { activity: [item] }) });
    renderApp('/');

    const activity = within(await screen.findByRole('region', { name: 'Recent activity' }));
    const entry = await activity.findByRole('listitem');

    expect(entry).toHaveTextContent('Alex Kim moved "Login page" to "Done"');
    expect(within(entry).getByRole('link', { name: 'Website Redesign' })).toHaveAttribute(
      'href',
      '/b/b1',
    );
    expect(entry).toHaveTextContent('5 minutes ago');
  });
});

describe('Create board dialog', () => {
  const created: BoardDetail = {
    board: { id: 'b9', title: 'Q4 Launch', color: '#16a34a', myRole: 'owner', members: [] },
    lists: [],
    cards: [],
  };

  it('requires a title', async () => {
    const fetchMock = stubHome();
    renderApp('/');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'New board' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Create board' }));
    await user.click(dialog.getByRole('button', { name: 'Create board' }));

    expect(dialog.getByLabelText('Board title')).toHaveAttribute('aria-invalid', 'true');
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false);
  });

  it('creates the board with the chosen color and opens it', async () => {
    let sentBody: unknown;
    stubHome({
      'POST /boards': (init) => {
        sentBody = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
        return json(201, created);
      },
    });
    const { router } = renderApp('/');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'New board' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Create board' }));
    await user.type(dialog.getByLabelText('Board title'), '  Q4 Launch ');
    await user.click(dialog.getByRole('radio', { name: 'Green' }));
    await user.click(dialog.getByRole('button', { name: 'Create board' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/b/b9'));
    expect(sentBody).toEqual({ title: 'Q4 Launch', color: '#16a34a' });
    // Seeded from the create response, so the board page needs no GET /boards/b9.
    expect(await screen.findByRole('heading', { name: 'Q4 Launch' })).toBeVisible();
  });

  it('closes on Cancel and starts empty when reopened', async () => {
    stubHome();
    renderApp('/');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'New board' }));
    await user.type(screen.getByLabelText('Board title'), 'Draft');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'New board' }));
    expect(screen.getByLabelText('Board title')).toHaveValue('');
  });
});
