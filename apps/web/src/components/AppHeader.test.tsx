import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { json } from '../test/http';
import { emptyHomeHandlers, renderApp, stubApi } from '../test/render';

const priya = { id: 'u1', name: 'Priya Sharma', email: 'priya@acme.dev' };

async function openMenu() {
  stubApi({ ...emptyHomeHandlers, 'GET /auth/me': () => json(200, { user: priya }) });
  renderApp('/');
  const user = userEvent.setup();
  const summary = await screen.findByLabelText('Account menu');
  await user.click(summary);
  const details = summary.closest('details') as HTMLDetailsElement;
  expect(details.open).toBe(true);
  return { user, summary, details };
}

describe('Account menu', () => {
  it('closes on Escape and gives focus back to the avatar', async () => {
    const { user, summary, details } = await openMenu();

    await user.keyboard('{Escape}');

    expect(details.open).toBe(false);
    expect(summary).toHaveFocus();
  });

  it('closes on a click outside, but not on a click inside', async () => {
    const { user, details } = await openMenu();

    await user.click(screen.getByText('priya@acme.dev'));
    expect(details.open).toBe(true);

    await user.click(document.body);
    expect(details.open).toBe(false);
  });
});

describe('Board search', () => {
  it('is in the header at every screen size', async () => {
    stubApi({ ...emptyHomeHandlers, 'GET /auth/me': () => json(200, { user: priya }) });
    renderApp('/');

    const search = await screen.findByRole('searchbox', { name: 'Search boards' });
    expect(search).not.toHaveClass('hidden');
  });
});
