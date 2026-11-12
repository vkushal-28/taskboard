// <input type="date"> works in local dates. Noon keeps the day the same in every time zone
// within ±11 hours, so "due on the 14th" doesn't become the 13th for a teammate abroad.
export function dateInputToIso(value: string): string {
  return new Date(`${value}T12:00:00`).toISOString();
}

/** The other direction: an ISO date as the `YYYY-MM-DD` a date input expects, in local time. */
export function isoToDateInput(iso: string): string {
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
