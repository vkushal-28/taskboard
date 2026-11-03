import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
import { useToastStore } from '../lib/toast-store';
import { fakeSocket } from './fake-socket';

// A mock in a setup file applies to every test file: no test opens a real socket.
// The factory is hoisted above the imports, so it loads the fake itself (same module instance).
vi.mock('../lib/socket', async () => {
  const { fakeSocket: socket } = await import('./fake-socket');
  return { getRealtimeSocket: () => socket };
});

afterEach(() => {
  cleanup();
  fakeSocket.reset();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  useToastStore.setState({ toasts: [] });
});

// jsdom has no <dialog> methods. These mimic the browser: `open` toggles and close() fires the
// "close" event that React's onClose listens to.
HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
  this.open = true;
};
HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
  if (!this.open) return;
  this.open = false;
  this.dispatchEvent(new Event('close'));
};
