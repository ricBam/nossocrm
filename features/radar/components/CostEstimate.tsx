'use client';

import { cn } from '@/lib/utils';
import { estimateSearchCost } from '@/lib/radar/pricing';
import type { BudgetSnapshot } from '@/lib/query/hooks/useRadarQuery';

const usd = (n: number) => `US$ ${n.toFixed(4)}`;

/**
 * Estimativa ANTES de rodar, e quanto resta do teto. O botão Buscar depende
 * do `allowed` calculado aqui.
 */
export function CostEstimate({
    maxResults,
    withContacts,
    budget,
}: {
    maxResults: number;
    withContacts: boolean;
    budget: BudgetSnapshot | undefined;
}) {
    const estimate = estimateSearchCost({ places: maxResults, withContacts });
    const spent = budget?.spentUsd ?? 0;
    const teto = budget?.budgetUsd ?? 0;
    const projetado = spent + estimate;
    const nivel = !budget
        ? 'ok'
        : projetado >= teto
          ? 'blocked'
          : projetado >= teto * 0.8
            ? 'warn'
            : 'ok';

    return (
        <div
            className={cn(
                'rounded-lg border p-3 text-sm',
                nivel === 'blocked' && 'border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/40',
                nivel === 'warn' && 'border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40',
                nivel === 'ok' && 'border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/40'
            )}
        >
            <div className="flex items-baseline justify-between">
                <span className="text-slate-600 dark:text-slate-300">Custo estimado desta busca</span>
                <span className="font-semibold tabular-nums">{usd(estimate)}</span>
            </div>
            <div className="mt-1 flex items-baseline justify-between text-xs text-slate-500 dark:text-slate-400">
                <span>Gasto no ciclo</span>
                <span className="tabular-nums">
                    {usd(spent)} de {usd(teto)}
                </span>
            </div>
            {nivel === 'warn' && (
                <p className="mt-2 text-xs text-amber-800 dark:text-amber-300">
                    Esta busca passa de 80% do teto do mês.
                </p>
            )}
            {nivel === 'blocked' && (
                <p className="mt-2 text-xs text-red-800 dark:text-red-300">
                    Teto do mês atingido. A busca está bloqueada até o próximo ciclo.
                </p>
            )}
        </div>
    );
}

/** Exportada para o formulário decidir se habilita o botão. */
export function isSearchAllowed(
    maxResults: number,
    withContacts: boolean,
    budget: BudgetSnapshot | undefined
): boolean {
    if (!budget) return false;
    const estimate = estimateSearchCost({ places: maxResults, withContacts });
    return budget.spentUsd + estimate < budget.budgetUsd;
}
