/**
 * @fileoverview Hooks TanStack Query do Radar de Clientes.
 *
 * ⚠️ REGRA DE CUSTO: a busca é `useMutation`, JAMAIS `useQuery`. Uma query com
 * key derivada do formulário dispararia a cada tecla digitada e queimaria o
 * teto do mês em minutos. Só o clique roda a busca.
 *
 * @module lib/query/hooks/useRadarQuery
 */

'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SearchResponse } from '@/app/api/radar/search/route';
import type { RadarReview, ScoreBreakdownItem } from '@/lib/radar/types';

export const RADAR_BUDGET_KEY = ['radar', 'budget'] as const;

export interface BudgetSnapshot {
  spentUsd: number;
  budgetUsd: number;
  remainingUsd: number;
  level: 'ok' | 'warn' | 'blocked';
  cycleStart: string;
}

export interface RadarSearchVars {
  nicho: string;
  cidade: string;
  uf: string;
  maxResults: number;
  withContacts?: boolean;
  refresh?: boolean;
}

/** Lê a mensagem de erro do servidor, caindo no status quando o corpo não é JSON. */
async function readError(res: Response): Promise<never> {
  const body = await res.json().catch(() => null);
  const message = (body as { error?: string } | null)?.error ?? `Falha na requisição (${res.status})`;
  throw new Error(message);
}

/** Quanto já foi gasto no ciclo vigente. */
export const useRadarBudget = () =>
  useQuery<BudgetSnapshot>({
    queryKey: RADAR_BUDGET_KEY,
    queryFn: async () => {
      const res = await fetch('/api/radar/budget');
      if (!res.ok) await readError(res);
      return res.json();
    },
    staleTime: 60_000,
  });

/** A busca. Só roda quando o componente chama `mutate`/`mutateAsync`. */
export const useRadarSearch = () => {
  const queryClient = useQueryClient();

  return useMutation<SearchResponse, Error, RadarSearchVars>({
    mutationFn: async (vars) => {
      const res = await fetch('/api/radar/search', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(vars),
      });
      if (!res.ok) await readError(res);
      return res.json();
    },
    onSuccess: (data) => {
      // Busca ao vivo gastou dinheiro: o painel de orçamento precisa recarregar.
      if (data.origin === 'live') {
        queryClient.invalidateQueries({ queryKey: RADAR_BUDGET_KEY });
      }
    },
  });
};

/** Avaliações sob demanda de uma empresa. Também é mutation: custa por avaliação. */
export const useRadarReviews = () => {
  const queryClient = useQueryClient();

  return useMutation<
    { reviews: RadarReview[]; costUsd: number; score: number; breakdown: ScoreBreakdownItem[] },
    Error,
    { resultId: string; maxReviews: number }
  >({
    mutationFn: async (vars) => {
      const res = await fetch('/api/radar/reviews', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(vars),
      });
      if (!res.ok) await readError(res);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: RADAR_BUDGET_KEY });
    },
  });
};
