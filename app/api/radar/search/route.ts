/**
 * @fileoverview Busca do Radar de Clientes.
 *
 * Ordem deliberada: auth → validação → teto → cache → Apify. O Apify é a
 * última coisa a ser tocada, porque é a única que custa dinheiro.
 *
 * @module app/api/radar/search/route
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { runPlacesSearch, ApifyConfigError } from '@/lib/radar/apify';
import { computeScore } from '@/lib/radar/score';
import { buildDedupeIndex, checkDuplicate, type DuplicateReason } from '@/lib/radar/dedupe';
import {
  estimateSearchCost,
  budgetVerdict,
  currentCycleStart,
  monthlyBudgetUsd,
  type BudgetVerdict,
} from '@/lib/radar/pricing';
import type { RadarPlace, ScoreBreakdownItem } from '@/lib/radar/types';

export const maxDuration = 300;

/** Teto duro de resultados por busca. Blindagem contra estouro de custo. */
const MAX_RESULTS_HARD_CAP = 60;
const CACHE_TTL_DAYS = 30;

const BodySchema = z.object({
  nicho: z.string().trim().min(1, 'Nicho é obrigatório'),
  cidade: z.string().trim().min(1, 'Cidade é obrigatória'),
  uf: z.string().trim().length(2, 'UF deve ter 2 letras'),
  maxResults: z.number().int().min(1).max(MAX_RESULTS_HARD_CAP),
  withContacts: z.boolean().optional().default(false),
  /** Força ignorar o cache. Só o usuário pede isso, explicitamente. */
  refresh: z.boolean().optional().default(false),
});

export interface RadarResultDTO {
  id: string;
  place: RadarPlace;
  score: number;
  breakdown: ScoreBreakdownItem[];
  disqualified: boolean;
  disqualifyReasons: string[];
  duplicate: { isDuplicate: boolean; reasons: DuplicateReason[] };
  savedDealId: string | null;
}

export interface SearchResponse {
  searchId: string;
  origin: 'live' | 'cache';
  costUsd: number;
  cachedAt: string | null;
  budget: BudgetVerdict;
  results: RadarResultDTO[];
}

async function resolveOrg(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data } = await supabase
    .from('profiles')
    .select('organization_id, role')
    .eq('id', userId)
    .maybeSingle();
  return {
    organizationId: (data as { organization_id?: string } | null)?.organization_id ?? null,
    role: (data as { role?: string } | null)?.role ?? null,
  };
}

/** Soma o custo real já gasto no ciclo vigente. */
async function spentThisCycle(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string
): Promise<number> {
  const { data } = await supabase
    .from('radar_searches')
    .select('cost_usd')
    .eq('organization_id', organizationId)
    .gte('created_at', currentCycleStart(new Date()).toISOString());
  const rows = (data ?? []) as { cost_usd: number | string }[];
  return rows.reduce((acc, r) => acc + Number(r.cost_usd ?? 0), 0);
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();

    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
    }

    const parsed = BodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Parâmetros inválidos.' },
        { status: 400 }
      );
    }
    const body = parsed.data;

    const { organizationId } = await resolveOrg(supabase, auth.user.id);
    if (!organizationId) {
      return NextResponse.json({ error: 'Organização não identificada.' }, { status: 403 });
    }

    const nicho = body.nicho.toLowerCase();
    const cidade = body.cidade;
    const uf = body.uf.toUpperCase();

    // --- Teto de gasto: decidido ANTES de qualquer chamada paga ---------------
    const spentUsd = await spentThisCycle(supabase, organizationId);
    const estimateUsd = estimateSearchCost({ places: body.maxResults, withContacts: body.withContacts });
    const budget = budgetVerdict({ spentUsd, estimateUsd, budgetUsd: monthlyBudgetUsd() });

    // --- Cache de 30 dias: não gasta nada -------------------------------------
    if (!body.refresh) {
      const cutoff = new Date(Date.now() - CACHE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
      const { data: cached } = await supabase
        .from('radar_searches')
        .select('id, created_at')
        .eq('organization_id', organizationId)
        .eq('nicho', nicho)
        .eq('cidade', cidade)
        .eq('uf', uf)
        .gte('created_at', cutoff)
        .order('created_at', { ascending: false })
        .limit(1);

      const hit = (cached ?? [])[0] as { id: string; created_at: string } | undefined;
      if (hit) {
        const { data: rows } = await supabase
          .from('radar_results')
          .select('id, place_id, payload, score, score_breakdown, disqualified, disqualify_reasons, saved_deal_id')
          .eq('search_id', hit.id);

        const results: RadarResultDTO[] = ((rows ?? []) as unknown as Record<string, never>[]).map(r => ({
          id: r.id as unknown as string,
          place: r.payload as unknown as RadarPlace,
          score: Number(r.score ?? 0),
          breakdown: (r.score_breakdown ?? []) as unknown as ScoreBreakdownItem[],
          disqualified: Boolean(r.disqualified),
          disqualifyReasons: (r.disqualify_reasons ?? []) as unknown as string[],
          duplicate: { isDuplicate: false, reasons: [] },
          savedDealId: (r.saved_deal_id ?? null) as unknown as string | null,
        }));

        return NextResponse.json<SearchResponse>({
          searchId: hit.id,
          origin: 'cache',
          costUsd: 0,
          cachedAt: hit.created_at,
          budget,
          results,
        });
      }
    }

    // --- Só aqui gastamos dinheiro -------------------------------------------
    if (!budget.allowed) {
      return NextResponse.json(
        { error: `Teto mensal de US$ ${budget.budgetUsd.toFixed(2)} atingido. Já gastos: US$ ${budget.spentUsd.toFixed(4)}.`, budget },
        { status: 402 }
      );
    }

    const run = await runPlacesSearch({
      nicho: body.nicho,
      cidade,
      uf,
      maxResults: body.maxResults,
      withContacts: body.withContacts,
    });

    // --- Índice de dedupe: place_ids já vistos + telefones dos contatos --------
    const [{ data: seen }, { data: contacts }] = await Promise.all([
      supabase.from('radar_results').select('place_id').eq('organization_id', organizationId),
      supabase.from('contacts').select('phone').eq('organization_id', organizationId).is('deleted_at', null),
    ]);
    const index = buildDedupeIndex({
      knownPlaceIds: ((seen ?? []) as { place_id: string }[]).map(r => r.place_id),
      knownPhones: ((contacts ?? []) as { phone: string | null }[]).map(r => r.phone),
    });

    // --- Persiste a busca com o custo REAL do run -----------------------------
    const { data: inserted, error: insertError } = await supabase
      .from('radar_searches')
      .insert({
        organization_id: organizationId,
        nicho,
        cidade,
        uf,
        params: body,
        apify_run_id: run.runId,
        cost_usd: run.costUsd,
        origin: 'live',
        places_count: run.places.length,
        created_by: auth.user.id,
      })
      .select('id')
      .single();

    if (insertError || !inserted) {
      return NextResponse.json({ error: 'Falha ao gravar a busca.' }, { status: 500 });
    }
    const searchId = (inserted as { id: string }).id;

    const scored = run.places.map(place => {
      const s = computeScore(place); // sem avaliações: o +3 fica pendente
      const duplicate = checkDuplicate({ placeId: place.placeId, phone: place.phone }, index);
      return { place, s, duplicate };
    });

    if (scored.length > 0) {
      await supabase.from('radar_results').upsert(
        scored.map(({ place, s }) => ({
          organization_id: organizationId,
          search_id: searchId,
          place_id: place.placeId,
          payload: place,
          score: s.score,
          score_breakdown: s.breakdown,
          disqualified: s.disqualified,
          disqualify_reasons: s.disqualifyReasons,
          collected_at: place.collectedAt,
        })),
        { onConflict: 'organization_id,place_id' }
      );
    }

    const { data: savedRows } = await supabase
      .from('radar_results')
      .select('id, place_id, saved_deal_id')
      .eq('search_id', searchId);
    const byPlace = new Map(
      ((savedRows ?? []) as { id: string; place_id: string; saved_deal_id: string | null }[])
        .map(r => [r.place_id, r])
    );

    return NextResponse.json<SearchResponse>({
      searchId,
      origin: 'live',
      costUsd: run.costUsd,
      cachedAt: null,
      budget: budgetVerdict({ spentUsd: spentUsd + run.costUsd, estimateUsd: 0, budgetUsd: monthlyBudgetUsd() }),
      results: scored.map(({ place, s, duplicate }) => ({
        id: byPlace.get(place.placeId)?.id ?? place.placeId,
        place,
        score: s.score,
        breakdown: s.breakdown,
        disqualified: s.disqualified,
        disqualifyReasons: s.disqualifyReasons,
        duplicate,
        savedDealId: byPlace.get(place.placeId)?.saved_deal_id ?? null,
      })),
    });
  } catch (err) {
    if (err instanceof ApifyConfigError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erro inesperado no Radar.' },
      { status: 500 }
    );
  }
}
