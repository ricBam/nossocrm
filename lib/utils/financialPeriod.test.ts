import { describe, expect, it } from 'vitest';
import { previousPeriodRange, calculatePercentChange } from '@/lib/utils/financialPeriod';

describe('previousPeriodRange', () => {
  it('desloca o range para trás pela mesma duração, terminando onde o atual começa', () => {
    const current = { start: '2026-02-01T00:00:00.000Z', end: '2026-03-01T00:00:00.000Z' };
    const result = previousPeriodRange(current);
    expect(result.end).toBe(current.start);
    expect(new Date(result.end).getTime() - new Date(result.start).getTime())
      .toBe(new Date(current.end).getTime() - new Date(current.start).getTime());
  });
});

describe('calculatePercentChange', () => {
  it('calcula variação percentual normal', () => {
    expect(calculatePercentChange(150, 100)).toBe(50);
  });

  it('retorna 0 quando atual e anterior são ambos zero', () => {
    expect(calculatePercentChange(0, 0)).toBe(0);
  });

  it('retorna 100 quando o período anterior era zero e o atual é positivo', () => {
    expect(calculatePercentChange(50, 0)).toBe(100);
  });

  it('calcula queda negativa', () => {
    expect(calculatePercentChange(50, 100)).toBe(-50);
  });
});
