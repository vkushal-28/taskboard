import type { RealtimeSocket } from '../lib/socket';

type Listener = (payload: unknown) => void;

/** Stands in for the Socket.IO client in every test (see setup.ts). jsdom never opens a socket. */
class FakeSocket implements RealtimeSocket {
  connected = false;
  /** What the "server" answers to every emitWithAck. */
  ack: unknown = { ok: true, role: 'owner' };
  readonly emitted: { event: string; payload: unknown }[] = [];
  private readonly listeners = new Map<string, Set<Listener>>();

  connect(): void {
    if (this.connected) return;
    this.connected = true;
    this.fire('connect', undefined);
  }

  disconnect(): void {
    if (!this.connected) return;
    this.connected = false;
    this.fire('disconnect', 'io client disconnect');
  }

  on(event: string, listener: Listener): void {
    const set = this.listeners.get(event) ?? new Set();
    set.add(listener);
    this.listeners.set(event, set);
  }

  off(event: string, listener: Listener): void {
    this.listeners.get(event)?.delete(listener);
  }

  emit(event: string, payload: unknown): void {
    this.emitted.push({ event, payload });
  }

  emitWithAck(event: string, payload: unknown): Promise<unknown> {
    this.emitted.push({ event, payload });
    return Promise.resolve(this.ack);
  }

  /** An event from the server. */
  serverEmit(event: string, payload: unknown): void {
    this.fire(event, payload);
  }

  /** The connection drops and comes back, as Socket.IO's reconnect does. */
  reconnect(): void {
    this.connected = false;
    this.fire('disconnect', 'transport close');
    this.connect();
  }

  /** The server closed the connection, e.g. after the session was revoked (ADR 016). */
  serverDisconnect(): void {
    this.connected = false;
    this.fire('disconnect', 'io server disconnect');
  }

  /** The server refused the handshake with this `data.code`. */
  refuse(code: string): void {
    this.connected = false;
    this.fire('connect_error', Object.assign(new Error('refused'), { data: { code } }));
  }

  listenerCount(): number {
    return [...this.listeners.values()].reduce((sum, set) => sum + set.size, 0);
  }

  reset(): void {
    this.connected = false;
    this.ack = { ok: true, role: 'owner' };
    this.emitted.length = 0;
    this.listeners.clear();
  }

  private fire(event: string, payload: unknown): void {
    this.listeners.get(event)?.forEach((listener) => listener(payload));
  }
}

export const fakeSocket = new FakeSocket();
