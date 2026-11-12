import type { ReactNode } from 'react';

/** A red box for an error about the whole form (not one field), announced to screen readers. */
export function FormError({ children }: { children: ReactNode }) {
  return (
    <div role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
      {children}
    </div>
  );
}
