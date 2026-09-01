'use client';

import { cn } from '@/lib/utils';
import { budgetVerdict, estimateSearchCost } from '@/lib/radar/pricing';
import type { BudgetSnapshot } from '@/lib/query/hooks/useRadarQuery';

const usd = (n: number) => `US$ ${n.toFixed(4)}`;

/**
 * Estimativa ANTES de rodar, e quanto resta do teto. O botão Buscar depende
 * do `allowed` calculado aqui.
 *
 * O nível exibido (ok/warn/blocked) vem sempre de `budgetVerdict()` —
 * a mesma função pura que `GET /api/radar/budget` usa para calcular
 * `level`. Nunca reimplementar os limiares aqui: se `BUDGET_WARN_RATIO`
 * mudar, um cálculo local ficaria divergente do servidor sem ninguém notar.
 */
export function CostEstimate({
    maxResults,
    withContacts,
    budget,
    isBudgetLoading,
    isBudgetError,
}: {
    maxResults: number;
    withContacts: boolean;
    budget: BudgetSnapshot | undefined;
    isBudgetLoading: boolean;
    isBudgetError: boolean;
}) {
    const estimate = estimateSearchCost({ places: maxResults, withContacts });

    if (isBudgetLoading) {
        return (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-700 dark:bg-slate-900/40">
                <p className="text-slate-500 dark:text-slate-400">Carregando orçamento do ciclo…</p>
            </div>
        );
    }

    if (isBudgetError || !budget) {
        return (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950/40">
                <p className="text-amber-800 dark:text-amber-300">
                    Não foi possível carregar o orçamento do ciclo. A busca continua protegida: o
                    servidor recusa qualquer busca que estoure o teto antes de gastar um centavo.
                </p>
            </div>
        );
    }

    const verdict = budgetVerdict({ spentUsd: budget.spentUsd, estimateUsd: estimate, budgetUsd: budget.budgetUsd });

    return (
        <div
            className={cn(
                'rounded-lg border p-3 text-sm',
                verdict.level === 'blocked' && 'border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/40',
                verdict.level === 'warn' && 'border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40',
                verdict.level === 'ok' && 'border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/40'
            )}
        >
            <div className="flex items-baseline justify-between">
                <span className="text-slate-600 dark:text-slate-300">Custo estimado desta busca</span>
                <span className="font-semibold tabular-nums">{usd(estimate)}</span>
            </div>
            <div className="mt-1 flex items-baseline justify-between text-xs text-slate-500 dark:text-slate-400">
                <span>Gasto no ciclo</span>
                <span className="tabular-nums">
                    {usd(verdict.spentUsd)} de {usd(verdict.budgetUsd)}
                </span>
            </div>
            {verdict.level === 'warn' && (
                <p className="mt-2 text-xs text-amber-800 dark:text-amber-300">
                    Esta busca passa de 80% do teto do mês.
                </p>
            )}
            {verdict.level === 'blocked' && (
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
    // Orçamento indisponível (ainda carregando OU falhou — useQuery devolve
    // `undefined` nos dois casos) libera o clique de forma otimista: o
    // servidor confere o teto ANTES de gastar qualquer coisa (guard order
    // auth → validação → teto → cache → Apify, ver
    // app/api/radar/search/route.ts) e devolve 402 com mensagem legível se
    // estourar. Desabilitar aqui bricaria a tela inteira por causa de uma
    // falha transitória numa rota que não protege nada que o servidor já
    // não proteja.
    if (!budget) return true;
    const estimate = estimateSearchCost({ places: maxResults, withContacts });
    return budgetVerdict({ spentUsd: budget.spentUsd, estimateUsd: estimate, budgetUsd: budget.budgetUsd }).allowed;
}
