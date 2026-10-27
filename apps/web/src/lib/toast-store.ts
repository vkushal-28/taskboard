import { create } from 'zustand';

export type ToastTone = 'error' | 'info';

export interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
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

/** Callable outside React, e.g. from a mutation's onError. */
export function showToast(message: string, tone: ToastTone = 'error'): void {
  const toast = { id: nextId++, message, tone };
  useToastStore.setState((state) => ({ toasts: [...state.toasts, toast] }));
  setTimeout(() => useToastStore.getState().dismiss(toast.id), TOAST_DURATION_MS);
}
