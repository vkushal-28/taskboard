import { io } from 'socket.io-client';
import { env } from '../config/env';

const ACK_TIMEOUT_MS = 5_000;

type Listener = (payload: unknown) => void;

/**
 * The slice of a Socket.IO client the app uses. Payloads are `unknown` on purpose: every one
 * is checked with a shared Zod schema before it touches the cache. Tests swap in a fake.
 */
export interface RealtimeSocket {
  readonly connected: boolean;
  connect(): void;
  disconnect(): void;
  on(event: string, listener: Listener): void;
  off(event: string, listener: Listener): void;
  /** Fire and forget. */
  emit(event: string, payload: unknown): void;
  /** Emits and waits for the server's ack; rejects after a timeout. */
  emitWithAck(event: string, payload: unknown): Promise<unknown>;
}

let instance: RealtimeSocket | null = null;

/** One socket per tab, created on first use and connected by whoever needs it. */
export function getRealtimeSocket(): RealtimeSocket {
  instance ??= createRealtimeSocket();
  return instance;
}

function createRealtimeSocket(): RealtimeSocket {
  const socket = io(env.socketUrl, {
    // Sends the httpOnly access cookie with the handshake (ADR 010).
    withCredentials: true,
    autoConnect: false,
    // WebSocket only: long polling spreads one session over many requests, which would need
    // sticky sessions as soon as the api runs on more than one instance.
    transports: ['websocket'],
  });

  return {
    get connected() {
      return socket.connected;
    },
    connect: () => void socket.connect(),
    disconnect: () => void socket.disconnect(),
    on: (event, listener) => void socket.on(event, listener),
    off: (event, listener) => void socket.off(event, listener),
    emit: (event, payload) => void socket.emit(event, payload),
    emitWithAck: (event, payload) => socket.timeout(ACK_TIMEOUT_MS).emitWithAck(event, payload),
  };
}
