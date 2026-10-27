import type { Role } from '@taskboard/shared';

const STYLES: Record<Role, string> = {
  owner: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
  member: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  viewer: 'bg-slate-100 text-slate-600 ring-slate-200',
};

const LABELS: Record<Role, string> = { owner: 'Owner', member: 'Member', viewer: 'Viewer' };

export function RoleBadge({ role }: { role: Role }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${STYLES[role]}`}
    >
      {LABELS[role]}
    </span>
  );
}
