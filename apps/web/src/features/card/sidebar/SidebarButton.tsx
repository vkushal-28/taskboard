import type { ReactNode } from 'react';

export function SidebarButton({
  children,
  onClick,
  expanded,
}: {
  children: ReactNode;
  onClick: () => void;
  expanded?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={expanded}
      className="block w-full rounded-lg bg-slate-200/70 px-3 py-1.5 text-left text-sm font-medium text-slate-700 hover:bg-slate-300/50 aria-expanded:bg-slate-300/50"
    >
      {children}
    </button>
  );
}

/** The box an expanded "Add to card" option opens into. */
export const panelClass = 'rounded-lg border border-slate-200 bg-white p-3 shadow-sm';
