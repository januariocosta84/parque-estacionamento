import { formatDiliDate } from '@estacionamento/shared';

/** Today's Dili date as YYYY-MM-DD (for date inputs and the API). */
export function diliToday(now = new Date()): string {
  const [dd, mm, yyyy] = formatDiliDate(now).split('/');
  return `${yyyy}-${mm}-${dd}`;
}

/** Whole minutes between two instants. */
export function minutesBetween(from: string | Date, to: Date = new Date()): number {
  return Math.max(0, Math.floor((to.getTime() - new Date(from).getTime()) / 60_000));
}
