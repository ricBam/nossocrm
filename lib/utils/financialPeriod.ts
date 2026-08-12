import type { DateRangeISO } from '@/lib/utils/periodToDateRange';

export function previousPeriodRange({ start, end }: DateRangeISO): DateRangeISO {
  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();
  const duration = endMs - startMs;
  return {
    start: new Date(startMs - duration).toISOString(),
    end: start,
  };
}

export function calculatePercentChange(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
}
