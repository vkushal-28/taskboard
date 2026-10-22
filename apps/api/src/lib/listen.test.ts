import type { AddressInfo } from 'node:net';
import express from 'express';
import { describe, expect, it } from 'vitest';
import { listen } from './listen.js';

describe('listen', () => {
  it('resolves with the server once it is listening', async () => {
    const server = await listen(express(), 0);

    expect(server.listening).toBe(true);
    server.close();
  });

  it('rejects when the port is already in use', async () => {
    const first = await listen(express(), 0);
    const { port } = first.address() as AddressInfo;

    await expect(listen(express(), port)).rejects.toMatchObject({ code: 'EADDRINUSE' });
    first.close();
  });
});
