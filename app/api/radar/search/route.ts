/**
 * @fileoverview Busca do Radar de Clientes.
 *
 * Ordem deliberada: auth → papel → validação → teto → cache → Apify. O Apify é
 * a última coisa a ser tocada, porque é a única que custa dinheiro.
 *
 * @module app/api/radar/search/route
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import type { PostgrestError } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { tryWrite } from '@/lib/radar/supabaseWrite';
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

/**
 * Teto duro de resultados por busca. Blindagem contra estouro de custo.
 * A tela oferece 10..100 de 10 em 10; o schema aceita a partir de 1 para permitir
 * teste barato em desenvolvimento sem passar pela tela.
 */
const MAX_RESULTS_HARD_CAP = 100;
const CACHE_TTL_DAYS = 30;

const BodySchema = z.object({
  nicho: z.string().trim().min(1, 'Nicho é obrigatório'),
  cidade: z.string().trim().min(1, 'Cidade é obrigatória'),
  uf: z.string().trim().length(2, 'UF deve ter 2 letras'),
  maxResults: z.number().int().min(1).max(MAX_RESULTS_HARD_CAP),
  /** Força ignorar o cache. Só o usuário pede isso, explicitamente. */
  refresh: z.boolean().optional().default(false),
});

/** Formato das colunas selecionadas na leitura de `radar_results` (cache-hit). */
interface CachedResultRow {
  id: string;
  place_id: string;
  payload: RadarPlace;
  score: number;
  score_breakdown: ScoreBreakdownItem[];
  disqualified: boolean;
  disqualify_reasons: string[];
  saved_deal_id: string | null;
}

/** Linha já existente de um lugar desta organização, lida antes de regravar. */
interface ExistingResultRow {
  id: string;
  place_id: string;
  search_id: string | null;
  reviews_fetched_at: string | null;
}

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
  /**
   * true quando o run do Apify não chegou a SUCCEEDED e a lista pode estar
   * incompleta. A busca é gravada assim mesmo (o custo saiu), mas marcada
   * como parcial para nunca ser servida do cache.
   */
  partial: boolean;
  budget: BudgetVerdict;
  results: RadarResultDTO[];
}

/**
 * Linha candidata a cache-hit. `params` guarda o corpo da requisição que a
 * gerou — é dali que sai o teto de resultados daquela busca.
 */
interface CacheCandidateRow {
  id: string;
  created_at: string;
  params: { maxResults?: unknown } | null;
  places_count: number | null;
}

/**
 * Decide se uma busca guardada responde a um pedido de `wanted` resultados.
 *
 * A chave do cache é nicho+cidade+uf; `maxResults` fica de fora de propósito
 * (uma busca de 50 também serve quem pede 10). O que NÃO pode acontecer é o
 * inverso: servir uma busca antiga de 10 — que parou por ter batido no próprio
 * teto — para quem agora pede 50. A tela devolveria 10 dizendo "não gastou
 * nada", e o usuário que pediu mais receberia menos, sem aviso.
 *
 * Duas situações servem:
 * - o teto daquela busca já era >= o pedido agora: o conjunto guardado é, no
 *   mínimo, tão completo quanto o pedido;
 * - a busca devolveu MENOS lugares do que o teto dela permitia: a região se
 *   esgotou, e pagar de novo por um teto maior não traria nada de novo.
 *
 * Linha antiga sem `params.maxResults` mantém o comportamento anterior (serve
 * do cache): na dúvida, não gastar. Cache errado custa zero; run errado custa
 * dinheiro.
 */
function cacheAtende(row: CacheCandidateRow, wanted: number): boolean {
  const tetoDaBusca = Number(row.params?.maxResults);
  if (!Number.isFinite(tetoDaBusca)) return true;
  if (tetoDaBusca >= wanted) return true;
  return Number(row.places_count ?? 0) < tetoDaBusca;
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

    const { organizationId, role } = await resolveOrg(supabase, auth.user.id);
    if (!organizationId) {
      return NextResponse.json({ error: 'Organização não identificada.' }, { status: 403 });
    }

    // Gate de papel ANTES do teto e do Apify. As policies de RLS de
    // `radar_searches`/`radar_results` são admin-only: para um membro não-admin
    // a soma do ciclo voltaria vazia (o teto nunca dispararia), o Apify seria
    // cobrado e só então o insert bateria no WITH CHECK — dinheiro fora, nada
    // registrado, repetível em laço. Precedente: `app/api/admin/*` responde 403.
    if (role !== 'admin') {
      return NextResponse.json({ error: 'Apenas administradores usam o Radar.' }, { status: 403 });
    }

    const nicho = body.nicho.toLowerCase();
    const cidade = body.cidade;
    const uf = body.uf.toUpperCase();

    // --- Teto de gasto: decidido ANTES de qualquer chamada paga ---------------
    const spentUsd = await spentThisCycle(supabase, organizationId);
    const estimateUsd = estimateSearchCost({ places: body.maxResults });
    const budget = budgetVerdict({ spentUsd, estimateUsd, budgetUsd: monthlyBudgetUsd() });

    // --- Cache de 30 dias: não gasta nada -------------------------------------
    if (!body.refresh) {
      const cutoff = new Date(Date.now() - CACHE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
      const { data: cached } = await supabase
        .from('radar_searches')
        .select('id, created_at, params, places_count')
        .eq('organization_id', organizationId)
        .eq('nicho', nicho)
        .eq('cidade', cidade)
        .eq('uf', uf)
        // Busca parcial nunca serve de cache: a lista pode estar incompleta.
        .eq('partial', false)
        .gte('created_at', cutoff)
        .order('created_at', { ascending: false })
        // Mais de uma candidata porque a mais recente pode ter sido feita com
        // um teto menor do que o pedido agora; uma anterior, mais generosa,
        // ainda serve e evita um run pago.
        .limit(10);

      const candidatas = (cached ?? []) as unknown as CacheCandidateRow[];
      const hit = candidatas.find(row => cacheAtende(row, body.maxResults));
      if (hit) {
        // A filiação vem de `radar_search_results`, NÃO de
        // `radar_results.search_id`: um lugar encontrado por duas buscas tem uma
        // linha de filiação para cada uma. Ler por `search_id` devolveria só o
        // que ainda estivesse parenteado a esta busca — que é exatamente o bug
        // em que a segunda busca esvaziava o cache da primeira.
        const { data: links } = await supabase
          .from('radar_search_results')
          .select('result_id')
          .eq('search_id', hit.id)
          .eq('organization_id', organizationId);

        const resultIds = ((links ?? []) as { result_id: string }[]).map(l => l.result_id);

        const { data: rows } = resultIds.length > 0
          ? await supabase
            .from('radar_results')
            .select('id, place_id, payload, score, score_breakdown, disqualified, disqualify_reasons, saved_deal_id')
            .in('id', resultIds)
            .eq('organization_id', organizationId)
          : { data: [] as unknown[] };

        const cachedRows = (rows ?? []) as unknown as CachedResultRow[];
        const results: RadarResultDTO[] = cachedRows.map(r => ({
          id: r.id,
          place: r.payload,
          score: Number(r.score ?? 0),
          breakdown: r.score_breakdown ?? [],
          disqualified: Boolean(r.disqualified),
          disqualifyReasons: r.disqualify_reasons ?? [],
          duplicate: { isDuplicate: false, reasons: [] },
          savedDealId: r.saved_deal_id ?? null,
        }));

        return NextResponse.json<SearchResponse>({
          searchId: hit.id,
          origin: 'cache',
          costUsd: 0,
          cachedAt: hit.created_at,
          partial: false,
          budget,
          results,
        });
      }
    }

    // --- Só aqui gastamos dinheiro -------------------------------------------
    // O teto é verificado aqui, DEPOIS do bloco de cache, de propósito: o
    // teto limita GASTO, não LEITURA. Um cache hit nunca chama o Apify e não
    // custa nada, então uma organização acima do teto ainda pode ler
    // resultados já pagos em ciclos anteriores. Não mover esta checagem para
    // antes do cache.
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
    });

    // --- Índice de dedupe + estado atual das linhas desta organização ---------
    // A mesma leitura serve dois propósitos: o índice de dedupe (place_ids já
    // vistos) e saber, para cada lugar que este run devolveu, se a linha já
    // existe, qual busca a descobriu e se ela já foi enriquecida com
    // avaliações. Sem isso a regravação abaixo destruiria o enriquecimento.
    // Escopado aos place_ids deste run: sem isso, `max_rows = 1000` do
    // PostgREST (supabase/config.toml) trunca em silêncio organizações com
    // mais de 1000 linhas em `radar_results`, e um lugar fora da janela
    // truncada perde `search_id`/`reviews_fetched_at` — a re-busca então
    // recalcula o score SEM avaliações por cima de uma linha que já as tem.
    // O run já está limitado a MAX_RESULTS_HARD_CAP, então esta lista nunca
    // pode ultrapassar 1000.
    const placeIdsDoRun = run.places.map(p => p.placeId);
    const [{ data: seen }, { data: contacts }] = await Promise.all([
      placeIdsDoRun.length > 0
        ? supabase
          .from('radar_results')
          .select('id, place_id, search_id, reviews_fetched_at')
          .eq('organization_id', organizationId)
          .in('place_id', placeIdsDoRun)
        : Promise.resolve({ data: [] as ExistingResultRow[], error: null }),
      supabase.from('contacts').select('phone').eq('organization_id', organizationId).is('deleted_at', null),
    ]);
    const seenRows = (seen ?? []) as ExistingResultRow[];
    const existentes = new Map(seenRows.map(r => [r.place_id, r]));
    const index = buildDedupeIndex({
      knownPlaceIds: seenRows.map(r => r.place_id),
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
        partial: !run.finished,
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
      const s = computeScore(place);
      const duplicate = checkDuplicate({ placeId: place.placeId, phone: place.phone }, index);
      return { place, s, duplicate };
    });

    // Se a gravação falhar depois de um run pago, o custo já foi debitado e
    // não há como desfazer: a busca fica marcada `partial` para nunca ser
    // servida do cache (ver comentário no schema de SearchResponse.partial),
    // mas a resposta a ESTA requisição ainda devolve os resultados em
    // memória — um run pago não pode simplesmente sumir da tela do usuário.
    let persistFailed = false;
    const falhas: { message: string; error: PostgrestError }[] = [];
    const salvas: { id: string; place_id: string; saved_deal_id: string | null }[] = [];

    if (scored.length > 0) {
      const placeIds = scored.map(({ place }) => place.placeId);

      // `search_id` no upsert é sempre o da linha que JÁ existe — nunca o desta
      // busca. Reescrevê-lo roubaria a linha da busca que a descobriu, e é o
      // que fazia a busca anterior virar um cache vazio. A filiação desta busca
      // é gravada mais abaixo, em `radar_search_results`.
      const linhaBase = (place: RadarPlace) => ({
        organization_id: organizationId,
        search_id: existentes.get(place.placeId)?.search_id ?? searchId,
        place_id: place.placeId,
        payload: place,
        collected_at: place.collectedAt,
      });

      // Linha já enriquecida com avaliações: `score`, `score_breakdown`,
      // `disqualified` e `disqualify_reasons` ficam DE FORA do payload, então o
      // ON CONFLICT não os toca. Reescrevê-los aqui gravaria uma pontuação
      // calculada sem avaliações ao lado de `reviews`/`reviews_fetched_at`
      // preenchidos — a linha passaria a afirmar que as avaliações estão
      // pendentes tendo as avaliações dentro do próprio registro.
      const enriquecidas = scored.filter(({ place }) => Boolean(existentes.get(place.placeId)?.reviews_fetched_at));
      const semAvaliacoes = scored.filter(({ place }) => !existentes.get(place.placeId)?.reviews_fetched_at);

      if (semAvaliacoes.length > 0) {
        const outcome = await tryWrite(
          supabase.from('radar_results').upsert(
            semAvaliacoes.map(({ place, s }) => ({
              ...linhaBase(place),
              score: s.score,
              score_breakdown: s.breakdown,
              disqualified: s.disqualified,
              disqualify_reasons: s.disqualifyReasons,
            })),
            { onConflict: 'organization_id,place_id' }
          ),
          `gravar radar_results para search_id=${searchId}`
        );
        if (!outcome.success) falhas.push(outcome);
      }

      if (enriquecidas.length > 0) {
        const outcome = await tryWrite(
          supabase.from('radar_results').upsert(
            enriquecidas.map(({ place }) => linhaBase(place)),
            { onConflict: 'organization_id,place_id' }
          ),
          `atualizar payload de linhas já enriquecidas para search_id=${searchId}`
        );
        if (!outcome.success) falhas.push(outcome);
      }

      // Esta leitura decide se a filiação abaixo roda: um erro aqui, se
      // ignorado, esvazia `salvas` em silêncio, pula o upsert de
      // `radar_search_results` e devolve uma busca cacheável com zero
      // linhas de filiação — o mesmo sintoma que o upsert falho já cobre.
      const savedRowsOutcome = await tryWrite(
        supabase
          .from('radar_results')
          .select('id, place_id, saved_deal_id')
          .eq('organization_id', organizationId)
          .in('place_id', placeIds),
        `ler saved_deal_id de radar_results para search_id=${searchId}`
      );
      if (!savedRowsOutcome.success) {
        falhas.push(savedRowsOutcome);
      } else {
        salvas.push(...((savedRowsOutcome.data ?? []) as { id: string; place_id: string; saved_deal_id: string | null }[]));
      }

      // Filiação desta busca. Sem estas linhas a busca existe, é cacheável e
      // devolve zero resultados — o mesmo sintoma que o roubo de `search_id`
      // causava, então uma falha aqui também marca a busca como parcial.
      if (salvas.length > 0) {
        const outcome = await tryWrite(
          supabase.from('radar_search_results').upsert(
            salvas.map(r => ({ search_id: searchId, result_id: r.id, organization_id: organizationId })),
            { onConflict: 'search_id,result_id', ignoreDuplicates: true }
          ),
          `gravar filiação em radar_search_results para search_id=${searchId}`
        );
        if (!outcome.success) falhas.push(outcome);
      }

      if (falhas.length > 0) {
        persistFailed = true;
        for (const f of falhas) {
          // O erro do Postgrest vai INTEIRO para o log: `code`, `details` e
          // `hint` são o que permite reconciliar à mão um run que já foi pago.
          console.error(`[radar/search] falha ao ${f.message}`, f.error);
        }
        const updateOutcome = await tryWrite(
          supabase
            .from('radar_searches')
            .update({ partial: true })
            .eq('id', searchId)
            .eq('organization_id', organizationId),
          `compensar: marcar search_id=${searchId} como partial failed`
        );

        if (!updateOutcome.success) {
          console.error(`[radar/search] falha ao ${updateOutcome.message}`, updateOutcome.error);
        }
      }
    }

    const byPlace = new Map(salvas.map(r => [r.place_id, r]));

    return NextResponse.json<SearchResponse>({
      searchId,
      origin: 'live',
      costUsd: run.costUsd,
      cachedAt: null,
      partial: !run.finished || persistFailed,
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
