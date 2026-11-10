import type { ActivityItem, BoardDetail, CommentDto } from '@taskboard/shared';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { boardDetail, card } from '../../test/board-fixtures';
import { fakeSocket } from '../../test/fake-socket';
import { errorResponse, json } from '../../test/http';
import { renderApp, stubApi, type FakeRoute } from '../../test/render';

const priya = { id: 'u1', name: 'Priya Sharma', email: 'priya@acme.dev' };
const alex = { id: 'u2', name: 'Alex Kim' };

function comment(id: string, body: string, author = alex): CommentDto {
  return {
    id,
    boardId: 'b1',
    cardId: 'c1',
    author,
    body,
    createdAt: '2026-11-03T10:00:00.000Z',
  };
}

function historyItem(id: string, type: ActivityItem['type']): ActivityItem {
  return {
    id,
    type,
    createdAt: '2026-11-03T09:00:00.000Z',
    actor: alex,
    board: { id: 'b1', title: 'Website Redesign', color: '#2563eb' },
    card: { id: 'c1', title: 'Card c1' },
    list: { id: 'l2', title: 'In Progress' },
  };
}

const page = (comments: CommentDto[], nextCursor: string | null = null) =>
  json(200, { comments, nextCursor });

function stubCard(
  handlers: Record<string, FakeRoute> = {},
  myRole: BoardDetail['board']['myRole'] = 'owner',
) {
  return stubApi({
    'GET /auth/me': () => json(200, { user: priya }),
    'GET /boards/b1': () => json(200, boardDetail(myRole)),
    'GET /boards': () => json(200, { boards: [] }),
    'GET /cards/c1/comments': () => page([]),
    'GET /cards/c1/activity': () => json(200, { activity: [], nextCursor: null }),
    ...handlers,
  });
}

async function openCard() {
  renderApp('/b/b1/c/c1');
  return screen.findByTestId('card-detail');
}

const commentList = (dialog: HTMLElement) =>
  within(dialog).findByRole('list', { name: 'Comments' });

describe('comments', () => {
  it('lists comments newest first and loads older ones on request', async () => {
    let calls = 0;
    stubCard({
      'GET /cards/c1/comments': () =>
        ++calls === 1
          ? page([comment('m3', 'Newest'), comment('m2', 'Middle')], 'm2')
          : page([comment('m1', 'Oldest')]),
    });
    const dialog = await openCard();

    const list = await commentList(dialog);
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual([expect.stringContaining('Newest'), expect.stringContaining('Middle')]);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Load older comments' }));

    await waitFor(() => expect(within(list).getAllByRole('listitem')).toHaveLength(3));
    expect(list).toHaveTextContent('Oldest');
    expect(within(dialog).queryByRole('button', { name: 'Load older comments' })).toBeNull();
  });

  it('shows an empty state', async () => {
    stubCard();
    const dialog = await openCard();

    expect(await within(dialog).findByText('No comments yet.')).toBeInTheDocument();
  });

  it('posts a comment, shows it once and clears the box', async () => {
    const bodies: unknown[] = [];
    stubCard({
      'POST /cards/c1/comments': (init) => {
        bodies.push(typeof init?.body === 'string' ? JSON.parse(init.body) : null);
        return json(201, {
          comment: comment('m9', 'Ship it', priya),
          card: card('c1', 'l1', 'a0', { commentCount: 1, version: 1 }),
        });
      },
    });
    const dialog = await openCard();
    await within(dialog).findByText('No comments yet.');
    const box = within(dialog).getByRole('textbox', { name: 'Write a comment' });

    await userEvent.type(box, 'Ship it');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Comment' }));

    const list = await commentList(dialog);
    expect(bodies).toEqual([{ body: 'Ship it' }]);
    expect(list).toHaveTextContent('Ship it');
    expect(box).toHaveValue('');
    // The socket echo of the same comment doesn't add it twice.
    act(() =>
      fakeSocket.serverEmit('comment:created', {
        boardId: 'b1',
        actorId: 'u1',
        comment: comment('m9', 'Ship it', priya),
      }),
    );
    await waitFor(() => expect(within(list).getAllByRole('listitem')).toHaveLength(1));
    // The card's new count reaches the toggle and the tile behind the dialog.
    expect(within(dialog).getByRole('button', { name: 'Comments (1)' })).toBeInTheDocument();
    expect(screen.getByLabelText('1 comment')).toBeInTheDocument();
  });

  it('sends with Ctrl+Enter', async () => {
    let posted = 0;
    stubCard({
      'POST /cards/c1/comments': () => {
        posted += 1;
        return json(201, { comment: comment('m9', 'Quick'), card: card('c1', 'l1', 'a0') });
      },
    });
    const dialog = await openCard();
    const box = within(dialog).getByRole('textbox', { name: 'Write a comment' });

    await userEvent.type(box, 'Quick{Control>}{Enter}{/Control}');

    await waitFor(() => expect(posted).toBe(1));
  });

  it('refuses an empty comment without a request', async () => {
    const fetchMock = stubCard();
    const dialog = await openCard();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Comment' }));

    expect(await within(dialog).findByText('Write a comment first')).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false);
  });

  it('keeps the draft and shows the error when the post fails', async () => {
    stubCard({ 'POST /cards/c1/comments': () => errorResponse(500, 'INTERNAL', 'Server error') });
    const dialog = await openCard();
    const box = within(dialog).getByRole('textbox', { name: 'Write a comment' });

    await userEvent.type(box, 'Not lost');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Comment' }));

    await waitFor(() => expect(box).toHaveAttribute('aria-invalid', 'true'));
    expect(box).toHaveValue('Not lost');
  });

  it("shows other people's comments live", async () => {
    stubCard();
    const dialog = await openCard();
    await within(dialog).findByText('No comments yet.');
    await waitFor(() => expect(fakeSocket.emitted.length).toBeGreaterThan(0));

    act(() =>
      fakeSocket.serverEmit('comment:created', {
        boardId: 'b1',
        actorId: 'u2',
        comment: comment('m5', 'Hello from Alex'),
      }),
    );

    expect(await commentList(dialog)).toHaveTextContent('Hello from Alex');
  });

  it('lets a viewer read comments but not write one', async () => {
    stubCard({ 'GET /cards/c1/comments': () => page([comment('m1', 'Read me')]) }, 'viewer');
    const dialog = await openCard();

    expect(await commentList(dialog)).toHaveTextContent('Read me');
    expect(within(dialog).queryByRole('textbox', { name: 'Write a comment' })).toBeNull();
  });
});

describe('history', () => {
  it("shows the card's history in its own words", async () => {
    stubCard({
      'GET /cards/c1/activity': () =>
        json(200, {
          activity: [
            historyItem('a5', 'comment.created'),
            { ...historyItem('a4', 'card.updated'), fields: ['dueDate'] },
            { ...historyItem('a3', 'card.updated'), fields: ['labels', 'assignees', 'checklist'] },
            historyItem('a2', 'card.moved'),
            historyItem('a1', 'card.created'),
          ],
          nextCursor: null,
        }),
    });
    const dialog = await openCard();

    await userEvent.click(within(dialog).getByRole('button', { name: 'History' }));

    const list = await within(dialog).findByRole('list', { name: 'History' });
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual([
      expect.stringContaining('Alex Kim commented'),
      expect.stringContaining('Alex Kim updated the due date'),
      expect.stringContaining('Alex Kim updated the labels, members and checklist'),
      expect.stringContaining('Alex Kim moved this card to "In Progress"'),
      expect.stringContaining('Alex Kim created this card'),
    ]);
    expect(within(dialog).getByRole('button', { name: 'History' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('refetches when someone changes the card', async () => {
    let calls = 0;
    stubCard({
      'GET /cards/c1/activity': () => {
        calls += 1;
        return json(200, { activity: [], nextCursor: null });
      },
    });
    const dialog = await openCard();
    await userEvent.click(within(dialog).getByRole('button', { name: 'History' }));
    await within(dialog).findByText('No history yet.');
    await waitFor(() => expect(fakeSocket.emitted.length).toBeGreaterThan(0));
    const before = calls;

    act(() =>
      fakeSocket.serverEmit('card:updated', {
        boardId: 'b1',
        actorId: 'u2',
        card: card('c1', 'l1', 'a0', { title: 'Renamed', version: 5 }),
      }),
    );

    await waitFor(() => expect(calls).toBe(before + 1));
  });
});
