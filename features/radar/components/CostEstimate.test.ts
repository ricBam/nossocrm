import { describe, expect, it } from 'vitest';
import { isSearchAllowed } from './CostEstimate';
import { budgetVerdict, estimateSearchCost } from '@/lib/radar/pricing';
import type { BudgetSnapshot } from '@/lib/query/hooks/useRadarQuery';

function budget(overrides: Partial<BudgetSnapshot> = {}): BudgetSnapshot {
  return {
    spentUsd: 0,
    budgetUsd: 5,
    remainingUsd: 5,
    level: 'ok',
    cycleStart: '2026-08-16T00:00:00.000Z',
    ...overrides,
  };
}

describe('isSearchAllowed', () => {
  it('libera quando o orçamento ainda não carregou (undefined) — comportamento otimista', () => {
    expect(isSearchAllowed(50, false, undefined)).toBe(true);
  });

  it('libera quando a projeção fica abaixo de 80% do teto', () => {
    // estimate(50, false) = 0.00005 + 50*0.004 = 0.20005; projetado = 1.20005 (24% de 5)
    expect(isSearchAllowed(50, false, budget({ spentUsd: 1.0, budgetUsd: 5 }))).toBe(true);
  });

  it('bloqueia quando a projeção alcança ou ultrapassa o teto', () => {
    // estimate(50, false) = 0.20005; spent 4.8 -> projetado 5.00005 >= 5
    expect(isSearchAllowed(50, false, budget({ spentUsd: 4.8, budgetUsd: 5 }))).toBe(false);
  });

  it('ainda libera quando a projeção alcança ou ultrapassa 80% mas fica abaixo do teto (warn não bloqueia)', () => {
    // estimate(50, false) = 0.20005; spent 3.8 -> projetado 4.00005 (>=80% de 5, <5)
    expect(isSearchAllowed(50, false, budget({ spentUsd: 3.8, budgetUsd: 5 }))).toBe(true);
  });

  it('concorda com budgetVerdict nos limites exatos de 80% e 100% do teto', () => {
    const estimate = estimateSearchCost({ places: 50, withContacts: false });
    const budgetUsd = 5;

    // Exatamente 80%: spent tal que spent + estimate === 0.8 * budgetUsd
    const spentAt80 = 0.8 * budgetUsd - estimate;
    const budget80 = budget({ spentUsd: spentAt80, budgetUsd });
    const verdict80 = budgetVerdict({ spentUsd: spentAt80, estimateUsd: estimate, budgetUsd });
    expect(verdict80.level).toBe('warn');
    expect(isSearchAllowed(50, false, budget80)).toBe(verdict80.allowed);
    expect(isSearchAllowed(50, false, budget80)).toBe(true);

    // Exatamente 100%: spent tal que spent + estimate === budgetUsd
    const spentAt100 = budgetUsd - estimate;
    const budget100 = budget({ spentUsd: spentAt100, budgetUsd });
    const verdict100 = budgetVerdict({ spentUsd: spentAt100, estimateUsd: estimate, budgetUsd });
    expect(verdict100.level).toBe('blocked');
    expect(isSearchAllowed(50, false, budget100)).toBe(verdict100.allowed);
    expect(isSearchAllowed(50, false, budget100)).toBe(false);
  });
});
