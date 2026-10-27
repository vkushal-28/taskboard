import type { ReactNode } from 'react';

export function FormError({ children }: { children: ReactNode }) {
  return (
    <div role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
      {children}
    </div>
  );
}
