import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { boardDetail, card, list, MEMBER } from '../../test/board-fixtures';
import { errorResponse, json } from '../../test/http';
import { renderApp, stubApi, type FakeRoute } from '../../test/render';

const priya = { id: 'u1', name: 'Priya Sharma', email: 'priya@acme.dev' };

function stubBoard(detail = boardDetail(), handlers: Record<string, FakeRoute> = {}) {
  return stubApi({
    'GET /auth/me': () => json(200, { user: priya }),
    'GET /boards/b1': () => json(200, detail),
    ...handlers,
  });
}

const listSection = (title: string) => screen.getByRole('region', { name: title });
// dnd-kit gives each sortable card role="button", so cards are found by test id.
const cardsIn = (section: HTMLElement) => [...section.querySelectorAll('[data-testid^="card-"]')];
const cardTitles = (title: string) =>
  cardsIn(listSection(title)).map((item) => item.getAttribute('aria-label'));

describe('Board page', () => {
  it('renders lists and cards in position order', async () => {
    stubBoard();
    renderApp('/b/b1');

    await screen.findByRole('heading', { name: 'Website Redesign', level: 1 });
    const listTitles = screen
      .getAllByRole('heading', { level: 2 })
      .map((heading) => heading.textContent);

    expect(listTitles).toEqual(['To Do', 'In Progress', 'Done']);
    expect(cardTitles('To Do')).toEqual(['Card c1', 'Card c2', 'Card c3']);
    expect(cardTitles('In Progress')).toEqual(['Card c4']);
    expect(cardTitles('Done')).toEqual([]);
  });

  it('shows labels, due date, checklist progress and assignees on a card', async () => {
    const detail = boardDetail();
    detail.cards = [
      card('c1', 'l1', 'a0', {
        title: 'Login page',
        labels: [{ name: 'Design', color: '#db2777' }],
        // Midday UTC, so the date is Jan 15 in every time zone the tests might run in.
        dueDate: '2020-01-15T12:00:00.000Z',
        checklist: [
          { id: 'i1', text: 'Mockup', done: true },
          { id: 'i2', text: 'Review', done: false },
        ],
        assignees: [MEMBER.id],
      }),
    ];
    stubBoard(detail);
    renderApp('/b/b1');

    const tile = within(await screen.findByTestId('card-c1'));

    expect(tile.getByText('Design')).toBeVisible();
    expect(tile.getByText(/Overdue · Jan 15/)).toBeVisible();
    expect(tile.getByLabelText('Checklist 1 of 2 done')).toHaveTextContent('1/2');
    expect(tile.getByTitle(MEMBER.name)).toBeVisible();
  });

  it('lets members add cards and lists', async () => {
    stubBoard(boardDetail('member'), {
      'POST /lists/l3/cards': () =>
        json(201, { card: card('c9', 'l3', 'a0', { title: 'Ship it' }) }),
      'POST /boards/b1/lists': () => json(201, { list: list('l9', 'Blocked', 'a3') }),
    });
    renderApp('/b/b1');
    const user = userEvent.setup();

    const done = within(await screen.findByRole('region', { name: 'Done' }));
    await user.click(done.getByRole('button', { name: '+ Add a card' }));
    await user.type(done.getByLabelText('Card title'), 'Ship it{Enter}');
    expect(await done.findByTestId('card-c9')).toHaveTextContent('Ship it');
    // The form stays open and empty for the next card.
    expect(done.getByLabelText('Card title')).toHaveValue('');

    await user.click(screen.getByRole('button', { name: '+ Add a list' }));
    await user.type(screen.getByLabelText('List title'), 'Blocked{Enter}');
    expect(await screen.findByRole('region', { name: 'Blocked' })).toBeVisible();
  });

  it('shows the error from a failed add inside the form', async () => {
    stubBoard(boardDetail(), {
      'POST /lists/l1/cards': () => errorResponse(403, 'FORBIDDEN', 'You do not have permission'),
    });
    renderApp('/b/b1');
    const user = userEvent.setup();

    const todo = within(await screen.findByRole('region', { name: 'To Do' }));
    await user.click(todo.getByRole('button', { name: '+ Add a card' }));
    await user.type(todo.getByLabelText('Card title'), 'Nope{Enter}');

    expect(await todo.findByText('You do not have permission')).toBeVisible();
  });

  it('hides every write control from viewers', async () => {
    stubBoard(boardDetail('viewer'));
    renderApp('/b/b1');

    await screen.findByRole('heading', { name: 'To Do' });

    expect(screen.queryByRole('button', { name: /Add a card/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Add a list/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Share' })).not.toBeInTheDocument();
    // dnd-kit marks disabled sortables, so cards cannot be picked up.
    expect(screen.getByTestId('card-c1')).toHaveAttribute('aria-disabled', 'true');
  });

  it('explains a board that does not exist or is not shared', async () => {
    stubBoard(boardDetail(), { 'GET /boards/b1': () => errorResponse(404, 'NOT_FOUND') });
    renderApp('/b/b1');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This board does not exist or is not shared with you.',
    );
  });
});
