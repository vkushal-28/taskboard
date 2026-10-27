import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { errorResponse, json, noContent, urlOf } from '../../test/http';
import { renderApp, stubApi } from '../../test/render';
import { DEMO_CREDENTIALS } from './SignInPage';

const priya = { id: 'u1', name: 'Priya', email: 'priya@acme.dev' };
const signedOut = () => errorResponse(401, 'UNAUTHORIZED');

function requestBody(init: RequestInit | undefined): unknown {
  return typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
}

describe('route guards', () => {
  it('sends a signed-out visitor to the sign-in page', async () => {
    stubApi({ 'GET /auth/me': signedOut, 'POST /auth/refresh': signedOut });
    const { router } = renderApp('/');

    expect(await screen.findByRole('heading', { name: 'Sign in to Taskboard' })).toBeVisible();
    expect(router.state.location.pathname).toBe('/login');
  });

  it('shows the protected page to a signed-in user', async () => {
    stubApi({ 'GET /auth/me': () => json(200, { user: priya }) });
    renderApp('/');

    expect(await screen.findByRole('heading', { name: 'Welcome, Priya' })).toBeVisible();
  });

  it('sends a signed-in user away from the sign-in page', async () => {
    stubApi({ 'GET /auth/me': () => json(200, { user: priya }) });
    const { router } = renderApp('/login');

    await screen.findByRole('heading', { name: 'Welcome, Priya' });
    expect(router.state.location.pathname).toBe('/');
  });
});

describe('sign in', () => {
  it('shows validation errors without calling the api', async () => {
    const fetchMock = stubApi({ 'GET /auth/me': signedOut, 'POST /auth/refresh': signedOut });
    renderApp('/login');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Sign in' }));

    expect(await screen.findByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Password')).toHaveAttribute('aria-invalid', 'true');
    expect(fetchMock.mock.calls.some(([input]) => urlOf(input).endsWith('/auth/login'))).toBe(
      false,
    );
  });

  it('signs in with normalised input and lands on the page the user asked for', async () => {
    let sentBody: unknown;
    stubApi({
      'GET /auth/me': signedOut,
      'POST /auth/refresh': signedOut,
      'POST /auth/login': (init) => {
        sentBody = requestBody(init);
        return json(200, { user: priya });
      },
    });
    const { router } = renderApp('/');
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText('Email'), '  Priya@Acme.dev ');
    await user.type(screen.getByLabelText('Password'), 'secret-password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('heading', { name: 'Welcome, Priya' })).toBeVisible();
    expect(router.state.location.pathname).toBe('/');
    expect(sentBody).toEqual({ email: 'priya@acme.dev', password: 'secret-password' });
  });

  it('shows the server message for wrong credentials', async () => {
    stubApi({
      'GET /auth/me': signedOut,
      'POST /auth/refresh': signedOut,
      'POST /auth/login': () => errorResponse(401, 'UNAUTHORIZED', 'Invalid email or password'),
    });
    renderApp('/login');
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText('Email'), 'priya@acme.dev');
    await user.type(screen.getByLabelText('Password'), 'wrong');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password');
  });

  it('fills in the demo account', async () => {
    stubApi({ 'GET /auth/me': signedOut, 'POST /auth/refresh': signedOut });
    renderApp('/login');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Fill in demo login' }));

    expect(screen.getByLabelText('Email')).toHaveValue(DEMO_CREDENTIALS.email);
    expect(screen.getByLabelText('Password')).toHaveValue(DEMO_CREDENTIALS.password);
  });
});

describe('register', () => {
  async function fillRegisterForm() {
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Name'), 'Priya');
    await user.type(screen.getByLabelText('Email'), 'priya@acme.dev');
    await user.type(screen.getByLabelText('Password'), 'long-enough');
    await user.click(screen.getByRole('button', { name: 'Create account' }));
  }

  it('creates the account and signs the user in', async () => {
    stubApi({
      'GET /auth/me': signedOut,
      'POST /auth/refresh': signedOut,
      'POST /auth/register': () => json(201, { user: priya }),
    });
    renderApp('/register');

    await fillRegisterForm();

    expect(await screen.findByRole('heading', { name: 'Welcome, Priya' })).toBeVisible();
  });

  it('shows a duplicate email on the email field', async () => {
    stubApi({
      'GET /auth/me': signedOut,
      'POST /auth/refresh': signedOut,
      'POST /auth/register': () =>
        errorResponse(409, 'CONFLICT', 'An account with this email already exists'),
    });
    renderApp('/register');

    await fillRegisterForm();

    expect(await screen.findByText('An account with this email already exists')).toBeVisible();
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('sign out', () => {
  it('signs out and returns to the sign-in page', async () => {
    stubApi({
      'GET /auth/me': () => json(200, { user: priya }),
      'POST /auth/logout': noContent,
    });
    const { router } = renderApp('/');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Sign out' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
  });
});
