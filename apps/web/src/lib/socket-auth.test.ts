import { describe, expect, it } from 'vitest';
import { errorResponse, json } from '../test/http';
import { stubApi } from '../test/render';
import { provideSocketTicket } from './socket-auth';

function auth(): Promise<Record<string, unknown>> {
  return new Promise((resolve) => provideSocketTicket(resolve));
}

describe('provideSocketTicket', () => {
  it('hands Socket.IO a fresh ticket for each connection attempt', async () => {
    let issued = 0;
    stubApi({ 'POST /realtime/ticket': () => json(201, { ticket: `ticket-${++issued}` }) });

    expect(await auth()).toEqual({ ticket: 'ticket-1' });
    expect(await auth()).toEqual({ ticket: 'ticket-2' });
  });

  it('connects without a ticket when none can be had, so the server answers UNAUTHORIZED', async () => {
    stubApi({ 'POST /realtime/ticket': () => errorResponse(500, 'INTERNAL_ERROR') });

    expect(await auth()).toEqual({});
  });
});
