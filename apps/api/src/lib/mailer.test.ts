import { afterEach, describe, expect, it, vi } from 'vitest';

const email = { to: 'sam@example.com', subject: 'Invite', text: 'secret link /invite/abc' };

async function loadMailer(env: Record<string, string | undefined>) {
  vi.resetModules();
  // The logger reads LOG_LEVEL from the same module.
  vi.doMock('../config/env.js', () => ({ env: { LOG_LEVEL: 'silent', NODE_ENV: 'test', ...env } }));
  const { logger } = await import('./logger.js');
  const logs = [vi.spyOn(logger, 'info'), vi.spyOn(logger, 'error')];
  const { sendEmail } = await import('./mailer.js');
  return { sendEmail, logs };
}

afterEach(() => {
  vi.doUnmock('../config/env.js');
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const logged = (logs: { mock: { calls: unknown[][] } }[]) =>
  JSON.stringify(logs.flatMap((log) => log.mock.calls));

describe('sendEmail', () => {
  it('skips the email without an api key, and never logs the body', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { sendEmail, logs } = await loadMailer({});

    expect(await sendEmail(email)).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(logged(logs)).not.toContain('/invite/');
  });

  it('posts to Resend with the key and sender', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response('{}', { status: 200 })));
    vi.stubGlobal('fetch', fetchMock);
    const { sendEmail } = await loadMailer({
      RESEND_API_KEY: 're_test',
      EMAIL_FROM: 'Taskboard <a@b.dev>',
    });

    expect(await sendEmail(email)).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer re_test' });
    expect(typeof init.body === 'string' && JSON.parse(init.body)).toEqual({
      from: 'Taskboard <a@b.dev>',
      ...email,
    });
  });

  it('returns false when Resend refuses or the network fails, without logging the body', async () => {
    const env = { RESEND_API_KEY: 're_test', EMAIL_FROM: 'a@b.dev' };
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('no', { status: 422 }))),
    );
    const refused = await loadMailer(env);
    expect(await refused.sendEmail(email)).toBe(false);
    expect(logged(refused.logs)).not.toContain('/invite/');

    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('offline'))),
    );
    const offline = await loadMailer(env);
    expect(await offline.sendEmail(email)).toBe(false);
  });
});
