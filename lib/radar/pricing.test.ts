import { describe, expect, it } from 'vitest';
import {
  APIFY_FREE_PRICING,
  estimateSearchCost,
  currentCycleStart,
  budgetVerdict,
} from '@/lib/radar/pricing';

describe('APIFY_FREE_PRICING', () => {
  it('usa os preços por evento do plano FREE do actor kaix/google-maps-places-scraper', () => {
    expect(APIFY_FREE_PRICING).toEqual({
      actorStart: 0.00005,
      placeScraped: 0.00008,
    });
  });
});

describe('estimateSearchCost', () => {
  it('cobra início de execução mais um place-scraped por lugar', () => {
    // 0.00005 + 20 * 0.00008 = 0.00165
    expect(estimateSearchCost({ places: 20 })).toBeCloseTo(0.00165, 5);
  });

  it('não cobra nada além do start quando não há lugares', () => {
    expect(estimateSearchCost({ places: 0 })).toBeCloseTo(0.00005, 5);
  });

  it('trata número negativo como zero em vez de gerar crédito', () => {
    expect(estimateSearchCost({ places: -5 })).toBeCloseTo(0.00005, 5);
  });
});

describe('currentCycleStart', () => {
  it('no dia 16 ou depois, o ciclo começa no dia 16 do mês corrente', () => {
    expect(currentCycleStart(new Date('2026-08-31T12:00:00Z')).toISOString())
      .toBe('2026-08-16T00:00:00.000Z');
    expect(currentCycleStart(new Date('2026-08-16T00:00:00Z')).toISOString())
      .toBe('2026-08-16T00:00:00.000Z');
  });

  it('antes do dia 16, o ciclo começa no dia 16 do mês anterior', () => {
    expect(currentCycleStart(new Date('2026-08-15T23:59:59Z')).toISOString())
      .toBe('2026-07-16T00:00:00.000Z');
    expect(currentCycleStart(new Date('2026-09-01T00:00:00Z')).toISOString())
      .toBe('2026-08-16T00:00:00.000Z');
  });

  it('vira o ano corretamente em janeiro', () => {
    expect(currentCycleStart(new Date('2027-01-05T00:00:00Z')).toISOString())
      .toBe('2026-12-16T00:00:00.000Z');
  });
});

describe('budgetVerdict', () => {
  it('libera quando o gasto projetado fica abaixo de 80% do teto', () => {
    const v = budgetVerdict({ spentUsd: 1.0, estimateUsd: 0.5, budgetUsd: 5 });
    expect(v).toMatchObject({ allowed: true, level: 'ok' });
    expect(v.projectedUsd).toBeCloseTo(1.5, 5);
    expect(v.remainingUsd).toBeCloseTo(4.0, 5);
  });

  it('avisa quando o projetado alcança 80% do teto, mas ainda libera', () => {
    const v = budgetVerdict({ spentUsd: 3.5, estimateUsd: 0.5, budgetUsd: 5 });
    expect(v).toMatchObject({ allowed: true, level: 'warn' });
  });

  it('bloqueia quando o projetado alcança o teto', () => {
    const v = budgetVerdict({ spentUsd: 4.8, estimateUsd: 0.3, budgetUsd: 5 });
    expect(v).toMatchObject({ allowed: false, level: 'blocked' });
  });

  it('bloqueia quando o teto já foi estourado, mesmo com estimativa zero', () => {
    const v = budgetVerdict({ spentUsd: 5.2, estimateUsd: 0, budgetUsd: 5 });
    expect(v).toMatchObject({ allowed: false, level: 'blocked' });
    expect(v.remainingUsd).toBe(0);
  });
});
