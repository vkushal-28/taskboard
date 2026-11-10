import { create } from 'zustand';

export type ToastTone = 'error' | 'info';

export interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
  key?: string;
}

interface ToastState {
  toasts: Toast[];
  dismiss: (id: number) => void;
}

export const TOAST_DURATION_MS = 5000;
let nextId = 1;

// UI-only state, so it lives in Zustand rather than TanStack Query (CLAUDE.md).
export const useToastStore = create<ToastState>()((set) => ({
  toasts: [],
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),
}));

const timers = new Map<number, ReturnType<typeof setTimeout>>();

function scheduleDismiss(id: number): void {
  clearTimeout(timers.get(id));
  timers.set(
    id,
    setTimeout(() => {
      timers.delete(id);
      useToastStore.getState().dismiss(id);
    }, TOAST_DURATION_MS),
  );
}

interface ToastOptions {
  /**
   * Toasts with the same key replace each other instead of stacking: the newest message
   * takes the old one's place and its timer starts again. Used for bursts like remote moves.
   */
  key?: string;
}

/** Callable outside React, e.g. from a mutation's onError. */
export function showToast(
  message: string,
  tone: ToastTone = 'error',
  { key }: ToastOptions = {},
): void {
  const existing = key
    ? useToastStore.getState().toasts.find((toast) => toast.key === key)
    : undefined;
  if (existing) {
    useToastStore.setState((state) => ({
      toasts: state.toasts.map((toast) =>
        toast.id === existing.id ? { ...toast, message, tone } : toast,
      ),
    }));
    scheduleDismiss(existing.id);
    return;
  }

  const toast: Toast = { id: nextId++, message, tone, key };
  useToastStore.setState((state) => ({ toasts: [...state.toasts, toast] }));
  scheduleDismiss(toast.id);
}
