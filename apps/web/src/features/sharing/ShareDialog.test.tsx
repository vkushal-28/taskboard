import type { BoardDetail, BoardMemberDto, InviteDto } from '@taskboard/shared';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useToastStore } from '../../lib/toast-store';
import { boardDetail, MEMBER, OWNER } from '../../test/board-fixtures';
import { fakeSocket } from '../../test/fake-socket';
import { errorResponse, json } from '../../test/http';
import { emptyHomeHandlers, renderApp, stubApi, type FakeRoute } from '../../test/render';
import { REMOVED_MESSAGE } from '../board/useBoardSocket';

const priya = { id: 'u1', name: 'Priya Sharma', email: 'priya@acme.dev' };
const LINK = 'http://localhost:5173/invite/tok-1';
const DAY = 24 * 60 * 60 * 1000;

function invite(id: string, email: string, expiresInDays: number): InviteDto {
  return {
    id,
    email,
    role: 'member',
    invitedBy: { id: 'u1', name: 'Priya Sharma' },
    createdAt: new Date(Date.now() - DAY).toISOString(),
    expiresAt: new Date(Date.now() + expiresInDays * DAY).toISOString(),
  };
}

/** Records request bodies sent to a route and answers with `respond`. */
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

function stubBoard(
  handlers: Record<string, FakeRoute> = {},
  detail: BoardDetail = boardDetail('owner'),
  invites: InviteDto[] = [],
) {
  return stubApi({
    'GET /auth/me': () => json(200, { user: priya }),
    'GET /boards/b1': () => json(200, detail),
    'GET /boards/b1/invites': () => json(200, { invites }),
    ...emptyHomeHandlers,
    ...handlers,
  });
}

async function openShare() {
  const view = renderApp('/b/b1');
  await userEvent.click(await screen.findByRole('button', { name: 'Share' }));
  const dialog = await screen.findByTestId('share-dialog');
  return { ...view, dialog };
}

const toasts = () => useToastStore.getState().toasts.map((toast) => toast.message);

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the Share button', () => {
  it('is only shown to owners', async () => {
    stubBoard({}, boardDetail('member'));
    renderApp('/b/b1');
    await screen.findByRole('heading', { name: 'Website Redesign', level: 1 });

    expect(screen.queryByRole('button', { name: 'Share' })).toBeNull();
  });
});

describe('members', () => {
  it('lists members with their roles, marking the current user', async () => {
    stubBoard();
    const { dialog } = await openShare();

    expect(within(dialog).getByTestId('member-u1')).toHaveTextContent('Priya Sharma (you)');
    expect(within(dialog).getByRole('combobox', { name: 'Role for Alex Kim' })).toHaveValue(
      'member',
    );
    // No Remove for yourself; an owner steps down with the role select.
    expect(within(dialog).queryByRole('button', { name: 'Remove Priya Sharma' })).toBeNull();
  });

  it('changes a role and shows the server’s member list', async () => {
    const patch = recording(() =>
      json(200, { members: [OWNER, { ...MEMBER, role: 'viewer' }] satisfies BoardMemberDto[] }),
    );
    stubBoard({ 'PATCH /boards/b1/members/u2': patch.handler });
    const { dialog } = await openShare();
    const select = within(dialog).getByRole('combobox', { name: 'Role for Alex Kim' });

    await userEvent.selectOptions(select, 'viewer');

    await waitFor(() => expect(select).toHaveValue('viewer'));
    expect(patch.bodies).toEqual([{ role: 'viewer' }]);
  });

  it('explains a refused change and keeps the old role', async () => {
    stubBoard({
      'PATCH /boards/b1/members/u1': () =>
        errorResponse(409, 'LAST_OWNER', 'A board needs at least one owner.'),
    });
    const { dialog } = await openShare();
    const select = within(dialog).getByRole('combobox', { name: 'Role for Priya Sharma' });

    await userEvent.selectOptions(select, 'member');

    await waitFor(() => expect(toasts()).toContain('A board needs at least one owner.'));
    expect(select).toHaveValue('owner');
  });

  it('removes a member after confirming', async () => {
    const remove = recording(() => json(200, { members: [OWNER] }));
    stubBoard({ 'DELETE /boards/b1/members/u2': remove.handler });
    const confirm = vi
      .spyOn(window, 'confirm')
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);
    const { dialog } = await openShare();
    const button = within(dialog).getByRole('button', { name: 'Remove Alex Kim' });

    await userEvent.click(button);
    expect(remove.bodies).toHaveLength(0);
    await userEvent.click(button);

    await waitFor(() => expect(within(dialog).queryByTestId('member-u2')).toBeNull());
    expect(confirm).toHaveBeenCalledWith('Remove Alex Kim from this board?');
  });
});

describe('invites', () => {
  it('invites by email and shows a link to copy', async () => {
    const user = userEvent.setup();
    const created = recording((body) =>
      json(201, {
        invite: { ...invite('i1', String(body.email), 7), role: body.role },
        link: LINK,
        emailed: false,
      }),
    );
    stubBoard({ 'POST /boards/b1/invites': created.handler });
    const { dialog } = await openShare();
    const email = within(dialog).getByRole('textbox', { name: 'Email address' });

    await user.type(email, 'sam@example.com');
    await user.selectOptions(
      within(dialog).getByRole('combobox', { name: 'Role for the invite' }),
      'viewer',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Invite' }));

    const box = await within(dialog).findByRole('status');
    expect(created.bodies).toEqual([{ email: 'sam@example.com', role: 'viewer' }]);
    expect(box).toHaveTextContent('Send this link to sam@example.com');
    expect(within(box).getByRole('textbox', { name: 'Invite link' })).toHaveValue(LINK);
    expect(email).toHaveValue('');

    await user.click(within(box).getByRole('button', { name: 'Copy link' }));
    expect(await navigator.clipboard.readText()).toBe(LINK);
    expect(within(box).getByRole('button', { name: 'Copied' })).toBeInTheDocument();
  });

  it('says so when the invite was also emailed', async () => {
    stubBoard({
      'POST /boards/b1/invites': () =>
        json(201, { invite: invite('i1', 'sam@example.com', 7), link: LINK, emailed: true }),
    });
    const { dialog } = await openShare();

    await userEvent.type(
      within(dialog).getByRole('textbox', { name: 'Email address' }),
      'sam@example.com',
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Invite' }));

    expect(await within(dialog).findByRole('status')).toHaveTextContent(
      'We emailed an invite to sam@example.com',
    );
  });

  it('shows the server’s reason when an invite is refused', async () => {
    stubBoard({
      'POST /boards/b1/invites': () =>
        errorResponse(409, 'ALREADY_INVITED', 'sam@example.com already has a pending invite'),
    });
    const { dialog } = await openShare();
    const email = within(dialog).getByRole('textbox', { name: 'Email address' });

    await userEvent.type(email, 'sam@example.com');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Invite' }));

    expect(
      await within(dialog).findByText('sam@example.com already has a pending invite'),
    ).toBeInTheDocument();
    expect(email).toHaveValue('sam@example.com');
  });

  it('checks the email before sending anything', async () => {
    const fetchMock = stubBoard();
    const { dialog } = await openShare();

    await userEvent.type(
      within(dialog).getByRole('textbox', { name: 'Email address' }),
      'not-an-email',
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Invite' }));

    await waitFor(() =>
      expect(within(dialog).getByRole('textbox', { name: 'Email address' })).toHaveAttribute(
        'aria-invalid',
        'true',
      ),
    );
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false);
  });

  it('lists pending invites with their expiry, and resends or revokes them', async () => {
    let invites = [invite('i1', 'sam@example.com', 7.5), invite('i2', 'late@example.com', -1)];
    const revoked = recording(() => {
      invites = invites.filter((item) => item.id !== 'i2');
      return new Response(null, { status: 204 });
    });
    stubApi({
      'GET /auth/me': () => json(200, { user: priya }),
      'GET /boards/b1': () => json(200, boardDetail('owner')),
      'GET /boards/b1/invites': () => json(200, { invites }),
      'POST /boards/b1/invites/i1/resend': () =>
        json(200, {
          invite: invite('i1', 'sam@example.com', 7),
          link: `${LINK}-new`,
          emailed: false,
        }),
      'DELETE /boards/b1/invites/i2': revoked.handler,
    });
    const { dialog } = await openShare();

    expect(await within(dialog).findByTestId('invite-i1')).toHaveTextContent('Expires in 7 days');
    expect(within(dialog).getByTestId('invite-i2')).toHaveTextContent('Expired');

    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Resend invite to sam@example.com' }),
    );
    expect(await within(dialog).findByRole('textbox', { name: 'Invite link' })).toHaveValue(
      `${LINK}-new`,
    );

    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Revoke invite to late@example.com' }),
    );
    await waitFor(() => expect(within(dialog).queryByTestId('invite-i2')).toBeNull());
    expect(revoked.bodies).toHaveLength(1);
  });
});

describe('live membership changes', () => {
  async function openBoard() {
    stubBoard();
    const view = renderApp('/b/b1');
    await screen.findByRole('button', { name: 'Share' });
    await waitFor(() => expect(fakeSocket.emitted.length).toBeGreaterThan(0));
    return view;
  }

  it('updates my role live: a demoted owner loses the Share button', async () => {
    const members = [
      { ...OWNER, role: 'member' as const },
      { ...MEMBER, role: 'owner' as const },
    ];
    // The hook also refetches the board, and the server would answer with the new role.
    let detail = boardDetail('owner');
    stubBoard({ 'GET /boards/b1': () => json(200, detail) });
    renderApp('/b/b1');
    await screen.findByRole('button', { name: 'Share' });
    await waitFor(() => expect(fakeSocket.emitted.length).toBeGreaterThan(0));
    detail = { ...boardDetail('member'), board: { ...boardDetail('member').board, members } };

    act(() => fakeSocket.serverEmit('members:updated', { boardId: 'b1', actorId: 'u2', members }));

    await waitFor(() => expect(screen.queryByRole('button', { name: 'Share' })).toBeNull());
    expect(screen.getByText('Member', { selector: 'span' })).toBeInTheDocument();
  });

  it('takes a removed member back to their boards', async () => {
    const { router } = await openBoard();

    act(() =>
      fakeSocket.serverEmit('members:updated', {
        boardId: 'b1',
        actorId: 'u2',
        members: [{ ...MEMBER, role: 'owner' }],
      }),
    );

    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(toasts()).toContain(REMOVED_MESSAGE);
  });
});
