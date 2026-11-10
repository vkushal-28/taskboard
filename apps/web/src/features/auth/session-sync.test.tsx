import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { errorResponse, json, noContent } from '../../test/http';
import { emptyHomeHandlers, renderApp, stubApi } from '../../test/render';
import { SESSION_CHANNEL_NAME } from './session-sync';

const priya = { id: 'u1', name: 'Priya', email: 'priya@acme.dev' };
const alex = { id: 'u2', name: 'Alex', email: 'alex@acme.dev' };
const signedOut = () => errorResponse(401, 'UNAUTHORIZED');

// Stands in for another tab of the same browser.
let otherTab: BroadcastChannel;
beforeEach(() => {
  otherTab = new BroadcastChannel(SESSION_CHANNEL_NAME);
});
afterEach(() => otherTab.close());

describe('sign-in and sign-out in other tabs', () => {
  it('sends this tab to sign-in when another tab signs out', async () => {
    stubApi({ ...emptyHomeHandlers, 'GET /auth/me': () => json(200, { user: priya }) });
    const { router } = renderApp('/');
    expect(await screen.findByRole('heading', { name: /Priya/ })).toBeVisible();

    otherTab.postMessage({ userId: null });

    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
  });

  it('switches to the user another tab signed in as', async () => {
    let me: typeof priya | null = null;
    stubApi({
      ...emptyHomeHandlers,
      'GET /auth/me': () => (me ? json(200, { user: me }) : signedOut()),
      'POST /auth/refresh': signedOut,
    });
    const { router } = renderApp('/login');
    expect(await screen.findByRole('heading', { name: 'Sign in to Taskboard' })).toBeVisible();

    me = alex;
    otherTab.postMessage({ userId: alex.id });

    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(await screen.findByRole('heading', { name: /Alex/ })).toBeVisible();
  });

  it('ignores an announcement for the user it already shows', async () => {
    let meCalls = 0;
    stubApi({
      ...emptyHomeHandlers,
      'GET /auth/me': () => {
        meCalls += 1;
        return json(200, { user: priya });
      },
    });
    const { router } = renderApp('/');
    expect(await screen.findByRole('heading', { name: /Priya/ })).toBeVisible();

    otherTab.postMessage({ userId: priya.id });
    otherTab.postMessage({ unrelated: true });
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(router.state.location.pathname).toBe('/');
    expect(meCalls).toBe(1);
  });

  it('tells the other tabs when this tab signs out', async () => {
    stubApi({
      ...emptyHomeHandlers,
      'GET /auth/me': () => json(200, { user: priya }),
      'POST /auth/logout': noContent,
    });
    const received: unknown[] = [];
    otherTab.onmessage = (event) => received.push(event.data);
    renderApp('/');
    const user = userEvent.setup();

    await user.click(await screen.findByLabelText('Account menu'));
    await user.click(screen.getByRole('button', { name: 'Sign out' }));

    await waitFor(() => expect(received).toEqual([{ userId: null }]));
  });

  it('tells the other tabs when this tab finds its session expired', async () => {
    stubApi({
      'GET /auth/me': () => json(200, { user: priya }),
      'GET /boards': signedOut,
      'GET /activity/recent': () => json(200, { activity: [] }),
      'POST /auth/refresh': signedOut,
    });
    const received: unknown[] = [];
    otherTab.onmessage = (event) => received.push(event.data);
    const { router } = renderApp('/');

    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(received).toEqual([{ userId: null }]);
  });

  it('tells the other tabs who signed in', async () => {
    stubApi({
      ...emptyHomeHandlers,
      'GET /auth/me': signedOut,
      'POST /auth/refresh': signedOut,
      'POST /auth/login': () => json(200, { user: priya }),
    });
    const received: unknown[] = [];
    otherTab.onmessage = (event) => received.push(event.data);
    renderApp('/login');
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText('Email'), 'priya@acme.dev');
    await user.type(screen.getByLabelText('Password'), 'secret-password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => expect(received).toEqual([{ userId: priya.id }]));
  });
});
