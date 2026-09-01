/**
 * @fileoverview Avaliações de UMA empresa, sob demanda.
 *
 * Custa por avaliação, então: nunca roda junto com a busca, nunca roda duas
 * vezes para a mesma empresa, e o actor filtra pelos termos do âncora na origem.
 *
 * @module app/api/radar/reviews/route
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { runReviewsScrape, ApifyConfigError } from '@/lib/radar/apify';
import { computeScore } from '@/lib/radar/score';
import { rankReviewsByAnchor } from '@/lib/radar/anchors';
import {
  estimateReviewsCost,
  budgetVerdict,
  currentCycleStart,
  monthlyBudgetUsd,
} from '@/lib/radar/pricing';
import type { RadarPlace, RadarReview } from '@/lib/radar/types';

export const maxDuration = 300;

/** Teto duro de avaliações por empresa. Cada uma é cobrada. */
const MAX_REVIEWS_HARD_CAP = 20;

const BodySchema = z.object({
  resultId: z.string().uuid(),
  placeId: z.string().trim().min(1),
  maxReviews: z.number().int().min(1).max(MAX_REVIEWS_HARD_CAP),
});

export async function POST(req: Request) {
  try {
    const supabase = await createClient();

    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });

    const parsed = BodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Parâmetros inválidos.' },
        { status: 400 }
      );
    }
    const { resultId, placeId, maxReviews } = parsed.data;

    const { data: profile } = await supabase
      .from('profiles').select('organization_id').eq('id', auth.user.id).maybeSingle();
    const organizationId = (profile as { organization_id?: string } | null)?.organization_id;
    if (!organizationId) {
      return NextResponse.json({ error: 'Organização não identificada.' }, { status: 403 });
    }

    const { data: row } = await supabase
      .from('radar_results')
      .select('id, payload, reviews')
      .eq('id', resultId)
      .eq('organization_id', organizationId)
      .maybeSingle();

    if (!row) return NextResponse.json({ error: 'Empresa não encontrada.' }, { status: 404 });

    const place = (row as { payload: RadarPlace }).payload;
    const cached = (row as { reviews: RadarReview[] | null }).reviews;

    // Já lidas antes: devolve do banco, sem gastar.
    if (cached && cached.length > 0) {
      const s = computeScore(place, { reviews: cached });
      return NextResponse.json({
        reviews: rankReviewsByAnchor(cached),
        costUsd: 0,
        score: s.score,
        breakdown: s.breakdown,
      });
    }

    // Teto antes de gastar.
    const { data: spentRows } = await supabase
      .from('radar_searches')
      .select('cost_usd')
      .eq('organization_id', organizationId)
      .gte('created_at', currentCycleStart(new Date()).toISOString());
    const spentUsd = ((spentRows ?? []) as { cost_usd: number | string }[])
      .reduce((acc, r) => acc + Number(r.cost_usd ?? 0), 0);

    const verdict = budgetVerdict({
      spentUsd,
      estimateUsd: estimateReviewsCost({ places: 1, reviewsPerPlace: maxReviews }),
      budgetUsd: monthlyBudgetUsd(),
    });
    if (!verdict.allowed) {
      return NextResponse.json(
        { error: `Teto mensal de US$ ${verdict.budgetUsd.toFixed(2)} atingido.`, budget: verdict },
        { status: 402 }
      );
    }

    const run = await runReviewsScrape({ placeId, maxReviews });
    const ranked = rankReviewsByAnchor(run.reviews);
    const s = computeScore(place, { reviews: ranked });

    // O gasto entra no acumulado do ciclo como uma "busca" de origem live.
    // Marcada como parcial quando o run não chegou a SUCCEEDED — o dinheiro saiu
    // e precisa contar, mas a linha não representa uma coleta completa.
    await supabase.from('radar_searches').insert({
      organization_id: organizationId,
      nicho: `avaliações: ${place.title}`,
      cidade: place.city ?? '-',
      uf: '--',
      params: { kind: 'reviews', placeId, maxReviews },
      apify_run_id: run.runId,
      cost_usd: run.costUsd,
      origin: 'live',
      partial: !run.finished,
      places_count: 1,
      created_by: auth.user.id,
    });

    // Só persistimos as avaliações quando o run terminou. Um resultado parcial
    // gravado aqui viraria cache permanente: a checagem lá em cima devolve o que
    // estiver em `reviews` sem nunca reconsultar o Apify, então uma coleta pela
    // metade ficaria congelada para sempre. Devolvemos o parcial para leitura,
    // sem gravar, e a próxima tentativa busca de novo.
    if (run.finished) {
      await supabase
        .from('radar_results')
        .update({
          reviews: ranked,
          reviews_fetched_at: new Date().toISOString(),
          score: s.score,
          score_breakdown: s.breakdown,
          disqualified: s.disqualified,
          disqualify_reasons: s.disqualifyReasons,
        })
        .eq('id', resultId)
        .eq('organization_id', organizationId);
    }

    return NextResponse.json({
      reviews: ranked,
      costUsd: run.costUsd,
      score: s.score,
      breakdown: s.breakdown,
      // false quando o run não terminou: a lista pode estar incompleta e NÃO foi
      // gravada, então uma nova tentativa vai buscar de novo.
      persisted: run.finished,
    });
  } catch (err) {
    if (err instanceof ApifyConfigError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erro ao buscar avaliações.' },
      { status: 500 }
    );
  }
}
