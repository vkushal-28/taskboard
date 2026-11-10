import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { showToast, TOAST_DURATION_MS } from '../lib/toast-store';
import { Toaster } from './Toaster';

afterEach(() => {
  vi.useRealTimers();
});

describe('Toaster', () => {
  it('shows errors as alerts and other toasts as status messages', () => {
    render(<Toaster />);

    act(() => {
      showToast('Move failed');
      showToast('Board saved', 'info');
    });

    expect(screen.getByRole('alert')).toHaveTextContent('Move failed');
    expect(screen.getByRole('status')).toHaveTextContent('Board saved');
  });

  it('removes a toast when it is dismissed', async () => {
    render(<Toaster />);
    const user = userEvent.setup();
    act(() => showToast('Move failed'));

    await user.click(screen.getByRole('button', { name: 'Dismiss' }));

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('removes a toast on its own after the timeout', () => {
    vi.useFakeTimers();
    render(<Toaster />);
    act(() => showToast('Move failed'));

    act(() => {
      vi.advanceTimersByTime(TOAST_DURATION_MS - 1);
    });
    expect(screen.getByRole('alert')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('replaces a toast with the same key instead of stacking, and restarts its timer', () => {
    vi.useFakeTimers();
    render(<Toaster />);

    act(() => showToast('Alex moved "A" to Done', 'info', { key: 'remote-move' }));
    act(() => {
      vi.advanceTimersByTime(TOAST_DURATION_MS - 1000);
    });
    act(() => showToast('Alex moved "B" to Done', 'info', { key: 'remote-move' }));

    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.getByRole('status')).toHaveTextContent('Alex moved "B" to Done');

    // The first timer would have fired here; the replacement keeps it on screen.
    act(() => {
      vi.advanceTimersByTime(TOAST_DURATION_MS - 1);
    });
    expect(screen.getByRole('status')).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('still stacks toasts without a key', () => {
    render(<Toaster />);

    act(() => {
      showToast('First', 'info');
      showToast('Second', 'info');
    });

    expect(screen.getAllByRole('status')).toHaveLength(2);
  });
});
