import type { InviteErrorCode } from '@taskboard/shared';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { useToastStore } from '../../lib/toast-store';
import { boardDetail } from '../../test/board-fixtures';
import { errorResponse, json, noContent } from '../../test/http';
import { emptyHomeHandlers, renderApp, stubApi, type FakeRoute } from '../../test/render';

const sam = { id: 'u3', name: 'Sam Lee', email: 'sam@example.com' };
const signedOut = () => errorResponse(401, 'UNAUTHORIZED');
const PREVIEW = {
  board: { id: 'b1', title: 'Website Redesign', color: '#2563eb' },
  role: 'member',
  email: 'sam@example.com',
  invitedBy: { name: 'Priya Sharma' },
};

function stubInvite(handlers: Record<string, FakeRoute> = {}) {
  return stubApi({
    'GET /auth/me': () => json(200, { user: sam }),
    'GET /invites/tok-1': () => json(200, PREVIEW),
    'GET /boards/b1': () => json(200, boardDetail('member')),
    ...emptyHomeHandlers,
    ...handlers,
  });
}

describe('signed out', () => {
  it('signs in first, keeping the invite as the way back, even via the register page', async () => {
    stubApi({ 'GET /auth/me': signedOut, 'POST /auth/refresh': signedOut });
    const { router } = renderApp('/invite/tok-1');

    await screen.findByRole('heading', { name: 'Sign in to Taskboard' });
    expect(router.state.location.state).toEqual({ from: '/invite/tok-1' });

    await userEvent.click(screen.getByRole('link', { name: 'Create an account' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/register'));
    expect(router.state.location.state).toEqual({ from: '/invite/tok-1' });
  });
});

describe('a valid invite', () => {
  it('shows who invited you, to which board and with which role', async () => {
    stubInvite();
    renderApp('/invite/tok-1');

    expect(await screen.findByRole('heading', { name: 'Join Website Redesign' })).toBeVisible();
    expect(screen.getByTestId('invite-page')).toHaveTextContent(
      'Priya Sharma invited you to join Website Redesign as a member.',
    );
  });

  it('joins the board and opens it, replacing the invite in history', async () => {
    let accepted = 0;
    stubInvite({
      'POST /invites/tok-1/accept': () => {
        accepted += 1;
        return json(200, { boardId: 'b1', role: 'member' });
      },
    });
    const { router } = renderApp('/invite/tok-1');

    await userEvent.click(await screen.findByRole('button', { name: 'Accept invite' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/b/b1'));
    expect(accepted).toBe(1);
    expect(router.state.historyAction).toBe('REPLACE');
    expect(useToastStore.getState().toasts.map((toast) => toast.message)).toContain(
      'You joined Website Redesign.',
    );
  });

  it('shows the reason when the invite stops working before you accept', async () => {
    stubInvite({
      'POST /invites/tok-1/accept': () =>
        errorResponse(
          410,
          'INVITE_EXPIRED',
          'This invite has expired. Ask the board owner for a new one.',
        ),
    });
    renderApp('/invite/tok-1');

    await userEvent.click(await screen.findByRole('button', { name: 'Accept invite' }));

    expect(await screen.findByRole('heading', { name: 'This invite has expired' })).toBeVisible();
  });
});

describe('an invite that cannot be used', () => {
  it.each<[InviteErrorCode, number, string]>([
    ['INVITE_NOT_FOUND', 404, 'This invite link isn’t valid'],
    ['INVITE_EXPIRED', 410, 'This invite has expired'],
    ['INVITE_REVOKED', 410, 'This invite was revoked'],
    ['INVITE_USED', 410, 'This invite was already used'],
  ])('%s shows "%s" with the server’s explanation', async (code, status, title) => {
    stubInvite({ 'GET /invites/tok-1': () => errorResponse(status, code, `Because ${code}`) });
    renderApp('/invite/tok-1');

    expect(await screen.findByRole('heading', { name: title })).toBeVisible();
    expect(screen.getByText(`Because ${code}`)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Accept invite' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Go to your boards' })).toHaveAttribute('href', '/');
  });

  it('offers to switch accounts when signed in as someone else', async () => {
    let signedIn = true;
    stubInvite({
      'GET /auth/me': () => (signedIn ? json(200, { user: sam }) : signedOut()),
      'POST /auth/refresh': signedOut,
      'GET /invites/tok-1': () =>
        errorResponse(
          403,
          'INVITE_WRONG_ACCOUNT',
          'This invite was sent to priya@acme.dev. Sign in with that email to accept it.',
        ),
      'POST /auth/logout': () => {
        signedIn = false;
        return noContent();
      },
    });
    const { router } = renderApp('/invite/tok-1');

    expect(
      await screen.findByRole('heading', { name: 'This invite is for another account' }),
    ).toBeVisible();
    expect(screen.getByText(/sent to priya@acme.dev/)).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Sign out and switch account' }));

    await screen.findByRole('heading', { name: 'Sign in to Taskboard' });
    expect(router.state.location.state).toEqual({ from: '/invite/tok-1' });
  });
});
