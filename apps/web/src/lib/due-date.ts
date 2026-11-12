import { DAY_MS } from '@taskboard/shared';

export type DueStatus = 'overdue' | 'today' | 'soon' | 'later';

/** Within this many days a due date counts as "soon" (warning). */
export const DUE_SOON_DAYS = 3;

const startOfLocalDay = (time: number) => new Date(time).setHours(0, 0, 0, 0);

/** Whole calendar days from today to the due date: 0 today, 1 tomorrow, -1 yesterday. */
export function daysUntil(dueIso: string, now: number): number {
  // Rounding absorbs the 23- or 25-hour days around daylight-saving changes.
  return Math.round((startOfLocalDay(Date.parse(dueIso)) - startOfLocalDay(now)) / DAY_MS);
}

export function dueStatus(dueIso: string, now: number): DueStatus {
  const days = daysUntil(dueIso, now);
  if (days < 0) return 'overdue';
  if (days === 0) return 'today';
  if (days <= DUE_SOON_DAYS) return 'soon';
  return 'later';
}

/** Badge colours: danger once it's due, warning within three days, success otherwise. */
export const DUE_BADGE_CLASSES: Record<DueStatus, string> = {
  overdue: 'bg-red-50 text-red-700 ring-red-200',
  today: 'bg-red-50 text-red-700 ring-red-200',
  soon: 'bg-amber-50 text-amber-800 ring-amber-200',
  later: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
};

/** Extra words next to the date; `null` when the date says enough on its own. */
export const DUE_STATUS_TEXT: Record<DueStatus, string | null> = {
  overdue: 'Overdue',
  today: 'Due today',
  soon: null,
  later: null,
};
