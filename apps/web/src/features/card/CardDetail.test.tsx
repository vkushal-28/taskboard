import type { BoardDetail, CardDto } from '@taskboard/shared';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { useToastStore } from '../../lib/toast-store';
import { boardDetail, card } from '../../test/board-fixtures';
import { fakeSocket } from '../../test/fake-socket';
import { errorResponse, json, noContent } from '../../test/http';
import { renderApp, stubApi, type FakeRoute } from '../../test/render';
import { CARD_GONE_MESSAGE } from './CardDetailRoute';
import { dateInputToIso, isoToDateInput } from './date-input';

const priya = { id: 'u1', name: 'Priya Sharma', email: 'priya@acme.dev' };
const CHECKLIST = [
  { id: 'i1', text: 'Draft', done: true },
  { id: 'i2', text: 'Review', done: false },
];

/** The fixture board, with c1 carrying a description and a two-item checklist. */
function detailWithChecklist(myRole: BoardDetail['board']['myRole'] = 'owner'): BoardDetail {
  const detail = boardDetail(myRole);
  return {
    ...detail,
    cards: detail.cards.map((c) =>
      c.id === 'c1' ? { ...c, description: 'Collect the brief', checklist: CHECKLIST } : c,
    ),
  };
}

function stubBoard(detail = detailWithChecklist(), handlers: Record<string, FakeRoute> = {}) {
  return stubApi({
    'GET /auth/me': () => json(200, { user: priya }),
    'GET /boards/b1': () => json(200, detail),
    'GET /boards': () => json(200, { boards: [] }),
    'GET /cards/c1/comments': () => json(200, { comments: [], nextCursor: null }),
    'GET /cards/c1/activity': () => json(200, { activity: [], nextCursor: null }),
    ...handlers,
  });
}

/** Records each request body sent to a route and answers with `respond(body)`. */
function recording(respond: (body: Record<string, unknown>) => Response) {
  const bodies: Record<string, unknown>[] = [];
  const handler: FakeRoute = (init) => {
    const body =
      typeof init?.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : {};
    bodies.push(body);
    return respond(body);
  };
  return { bodies, handler };
}

const c1 = (overrides: Partial<CardDto> = {}) =>
  card('c1', 'l1', 'a0', { description: 'Collect the brief', checklist: CHECKLIST, ...overrides });

async function openCard(path = '/b/b1/c/c1') {
  const view = renderApp(path);
  const dialog = await screen.findByTestId('card-detail');
  return { ...view, dialog };
}

const toasts = () => useToastStore.getState().toasts.map((toast) => toast.message);

describe('opening and closing', () => {
  it('opens from a click on the card, over the board', async () => {
    stubBoard();
    const { router } = renderApp('/b/b1');
    await userEvent.click(await screen.findByTestId('card-c1'));

    const dialog = await screen.findByTestId('card-detail');
    expect(router.state.location.pathname).toBe('/b/b1/c/c1');
    expect(within(dialog).getByRole('textbox', { name: 'Card title' })).toHaveValue('Card c1');
    expect(dialog).toHaveTextContent('in list To Do');
    // The board is still rendered behind it.
    expect(screen.getByRole('heading', { name: 'Website Redesign', level: 1 })).toBeInTheDocument();
  });

  it('opens with Enter on a focused card', async () => {
    stubBoard();
    renderApp('/b/b1');
    (await screen.findByTestId('card-c2')).focus();

    await userEvent.keyboard('{Enter}');

    expect(await screen.findByTestId('card-detail')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Card title' })).toHaveValue('Card c2');
  });

  it('opens from a link and closes back to the board, returning focus to the card', async () => {
    stubBoard();
    const { router, dialog } = await openCard();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Close card' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/b/b1'));
    expect(screen.queryByTestId('card-detail')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('card-c1')).toHaveFocus());
  });

  it('goes back to the board when the linked card is not on it', async () => {
    stubBoard();
    const { router } = renderApp('/b/b1/c/nope');

    await waitFor(() => expect(router.state.location.pathname).toBe('/b/b1'));
    expect(toasts()).toEqual([CARD_GONE_MESSAGE]);
  });

  it('closes when someone else deletes the card', async () => {
    stubBoard();
    const { router } = await openCard();
    await waitFor(() => expect(fakeSocket.emitted.length).toBeGreaterThan(0));

    act(() =>
      fakeSocket.serverEmit('card:deleted', {
        boardId: 'b1',
        actorId: 'u2',
        cardId: 'c1',
        listId: 'l1',
      }),
    );

    await waitFor(() => expect(router.state.location.pathname).toBe('/b/b1'));
    expect(toasts()).toEqual([CARD_GONE_MESSAGE]);
  });

  it("shows someone else's change while open", async () => {
    stubBoard();
    const { dialog } = await openCard();
    await waitFor(() => expect(fakeSocket.emitted.length).toBeGreaterThan(0));

    act(() =>
      fakeSocket.serverEmit('card:updated', {
        boardId: 'b1',
        actorId: 'u2',
        card: c1({ title: 'Brief from Alex' }),
      }),
    );

    // TanStack Query notifies components on a later tick, so wait for the re-render.
    await waitFor(() =>
      expect(within(dialog).getByRole('textbox', { name: 'Card title' })).toHaveValue(
        'Brief from Alex',
      ),
    );
  });
});

describe('editing', () => {
  it('saves a new title on Enter and shows it on the board', async () => {
    const patch = recording((body) => json(200, { card: c1({ title: String(body.title) }) }));
    stubBoard(undefined, { 'PATCH /cards/c1': patch.handler });
    const { dialog } = await openCard();
    const title = within(dialog).getByRole('textbox', { name: 'Card title' });

    await userEvent.clear(title);
    await userEvent.type(title, '  Write the brief  {Enter}');

    await waitFor(() => expect(patch.bodies).toEqual([{ title: 'Write the brief' }]));
    await waitFor(() =>
      expect(screen.getByTestId('card-c1')).toHaveAccessibleName('Write the brief'),
    );
  });

  it('throws a title draft away on Escape without saving or closing', async () => {
    const patch = recording(() => json(200, { card: c1() }));
    stubBoard(undefined, { 'PATCH /cards/c1': patch.handler });
    const { dialog } = await openCard();
    const title = within(dialog).getByRole('textbox', { name: 'Card title' });

    await userEvent.type(title, ' changed');
    await userEvent.keyboard('{Escape}');

    expect(title).toHaveValue('Card c1');
    expect(patch.bodies).toEqual([]);
    expect(screen.getByTestId('card-detail')).toBeInTheDocument();
  });

  it('edits the description and saves with the Save button', async () => {
    const patch = recording((body) =>
      json(200, { card: c1({ description: String(body.description) }) }),
    );
    stubBoard(undefined, { 'PATCH /cards/c1': patch.handler });
    const { dialog } = await openCard();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Edit description' }));
    const editor = within(dialog).getByRole('textbox', { name: 'Description' });
    await userEvent.clear(editor);
    await userEvent.type(editor, 'Two pages, plain words');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(patch.bodies).toEqual([{ description: 'Two pages, plain words' }]));
    expect(
      await within(dialog).findByRole('button', { name: 'Edit description' }),
    ).toHaveTextContent('Two pages, plain words');
  });

  it('saves the description when focus leaves the editor', async () => {
    const patch = recording((body) =>
      json(200, { card: c1({ description: String(body.description) }) }),
    );
    stubBoard(undefined, { 'PATCH /cards/c1': patch.handler });
    const { dialog } = await openCard();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Edit description' }));
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Description' }), ' today');
    await userEvent.click(within(dialog).getByRole('textbox', { name: 'New checklist item' }));

    await waitFor(() => expect(patch.bodies).toEqual([{ description: 'Collect the brief today' }]));
  });

  it('saves a description being edited when the card is closed', async () => {
    const patch = recording((body) =>
      json(200, { card: c1({ description: String(body.description) }) }),
    );
    stubBoard(undefined, { 'PATCH /cards/c1': patch.handler });
    const { dialog } = await openCard();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Edit description' }));
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Description' }), ' today');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Close card' }));

    await waitFor(() => expect(patch.bodies).toEqual([{ description: 'Collect the brief today' }]));
  });

  it.each([
    ['the Cancel button', () => userEvent.click(screen.getByRole('button', { name: 'Cancel' }))],
    ['Escape', () => userEvent.keyboard('{Escape}')],
  ])('throws the description draft away with %s', async (_name, discard) => {
    const patch = recording(() => json(200, { card: c1() }));
    stubBoard(undefined, { 'PATCH /cards/c1': patch.handler });
    const { dialog } = await openCard();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Edit description' }));
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Description' }), ' oops');
    await discard();
    // Moving focus afterwards must not save the thrown-away draft either.
    await userEvent.click(within(dialog).getByRole('textbox', { name: 'New checklist item' }));

    expect(within(dialog).getByRole('button', { name: 'Edit description' })).toHaveTextContent(
      'Collect the brief',
    );
    expect(patch.bodies).toEqual([]);
    expect(screen.getByTestId('card-detail')).toBeInTheDocument();
  });

  it('assigns only board members', async () => {
    const patch = recording((body) =>
      json(200, { card: c1({ assignees: body.assignees as string[] }) }),
    );
    stubBoard(undefined, { 'PATCH /cards/c1': patch.handler });
    const { dialog } = await openCard();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Members' }));
    const choices = within(dialog).getByRole('group', { name: 'Assign members' });
    expect(
      within(choices)
        .getAllByRole('checkbox')
        .map((box) => box.closest('label')?.textContent),
    ).toEqual(['PSPriya Sharma', 'AKAlex Kim']);
    await userEvent.click(within(choices).getByRole('checkbox', { name: /Alex Kim/ }));

    await waitFor(() => expect(patch.bodies).toEqual([{ assignees: ['u2'] }]));
  });

  it('sets a due date at local noon and can remove it', async () => {
    const patch = recording((body) =>
      json(200, { card: c1({ dueDate: (body.dueDate as string | null) ?? null }) }),
    );
    stubBoard(undefined, { 'PATCH /cards/c1': patch.handler });
    const { dialog } = await openCard();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Due date' }));
    const input = within(dialog).getByLabelText('Due date', { selector: 'input' });
    await userEvent.type(input, '2026-11-14');

    await waitFor(() =>
      expect(patch.bodies.at(-1)).toEqual({ dueDate: dateInputToIso('2026-11-14') }),
    );
    await userEvent.click(await within(dialog).findByRole('button', { name: 'Remove due date' }));
    await waitFor(() => expect(patch.bodies.at(-1)).toEqual({ dueDate: null }));
  });

  it('adds a label with a colour', async () => {
    const patch = recording((body) =>
      json(200, { card: c1({ labels: body.labels as CardDto['labels'] }) }),
    );
    stubBoard(undefined, { 'PATCH /cards/c1': patch.handler });
    const { dialog } = await openCard();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Labels' }));
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Label name' }), 'Design');
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Violet' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add label' }));

    await waitFor(() =>
      expect(patch.bodies).toEqual([{ labels: [{ name: 'Design', color: '#7c3aed' }] }]),
    );
  });
});

describe('checklist', () => {
  it('shows progress and ticks one item through its own endpoint', async () => {
    const tick = recording(() =>
      json(200, { card: c1({ checklist: CHECKLIST.map((item) => ({ ...item, done: true })) }) }),
    );
    stubBoard(undefined, { 'PATCH /cards/c1/checklist/i2': tick.handler });
    const { dialog } = await openCard();
    const progress = within(dialog).getByRole('progressbar', { name: 'Checklist progress' });
    expect(progress).toHaveAttribute('aria-valuenow', '50');

    await userEvent.click(within(dialog).getByRole('checkbox', { name: 'Review' }));

    await waitFor(() => expect(tick.bodies).toEqual([{ done: true }]));
    await waitFor(() => expect(progress).toHaveAttribute('aria-valuenow', '100'));
    expect(dialog).toHaveTextContent('2 of 2 done');
  });

  it('keeps a newer copy that arrived over the socket before its own, older response', async () => {
    // Priya ticks "Review"; Alex's change lands on the server just after hers, and his event
    // reaches her browser before her own response does.
    let respond: (response: Response) => void = () => {};
    stubBoard(undefined, {
      'PATCH /cards/c1/checklist/i2': () => new Promise<Response>((done) => (respond = done)),
    });
    const { dialog } = await openCard();
    await waitFor(() => expect(fakeSocket.emitted.length).toBeGreaterThan(0));

    await userEvent.click(within(dialog).getByRole('checkbox', { name: 'Review' }));
    const ticked = CHECKLIST.map((item) => ({ ...item, done: true }));
    act(() =>
      fakeSocket.serverEmit('card:updated', {
        boardId: 'b1',
        actorId: 'u2',
        card: c1({ title: 'Renamed by Alex', checklist: ticked, version: 2 }),
      }),
    );
    await waitFor(() =>
      expect(within(dialog).getByRole('textbox', { name: 'Card title' })).toHaveValue(
        'Renamed by Alex',
      ),
    );
    respond(json(200, { card: c1({ checklist: ticked, version: 1 }) }));

    await waitFor(() =>
      expect(within(dialog).getByRole('checkbox', { name: 'Review' })).toBeEnabled(),
    );
    expect(within(dialog).getByRole('textbox', { name: 'Card title' })).toHaveValue(
      'Renamed by Alex',
    );
  });

  it('adds an item and clears the field once saved', async () => {
    const add = recording((body) =>
      json(201, {
        card: c1({ checklist: [...CHECKLIST, { id: 'i3', text: String(body.text), done: false }] }),
      }),
    );
    stubBoard(undefined, { 'POST /cards/c1/checklist': add.handler });
    const { dialog } = await openCard();
    const field = within(dialog).getByRole('textbox', { name: 'New checklist item' });

    await userEvent.type(field, 'Publish{Enter}');

    await waitFor(() => expect(add.bodies).toEqual([{ text: 'Publish' }]));
    expect(await within(dialog).findByRole('checkbox', { name: 'Publish' })).not.toBeChecked();
    expect(field).toHaveValue('');
  });

  it('keeps what was typed when adding fails', async () => {
    stubBoard(undefined, { 'POST /cards/c1/checklist': () => errorResponse(500, 'INTERNAL') });
    const { dialog } = await openCard();
    const field = within(dialog).getByRole('textbox', { name: 'New checklist item' });

    await userEvent.type(field, 'Publish{Enter}');

    await waitFor(() => expect(toasts()).toHaveLength(1));
    expect(field).toHaveValue('Publish');
  });

  it('renames an item on Enter, and Escape throws the rename away', async () => {
    const rename = recording((body) =>
      json(200, {
        card: c1({ checklist: [CHECKLIST[0]!, { ...CHECKLIST[1]!, text: String(body.text) }] }),
      }),
    );
    stubBoard(undefined, { 'PATCH /cards/c1/checklist/i2': rename.handler });
    const { dialog } = await openCard();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Rename "Review"' }));
    await userEvent.keyboard(' twice{Escape}');
    expect(rename.bodies).toEqual([]);

    await userEvent.click(within(dialog).getByRole('button', { name: 'Rename "Review"' }));
    await userEvent.keyboard(' copy{Enter}');
    await waitFor(() => expect(rename.bodies).toEqual([{ text: 'Review copy' }]));
    expect(
      await within(dialog).findByRole('checkbox', { name: 'Review copy' }),
    ).toBeInTheDocument();
  });

  it('deletes an item', async () => {
    const remove = recording(() => json(200, { card: c1({ checklist: [CHECKLIST[0]!] }) }));
    stubBoard(undefined, { 'DELETE /cards/c1/checklist/i2': remove.handler });
    const { dialog } = await openCard();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete "Review"' }));

    await waitFor(() =>
      expect(within(dialog).queryByRole('checkbox', { name: 'Review' })).not.toBeInTheDocument(),
    );
  });
});

describe('actions', () => {
  it('deletes the card after a confirmation and returns to the board', async () => {
    let deletes = 0;
    stubBoard(undefined, {
      'DELETE /cards/c1': () => {
        deletes += 1;
        return noContent();
      },
    });
    const { router, dialog } = await openCard();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete…' }));
    expect(deletes).toBe(0);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete card' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/b/b1'));
    expect(deletes).toBe(1);
    expect(screen.queryByTestId('card-c1')).not.toBeInTheDocument();
    // Its own delete is not reported as "gone".
    expect(toasts()).toEqual(['Card deleted.']);
  });

  // In production the socket echo of your own write often beats the HTTP response. The card
  // leaves the cache first, the modal unmounts, and only then does the request finish.
  it.each([
    [
      'delete',
      'DELETE /cards/c1',
      () => noContent(),
      'card:deleted',
      { cardId: 'c1', listId: 'l1' },
      'Card deleted.',
    ],
    [
      'archive',
      'PATCH /cards/c1',
      () => json(200, { card: c1({ archived: true }) }),
      'card:updated',
      { card: c1({ archived: true, version: 99 }) },
      'Card archived.',
    ],
  ] as const)(
    'returns to the board after its own %s even when the live update arrives first',
    async (action, route, respond, event, payload, toast) => {
      let finish: (response: Response) => void = () => {};
      stubBoard(undefined, {
        [route]: () => new Promise<Response>((resolve) => (finish = resolve)),
      });
      const { router, dialog } = await openCard();
      await waitFor(() => expect(fakeSocket.emitted.length).toBeGreaterThan(0));

      if (action === 'delete') {
        await userEvent.click(within(dialog).getByRole('button', { name: 'Delete…' }));
        await userEvent.click(within(dialog).getByRole('button', { name: 'Delete card' }));
      } else {
        await userEvent.click(within(dialog).getByRole('button', { name: 'Archive' }));
      }
      act(() => fakeSocket.serverEmit(event, { boardId: 'b1', actorId: 'u1', ...payload }));
      await waitFor(() => expect(screen.queryByTestId('card-detail')).not.toBeInTheDocument());
      act(() => {
        finish(respond());
      });

      await waitFor(() => expect(router.state.location.pathname).toBe('/b/b1'));
      expect(toasts()).toEqual([toast]);
    },
  );

  it('archives the card and returns to the board', async () => {
    stubBoard(undefined, { 'PATCH /cards/c1': () => json(200, { card: c1({ archived: true }) }) });
    const { router, dialog } = await openCard();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Archive' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/b/b1'));
    expect(screen.queryByTestId('card-c1')).not.toBeInTheDocument();
    expect(toasts()).toEqual(['Card archived.']);
  });
});

describe('viewers', () => {
  it('see the card without any way to change it', async () => {
    stubBoard(detailWithChecklist('viewer'));
    const { dialog } = await openCard();

    expect(within(dialog).getByRole('heading', { name: 'Card c1', level: 2 })).toBeInTheDocument();
    expect(within(dialog).queryByRole('textbox')).not.toBeInTheDocument();
    expect(
      within(dialog).queryByRole('complementary', { name: 'Card options' }),
    ).not.toBeInTheDocument();
    expect(within(dialog).getByText('Collect the brief')).toBeInTheDocument();
    for (const box of within(dialog).getAllByRole('checkbox')) expect(box).toBeDisabled();
    expect(
      within(dialog).queryByRole('button', { name: /Delete|Rename|Edit/ }),
    ).not.toBeInTheDocument();
  });
});

describe('due date helpers', () => {
  it('round-trips a date input value through ISO', () => {
    expect(isoToDateInput(dateInputToIso('2026-11-14'))).toBe('2026-11-14');
  });
});
