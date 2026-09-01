/**
 * @fileoverview Preço, estimativa e teto de gasto do Radar de Clientes.
 *
 * Módulo puro: sem I/O, sem rede, sem banco. Os preços por evento do Apify
 * variam por plano de assinatura — por isso ficam numa constante só, para
 * conferir contra o console e ajustar num lugar único.
 *
 * @module lib/radar/pricing
 */

export interface ApifyPricing {
  /** Cobrado uma vez por execução do actor. */
  actorStart: number;
  /** Cada lugar retornado pela busca (kaix/google-maps-places-scraper). */
  placeScraped: number;
}

/**
 * Preços por evento no plano FREE do Apify, para o actor kaix/google-maps-places-scraper.
 *
 * ⚠️ Conferir contra o console antes da primeira rodada real: a vitrine pública
 * do actor anuncia valores de planos pagos, que são diferentes destes. Além do
 * preço por evento listado aqui, o Apify cobra uma taxa de uso de plataforma
 * variável por cima (compute/retries) — não modelada nesta estimativa. O teto
 * de gasto continua seguro porque `budgetVerdict` decide contra o GASTO REAL
 * acumulado no ciclo, não contra esta estimativa (ver `spentThisCycle`).
 */
export const APIFY_FREE_PRICING: ApifyPricing = {
  actorStart: 0.00005,
  placeScraped: 0.00008,
};

/** Teto padrão em USD quando `RADAR_MONTHLY_BUDGET_USD` não está definido. */
export const DEFAULT_MONTHLY_BUDGET_USD = 5.0;

function atLeastZero(n: number): number {
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Custo estimado de uma busca de descoberta.
 *
 * @param input.places - Quantos lugares a busca deve retornar.
 * @returns Custo em USD.
 */
export function estimateSearchCost(
  input: { places: number },
  pricing: ApifyPricing = APIFY_FREE_PRICING
): number {
  const places = atLeastZero(input.places);
  return pricing.actorStart + places * pricing.placeScraped;
}

/**
 * Início do ciclo de faturamento vigente. O ciclo do Apify vai do dia 16 ao 15.
 *
 * @param now - Momento de referência.
 * @returns Data UTC do dia 16 que abre o ciclo corrente.
 */
export function currentCycleStart(now: Date): Date {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const day = now.getUTCDate();
  // Antes do dia 16, ainda estamos no ciclo aberto no mês anterior.
  const startMonth = day >= 16 ? month : month - 1;
  return new Date(Date.UTC(year, startMonth, 16, 0, 0, 0, 0));
}

export type BudgetLevel = 'ok' | 'warn' | 'blocked';

export interface BudgetVerdict {
  allowed: boolean;
  level: BudgetLevel;
  spentUsd: number;
  estimateUsd: number;
  projectedUsd: number;
  remainingUsd: number;
  budgetUsd: number;
}

/** Fração do teto a partir da qual a tela avisa. */
export const BUDGET_WARN_RATIO = 0.8;

/**
 * Decide se a busca pode rodar, dado o já gasto no ciclo e a estimativa.
 *
 * Em 80% do teto avisa; em 100% bloqueia.
 */
export function budgetVerdict(input: {
  spentUsd: number;
  estimateUsd: number;
  budgetUsd: number;
}): BudgetVerdict {
  const spentUsd = atLeastZero(input.spentUsd);
  const estimateUsd = atLeastZero(input.estimateUsd);
  const budgetUsd = atLeastZero(input.budgetUsd);
  const projectedUsd = spentUsd + estimateUsd;
  const remainingUsd = Math.max(0, budgetUsd - spentUsd);

  const level: BudgetLevel =
    projectedUsd >= budgetUsd
      ? 'blocked'
      : projectedUsd >= budgetUsd * BUDGET_WARN_RATIO
        ? 'warn'
        : 'ok';

  return {
    allowed: level !== 'blocked',
    level,
    spentUsd,
    estimateUsd,
    projectedUsd,
    remainingUsd,
    budgetUsd,
  };
}

/** Lê o teto do ambiente, caindo no padrão quando ausente ou inválido. */
export function monthlyBudgetUsd(): number {
  const raw = Number(process.env.RADAR_MONTHLY_BUDGET_USD);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_MONTHLY_BUDGET_USD;
}
