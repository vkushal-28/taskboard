import { useState } from 'react';

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
];

const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

/** "just now", "5 minutes ago", "yesterday", "3 weeks ago". Pass `now` from useNow(). */
export function formatRelative(iso: string, now: number): string {
  const seconds = Math.round((Date.parse(iso) - now) / 1000);
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return formatter.format(Math.trunc(seconds / size), unit);
  }
  return 'just now';
}

export function greetingFor(date: Date): string {
  const hour = date.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

/**
 * The time when the component mounted. Render must be pure, so components read the clock once
 * through a lazy initializer instead of calling Date.now() on every render.
 */
export function useNow(): number {
  const [now] = useState(() => Date.now());
  return now;
}
