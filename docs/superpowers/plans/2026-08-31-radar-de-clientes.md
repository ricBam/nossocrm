# Radar de Clientes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Uma rota `/radar` dentro do NossoCRM que busca empresas no Google Maps via Apify, pontua cada uma de forma auditável, e salva as aprovadas como deal no funil existente — sempre com citação literal de dor reclamada e data.

**Architecture:** Toda chamada ao Apify acontece em Route Handlers (`app/api/radar/*`), onde o token vive. A lógica que decide (preço, score, âncora, dedupe) fica em módulos puros sem I/O em `lib/radar/`, testáveis sem rede. A escrita no CRM reusa o caminho exato da interface — `useCreateDealWithContact` + `dealNotesService` — sem caminho paralelo. Duas tabelas novas (`radar_searches`, `radar_results`) guardam parâmetros, custo real e payload bruto, servindo cache de 30 dias e dedupe por `place_id`.

**Tech Stack:** Next.js 16 (App Router) · React 19 · TypeScript · Supabase (Postgres + RLS) · TanStack Query v5 · Zod v4 · Tailwind v4 · Radix UI · Vitest (happy-dom)

## Global Constraints

- **Regra inegociável:** alvo é dor reclamada publicamente, com **citação literal e data**. Nunca ausência. "Sem site" e "sem rede social" são filtros de descoberta que só ordenam a fila de leitura.
- **Portão de entrada:** "Salvar no CRM" fica **desabilitado** enquanto o campo de citação estiver vazio. Não pode existir nenhum caminho na UI que crie lead sem citação literal ou observação escrita à mão.
- **Token do Apify só no servidor.** `grep -r NEXT_PUBLIC` não pode encontrá-lo. Nome da variável: `APIFY_TOKEN`.
- **Teto mensal** em env, padrão `5.00` (`RADAR_MONTHLY_BUDGET_USD`). Ciclo do dia **16 ao dia 15**. Em 80% avisa, em 100% bloqueia o botão.
- **Nada de busca automática enquanto digita.** A busca só roda em `mutate`, nunca em `useQuery` com key derivada do formulário.
- **Nunca enviar mensagem para lead ou cliente.** O sistema rascunha, quem manda é o Ricardo.
- **Não alterar schema existente.** Só tabelas novas `radar_*`.
- Actor sempre com `language: "pt-BR"` e `countryCode: "br"`.
- Durante o desenvolvimento, `maxCrawledPlacesPerSearch` no **máximo 3**. Cada rodada custa dinheiro real.
- Escrita no CRM **somente** via `useCreateDealWithContact` + `dealNotesService.createNote`.
- Estágio alvo resolvido pelo **primeiro `board_stages` por `"order"` ascendente**, nunca por nome literal.
- `npm run precheck` tem de passar antes de qualquer commit final. Lint roda com `--max-warnings 0`.

## Contexto já estabelecido (não reinvestigar)

| Fato | Valor |
|---|---|
| Org | R.A.F.O — `dc09e9de-2030-426b-9dcd-1beae85bac5e` |
| Board de destino | "Prospecção R.A.F.O", `key = 'prospeccao-rafo'`, `is_default = true`, id `b0a1d000-0000-4000-8000-0000000000ff` |
| Estágio de entrada | "Radar", `"order" = 0`, id `b0a1d000-0000-4000-8000-000000000000`, lifecycle `LEAD` |
| Estágios | Radar(0) → Abordado(1) → Conversa(2) → Proposta(3) → Ganho(4, won) → Perdido(5, lost) |
| Hook de escrita | `useCreateDealWithContact` em `lib/query/hooks/useDealsQuery.ts:579` |
| Notas | `dealNotesService.createNote(dealId, content)` em `lib/supabase/dealNotes.ts` |
| Boards na UI | `useBoards()` / `useDefaultBoard()` em `lib/query/hooks/useBoardsQuery.ts`; `board.stages` já vem ordenado por `"order"` |
| Telefone | `normalizePhoneE164(input, { defaultCountry: 'BR' })` em `lib/phone.ts` — retorna `''` se vazio, E.164 se válido, input trimado se não parsear |
| `Deal.status` | é o **UUID do estágio**, não um enum |
| Padrão RLS | política `FOR ALL TO authenticated` com `(select auth.uid()) IN (SELECT id FROM profiles WHERE organization_id = <tabela>.organization_id AND role = 'admin')` |
| Route handler | `const supabase = await createClient()` de `@/lib/supabase/server` |

**Nota sobre o campo `website`:** o actor não filtra por "sem site". `website` só chega depois do `place-scraped` já pago. O filtro é pós-processamento e **não economiza custo**.

---

## File Structure

**Criados:**

| Arquivo | Responsabilidade |
|---|---|
| `supabase/migrations/20260831210000_radar_clientes.sql` | Tabelas `radar_searches` e `radar_results` + RLS + índices |
| `lib/radar/types.ts` | Tipos compartilhados: `RadarPlace`, `RadarReview`, `ScoreBreakdownItem`, `RadarScore`, `SearchParams` |
| `lib/radar/pricing.ts` | Preços por evento, estimativas, ciclo de faturamento, veredito de teto |
| `lib/radar/score.ts` | Score determinístico com breakdown aberto e desqualificação |
| `lib/radar/anchors.ts` | Termos do âncora e destaque de trechos em avaliações |
| `lib/radar/dedupe.ts` | Dedupe por `place_id` e por telefone E.164 |
| `lib/radar/apify.ts` | Cliente HTTP do Apify (server-only): dispara run, lê dataset e custo real |
| `lib/radar/supabaseWrite.ts` | `mustWrite`/`tryWrite`: convenção para checar `error` em toda escrita Supabase do Radar |
| `app/api/radar/search/route.ts` | POST busca: auth, cache 30d, teto, run, persistência |
| `app/api/radar/reviews/route.ts` | POST avaliações sob demanda de uma empresa |
| `app/api/radar/budget/route.ts` | GET acumulado do ciclo |
| `app/api/radar/results/[id]/route.ts` | DELETE de um lead do Radar junto com o deal e a evidência |
| `lib/query/hooks/useRadarQuery.ts` | Hooks TanStack: busca por `mutate`, orçamento por `useQuery` |
| `app/(protected)/radar/page.tsx` | Shell fino da rota |
| `features/radar/RadarPage.tsx` | Composição da tela |
| `features/radar/components/SearchForm.tsx` | Formulário + filtros + ordenação |
| `features/radar/components/CostEstimate.tsx` | Estimativa, consumo do ciclo, gate do botão |
| `features/radar/components/ResultCard.tsx` | Card da empresa com badges |
| `features/radar/components/ScoreBreakdown.tsx` | Pontos abertos, linha a linha |
| `features/radar/components/ReviewsPanel.tsx` | Painel lateral, avaliações e seleção de trecho |
| `features/radar/components/SaveToCrmModal.tsx` | Citação obrigatória + escrita no CRM |

**Modificados:**

| Arquivo | Mudança |
|---|---|
| `.env.example` | `APIFY_TOKEN`, `RADAR_MONTHLY_BUDGET_USD` |
| `components/Layout.tsx:305-313` | Item de menu `/radar` |

**Testes:** `lib/radar/pricing.test.ts`, `score.test.ts`, `anchors.test.ts`, `dedupe.test.ts`, `apify.test.ts`, `lib/query/hooks/useRadarQuery.test.ts`, `test/stories/radar-salvar-exige-citacao.test.tsx`

---

## Task 1: Migration e variáveis de ambiente

**Files:**
- Create: `supabase/migrations/20260831210000_radar_clientes.sql`
- Modify: `.env.example`

**Interfaces:**
- Consumes: nada.
- Produces: tabelas `public.radar_searches` e `public.radar_results` com as colunas usadas por todas as tasks seguintes. Env `APIFY_TOKEN` e `RADAR_MONTHLY_BUDGET_USD`.

- [ ] **Step 1: Escrever a migration**

Criar `supabase/migrations/20260831210000_radar_clientes.sql`:

```sql
-- ============================================================================
-- Radar de Clientes — descoberta de empresas no Google Maps via Apify
-- ============================================================================
-- radar_searches: uma linha por busca. Guarda parâmetros, run do Apify e o
--   custo REAL cobrado, para o acumulado do ciclo e para o cache de 30 dias.
-- radar_results:  uma linha por lugar encontrado. place_id é a chave de dedupe
--   e saved_deal_id é o caminho para apagar um lead com o que veio junto.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.radar_searches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    nicho TEXT NOT NULL,
    cidade TEXT NOT NULL,
    uf TEXT NOT NULL,
    params JSONB NOT NULL DEFAULT '{}'::jsonb,
    apify_run_id TEXT,
    cost_usd NUMERIC(10,5) NOT NULL DEFAULT 0 CHECK (cost_usd >= 0),
    origin TEXT NOT NULL DEFAULT 'live' CHECK (origin IN ('live','cache')),
    places_count INTEGER NOT NULL DEFAULT 0 CHECK (places_count >= 0),
    created_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Lookup do cache por (nicho, cidade, uf). A soma de custo do ciclo tem
-- índice próprio, idx_radar_searches_cycle — ver migration 20260831220000.
CREATE INDEX IF NOT EXISTS idx_radar_searches_cache
  ON public.radar_searches (organization_id, nicho, cidade, uf, created_at DESC);

CREATE TABLE IF NOT EXISTS public.radar_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    search_id UUID NOT NULL REFERENCES public.radar_searches(id) ON DELETE CASCADE,
    place_id TEXT NOT NULL,
    payload JSONB NOT NULL,
    score INTEGER NOT NULL DEFAULT 0,
    score_breakdown JSONB NOT NULL DEFAULT '[]'::jsonb,
    disqualified BOOLEAN NOT NULL DEFAULT FALSE,
    disqualify_reasons TEXT[] NOT NULL DEFAULT '{}'::text[],
    reviews JSONB,
    reviews_fetched_at TIMESTAMPTZ,
    saved_deal_id UUID REFERENCES public.deals(id) ON DELETE SET NULL,
    collected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Dedupe: um place_id aparece uma vez por organização.
CREATE UNIQUE INDEX IF NOT EXISTS idx_radar_results_org_place
  ON public.radar_results (organization_id, place_id);

CREATE INDEX IF NOT EXISTS idx_radar_results_search
  ON public.radar_results (search_id);

ALTER TABLE public.radar_searches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.radar_results  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage radar_searches" ON public.radar_searches;
CREATE POLICY "Admins manage radar_searches"
  ON public.radar_searches
  FOR ALL
  TO authenticated
  USING (
    (select auth.uid()) IN (
      SELECT id FROM public.profiles
      WHERE organization_id = radar_searches.organization_id
        AND role = 'admin'
    )
  )
  WITH CHECK (
    (select auth.uid()) IN (
      SELECT id FROM public.profiles
      WHERE organization_id = radar_searches.organization_id
        AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins manage radar_results" ON public.radar_results;
CREATE POLICY "Admins manage radar_results"
  ON public.radar_results
  FOR ALL
  TO authenticated
  USING (
    (select auth.uid()) IN (
      SELECT id FROM public.profiles
      WHERE organization_id = radar_results.organization_id
        AND role = 'admin'
    )
  )
  WITH CHECK (
    (select auth.uid()) IN (
      SELECT id FROM public.profiles
      WHERE organization_id = radar_results.organization_id
        AND role = 'admin'
    )
  );

COMMENT ON TABLE public.radar_searches IS
  'Buscas do Radar de Clientes. cost_usd é o custo REAL do run do Apify (usageTotalUsd), não a estimativa. origin=cache significa que a busca foi servida do banco e não gastou nada.';
COMMENT ON TABLE public.radar_results IS
  'Lugares retornados pelo Google Maps via Apify. payload é o registro bruto, com origem google_maps e collected_at. Empresa desqualificada NÃO é apagada: fica marcada, para o motivo continuar visível.';
```

- [ ] **Step 2: Aplicar a migration**

Aplicar via MCP do Supabase (`apply_migration`, projeto `mmmvksgfnyqcyhbdchvf`, name `radar_clientes`) ou via `supabase db push`.

- [ ] **Step 3: Verificar que as tabelas e a RLS existem**

Rodar esta query:

```sql
SELECT c.relname AS tabela, c.relrowsecurity AS rls_ligada,
       (SELECT count(*) FROM pg_policies p WHERE p.tablename = c.relname) AS politicas
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname IN ('radar_searches','radar_results');
```

Esperado: duas linhas, `rls_ligada = true` e `politicas = 1` em cada.

- [ ] **Step 4: Adicionar as variáveis ao `.env.example`**

Acrescentar ao final de `.env.example`:

```
# Radar de Clientes — Apify (server-only, NUNCA prefixar com NEXT_PUBLIC_)
APIFY_TOKEN=
# Teto de gasto mensal do Radar em USD. Ciclo do dia 16 ao dia 15.
RADAR_MONTHLY_BUDGET_USD=5.00
```

- [ ] **Step 5: Confirmar que o token não vazou para o client**

Run: `grep -rnE "NEXT_PUBLIC_[A-Z0-9_]*APIFY" --include="*.ts" --include="*.tsx" --include="*.example" . | grep -v node_modules`
Expected: nenhuma saída (exit code 1).

O padrão busca uma **variável** cujo nome comece com `NEXT_PUBLIC_` e contenha `APIFY`. Não use `grep NEXT_PUBLIC | grep -i apify`: isso casa com a linha de comentário "NUNCA prefixar com `NEXT_PUBLIC_`" que o Step 4 manda escrever, e dá falso positivo.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260831210000_radar_clientes.sql .env.example
git commit -m "feat(radar): schema radar_searches/radar_results e env do Apify"
```

---

## Task 2: Tipos e módulo de preço

**Files:**
- Create: `lib/radar/types.ts`
- Create: `lib/radar/pricing.ts`
- Test: `lib/radar/pricing.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `type RadarPlace`, `RadarReview`, `ScoreBreakdownItem`, `RadarScore`, `SearchParams` de `@/lib/radar/types`
  - `APIFY_FREE_PRICING: ApifyPricing`
  - `estimateSearchCost(input: { places: number; withContacts: boolean }): number`
  - `estimateReviewsCost(input: { places: number; reviewsPerPlace: number }): number`
  - `currentCycleStart(now: Date): Date`
  - `budgetVerdict(input: { spentUsd: number; estimateUsd: number; budgetUsd: number }): BudgetVerdict`

- [ ] **Step 1: Escrever `lib/radar/types.ts`**

```typescript
/**
 * @fileoverview Tipos compartilhados do Radar de Clientes.
 * @module lib/radar/types
 */

/** Um lugar retornado pelo actor compass~crawler-google-places, já enxugado. */
export interface RadarPlace {
  placeId: string;
  title: string;
  categoryName: string | null;
  address: string | null;
  city: string | null;
  phone: string | null;
  website: string | null;
  /** Perfis sociais achados pelo add-on scrapeContacts. */
  socials: string[];
  totalScore: number | null;
  reviewsCount: number | null;
  url: string | null;
  /** Sempre 'google_maps'. Procedência exigida pela constituição. */
  source: 'google_maps';
  /** ISO 8601. Quando este registro foi coletado. */
  collectedAt: string;
}

/** Uma avaliação do Google, como devolvida pelo actor de reviews. */
export interface RadarReview {
  reviewId: string;
  text: string;
  stars: number | null;
  /** ISO 8601. */
  publishedAt: string | null;
  reviewerName: string | null;
}

/** Uma linha do score, sempre visível ao usuário. */
export interface ScoreBreakdownItem {
  label: string;
  points: number;
  /** true quando o sinal foi atendido; false quando somou zero. */
  matched: boolean;
  /** Preenchido quando o sinal não pôde ser avaliado ainda (ex: faltam avaliações). */
  pending?: boolean;
}

export interface RadarScore {
  score: number;
  breakdown: ScoreBreakdownItem[];
  disqualified: boolean;
  disqualifyReasons: string[];
}

export interface SearchParams {
  nicho: string;
  cidade: string;
  uf: string;
  maxResults: number;
  semSite: boolean;
  semRedeSocial: boolean;
  notaMin: number | null;
  notaMax: number | null;
  minAvaliacoes: number | null;
  ordenarPor: 'avaliacoes' | 'nota' | 'score';
}
```

- [ ] **Step 2: Escrever o teste de preço (que vai falhar)**

Criar `lib/radar/pricing.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import {
  APIFY_FREE_PRICING,
  estimateSearchCost,
  estimateReviewsCost,
  currentCycleStart,
  budgetVerdict,
} from '@/lib/radar/pricing';

describe('APIFY_FREE_PRICING', () => {
  it('usa os preços por evento do plano FREE', () => {
    expect(APIFY_FREE_PRICING).toEqual({
      actorStart: 0.00005,
      placeScraped: 0.004,
      placeDetailsScraped: 0.002,
      contactDetailsScraped: 0.002,
      reviewScraped: 0.0005,
    });
  });
});

describe('estimateSearchCost', () => {
  it('cobra início de execução mais um place-scraped por lugar', () => {
    // 0.00005 + 20 * 0.004 = 0.08005
    expect(estimateSearchCost({ places: 20, withContacts: false })).toBeCloseTo(0.08005, 5);
  });

  it('soma contact-details quando o enriquecimento está ligado', () => {
    // 0.00005 + 20 * 0.004 + 20 * 0.002 = 0.12005
    expect(estimateSearchCost({ places: 20, withContacts: true })).toBeCloseTo(0.12005, 5);
  });

  it('não cobra nada além do start quando não há lugares', () => {
    expect(estimateSearchCost({ places: 0, withContacts: true })).toBeCloseTo(0.00005, 5);
  });

  it('trata número negativo como zero em vez de gerar crédito', () => {
    expect(estimateSearchCost({ places: -5, withContacts: false })).toBeCloseTo(0.00005, 5);
  });
});

describe('estimateReviewsCost', () => {
  it('cobra place-details por lugar mais review-scraped por avaliação', () => {
    // 0.00005 + 60 * 0.002 + 60 * 10 * 0.0005 = 0.42005
    expect(estimateReviewsCost({ places: 60, reviewsPerPlace: 10 })).toBeCloseTo(0.42005, 5);
  });

  it('ainda cobra o place-details quando pede zero avaliações', () => {
    // O actor precisa abrir a página de detalhe de qualquer jeito.
    expect(estimateReviewsCost({ places: 1, reviewsPerPlace: 0 })).toBeCloseTo(0.00205, 5);
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
```

- [ ] **Step 2b: Rodar o teste para confirmar que falha**

Run: `npx vitest run lib/radar/pricing.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/radar/pricing"`.

- [ ] **Step 3: Escrever `lib/radar/pricing.ts`**

```typescript
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
  /** Cada lugar retornado pela busca. */
  placeScraped: number;
  /** Abrir a página de detalhe de um lugar (necessário para avaliações). */
  placeDetailsScraped: number;
  /** Add-on de enriquecimento de contato a partir do site. */
  contactDetailsScraped: number;
  /** Cada avaliação extraída. */
  reviewScraped: number;
}

/**
 * Preços por evento no plano FREE do Apify.
 *
 * ⚠️ Conferir contra o console antes da primeira rodada real: a vitrine pública
 * do actor anuncia valores de planos pagos, que são diferentes destes.
 */
export const APIFY_FREE_PRICING: ApifyPricing = {
  actorStart: 0.00005,
  placeScraped: 0.004,
  placeDetailsScraped: 0.002,
  contactDetailsScraped: 0.002,
  reviewScraped: 0.0005,
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
 * @param input.withContacts - Se o add-on `scrapeContacts` está ligado.
 * @returns Custo em USD.
 */
export function estimateSearchCost(
  input: { places: number; withContacts: boolean },
  pricing: ApifyPricing = APIFY_FREE_PRICING
): number {
  const places = atLeastZero(input.places);
  const contacts = input.withContacts ? places * pricing.contactDetailsScraped : 0;
  return pricing.actorStart + places * pricing.placeScraped + contacts;
}

/**
 * Custo estimado de puxar avaliações sob demanda.
 *
 * O `placeDetailsScraped` é cobrado por lugar mesmo com zero avaliações,
 * porque o actor precisa abrir a página de detalhe antes.
 *
 * @returns Custo em USD.
 */
export function estimateReviewsCost(
  input: { places: number; reviewsPerPlace: number },
  pricing: ApifyPricing = APIFY_FREE_PRICING
): number {
  const places = atLeastZero(input.places);
  const perPlace = atLeastZero(input.reviewsPerPlace);
  return (
    pricing.actorStart +
    places * pricing.placeDetailsScraped +
    places * perPlace * pricing.reviewScraped
  );
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
```

- [ ] **Step 4: Rodar os testes**

Run: `npx vitest run lib/radar/pricing.test.ts`
Expected: PASS, 14 testes.

- [ ] **Step 5: Commit**

```bash
git add lib/radar/types.ts lib/radar/pricing.ts lib/radar/pricing.test.ts
git commit -m "feat(radar): tipos, tabela de precos do Apify e teto por ciclo"
```

---

## Task 3: Score determinístico

**Files:**
- Create: `lib/radar/score.ts`
- Test: `lib/radar/score.test.ts`

**Interfaces:**
- Consumes: `RadarPlace`, `RadarReview`, `RadarScore`, `ScoreBreakdownItem` de `@/lib/radar/types`; `matchesAnchor` de `@/lib/radar/anchors` **não** — o score recebe as avaliações já casadas, para não acoplar os módulos.
- Produces: `ICP_NICHES: string[]`, `CHAIN_MARKERS: string[]`, `computeScore(place: RadarPlace, opts?: { reviews?: RadarReview[]; now?: Date }): RadarScore`

**Nota de desenho:** o sinal de +3 depende de avaliações, que só são puxadas sob demanda (Task 9). Quando `opts.reviews` é `undefined`, a linha entra no breakdown com `pending: true` e zero ponto — o usuário vê que aquele ponto existe e ainda não foi apurado, em vez de um número que muda sozinho depois. Após puxar as avaliações, `computeScore` é chamado de novo com elas e o resultado é regravado.

- [ ] **Step 1: Escrever o teste (que vai falhar)**

Criar `lib/radar/score.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { computeScore, ICP_NICHES, CHAIN_MARKERS } from '@/lib/radar/score';
import type { RadarPlace, RadarReview } from '@/lib/radar/types';

const NOW = new Date('2026-08-31T00:00:00Z');

function place(over: Partial<RadarPlace> = {}): RadarPlace {
  return {
    placeId: 'ChIJ_teste',
    title: 'Clínica Odontológica Sorriso',
    categoryName: 'Clínica odontológica',
    address: 'Rua A, 100',
    city: 'Resende',
    phone: '+552433001122',
    website: null,
    socials: [],
    totalScore: 4.2,
    reviewsCount: 120,
    url: null,
    source: 'google_maps',
    collectedAt: NOW.toISOString(),
    ...over,
  };
}

function review(over: Partial<RadarReview> = {}): RadarReview {
  return {
    reviewId: 'r1',
    text: 'Liguei três vezes e ninguém responde.',
    stars: 2,
    publishedAt: '2026-07-01T00:00:00Z',
    reviewerName: 'Fulano',
    ...over,
  };
}

describe('computeScore — pontos positivos', () => {
  it('soma 2 para nota entre 3,5 e 4,7 inclusive nas bordas', () => {
    for (const nota of [3.5, 4.2, 4.7]) {
      const r = computeScore(place({ totalScore: nota }), { now: NOW });
      expect(r.breakdown.find(b => b.label.includes('Nota entre 3,5 e 4,7'))).toMatchObject({
        points: 2, matched: true,
      });
    }
  });

  it('não soma a nota quando está acima de 4,7 (bom demais para ter dor)', () => {
    const r = computeScore(place({ totalScore: 4.9 }), { now: NOW });
    expect(r.breakdown.find(b => b.label.includes('Nota entre 3,5 e 4,7'))).toMatchObject({
      points: 0, matched: false,
    });
  });

  it('soma 2 para 50 ou mais avaliações', () => {
    const r = computeScore(place({ reviewsCount: 50 }), { now: NOW });
    expect(r.breakdown.find(b => b.label.includes('50 ou mais avaliações'))).toMatchObject({
      points: 2, matched: true,
    });
  });

  it('soma 1 quando há telefone', () => {
    const r = computeScore(place(), { now: NOW });
    expect(r.breakdown.find(b => b.label === 'Telefone presente')).toMatchObject({
      points: 1, matched: true,
    });
  });

  it('não soma telefone quando o campo vem vazio', () => {
    const r = computeScore(place({ phone: '  ' }), { now: NOW });
    expect(r.breakdown.find(b => b.label === 'Telefone presente')).toMatchObject({
      points: 0, matched: false,
    });
  });

  it('soma 1 quando a categoria está nos nichos do ICP', () => {
    const r = computeScore(place({ categoryName: 'Clínica odontológica' }), { now: NOW });
    expect(r.breakdown.find(b => b.label.includes('nichos do ICP'))).toMatchObject({
      points: 1, matched: true,
    });
  });

  it('não soma categoria fora do ICP', () => {
    const r = computeScore(place({ categoryName: 'Loja de fogos de artifício' }), { now: NOW });
    expect(r.breakdown.find(b => b.label.includes('nichos do ICP'))).toMatchObject({
      points: 0, matched: false,
    });
  });
});

describe('computeScore — o sinal de avaliação recente', () => {
  it('fica pendente e vale zero quando as avaliações não foram puxadas', () => {
    const r = computeScore(place(), { now: NOW });
    const linha = r.breakdown.find(b => b.label.includes('últimos 180 dias'));
    expect(linha).toMatchObject({ points: 0, matched: false, pending: true });
  });

  it('soma 3 para avaliação dos últimos 180 dias citando demora ou resposta', () => {
    const r = computeScore(place(), { now: NOW, reviews: [review()] });
    expect(r.breakdown.find(b => b.label.includes('últimos 180 dias'))).toMatchObject({
      points: 3, matched: true, pending: undefined,
    });
  });

  it('não soma quando a avaliação casa o termo mas é mais velha que 180 dias', () => {
    const antiga = review({ publishedAt: '2025-12-01T00:00:00Z' });
    const r = computeScore(place(), { now: NOW, reviews: [antiga] });
    expect(r.breakdown.find(b => b.label.includes('últimos 180 dias'))).toMatchObject({
      points: 0, matched: false,
    });
  });

  it('não soma quando a avaliação é recente mas não fala de demora nem resposta', () => {
    const boa = review({ text: 'Atendimento excelente, recomendo muito.' });
    const r = computeScore(place(), { now: NOW, reviews: [boa] });
    expect(r.breakdown.find(b => b.label.includes('últimos 180 dias'))).toMatchObject({
      points: 0, matched: false,
    });
  });

  it('ignora avaliação sem data em vez de assumir que é recente', () => {
    const semData = review({ publishedAt: null });
    const r = computeScore(place(), { now: NOW, reviews: [semData] });
    expect(r.breakdown.find(b => b.label.includes('últimos 180 dias'))).toMatchObject({
      points: 0, matched: false,
    });
  });
});

describe('computeScore — desqualificação', () => {
  it('desqualifica nota abaixo de 3,0', () => {
    const r = computeScore(place({ totalScore: 2.9 }), { now: NOW });
    expect(r.disqualified).toBe(true);
    expect(r.disqualifyReasons).toContain('Nota abaixo de 3,0');
  });

  it('desqualifica menos de 50 avaliações', () => {
    const r = computeScore(place({ reviewsCount: 49 }), { now: NOW });
    expect(r.disqualified).toBe(true);
    expect(r.disqualifyReasons).toContain('Menos de 50 avaliações');
  });

  it('desqualifica quando o nome sugere rede ou franquia', () => {
    const r = computeScore(place({ title: 'OdontoCompany Resende — Unidade Centro' }), { now: NOW });
    expect(r.disqualified).toBe(true);
    expect(r.disqualifyReasons.some(m => m.startsWith('Nome sugere rede ou franquia'))).toBe(true);
  });

  it('acumula mais de um motivo quando há mais de um', () => {
    const r = computeScore(place({ totalScore: 2.0, reviewsCount: 3 }), { now: NOW });
    expect(r.disqualifyReasons).toHaveLength(2);
  });

  it('mantém o score calculado mesmo desqualificada, para o motivo continuar visível', () => {
    const r = computeScore(place({ reviewsCount: 10 }), { now: NOW });
    expect(r.disqualified).toBe(true);
    // nota 4,2 (+2) + telefone (+1) + categoria ICP (+1); avaliações não pontuam
    expect(r.score).toBe(4);
    expect(r.breakdown.length).toBeGreaterThan(0);
  });
});

describe('computeScore — soma total', () => {
  it('soma todos os sinais de uma empresa ideal com avaliação casada', () => {
    const r = computeScore(place(), { now: NOW, reviews: [review()] });
    // 2 nota + 2 avaliações + 3 recente + 1 telefone + 1 categoria
    expect(r.score).toBe(9);
    expect(r.disqualified).toBe(false);
  });

  it('trata nota e contagem nulas sem quebrar', () => {
    const r = computeScore(place({ totalScore: null, reviewsCount: null }), { now: NOW });
    expect(r.disqualified).toBe(true);
    expect(Number.isFinite(r.score)).toBe(true);
  });
});

describe('constantes', () => {
  it('expõe os nichos do ICP e os marcadores de rede em minúsculas', () => {
    expect(ICP_NICHES.length).toBeGreaterThan(0);
    expect(ICP_NICHES.every(n => n === n.toLowerCase())).toBe(true);
    expect(CHAIN_MARKERS.every(n => n === n.toLowerCase())).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar para confirmar que falha**

Run: `npx vitest run lib/radar/score.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/radar/score"`.

- [ ] **Step 3: Escrever `lib/radar/score.ts`**

```typescript
/**
 * @fileoverview Score de qualidade do Radar — determinístico, sem LLM.
 *
 * Regra do produto: o número nunca é opaco. Toda pontuação sai acompanhada
 * do breakdown linha a linha, e empresa desqualificada continua na lista
 * marcada — sumir com ela esconderia o motivo.
 *
 * @module lib/radar/score
 */

import type { RadarPlace, RadarReview, RadarScore, ScoreBreakdownItem } from './types';

/** Nichos do ICP da R.A.F.O. Tudo em minúsculas, comparação por substring. */
export const ICP_NICHES: string[] = [
  'odontológic',
  'dentista',
  'clínica',
  'consultório',
  'estética',
  'salão de beleza',
  'barbearia',
  'pet shop',
  'veterinári',
  'oficina mecânica',
  'auto center',
  'academia',
  'contabilidade',
  'contábil',
  'advocacia',
  'advogado',
  'imobiliária',
  'fisioterapia',
  'nutrição',
  'psicolog',
];

/** Marcadores que sugerem rede, franquia ou filial. Tudo em minúsculas. */
export const CHAIN_MARKERS: string[] = [
  'franquia',
  'franchising',
  'unidade ',
  'filial',
  ' rede ',
  'odontocompany',
  'orthodontic',
  'sorridents',
  'oral sin',
  'smart fit',
  'bluefit',
  'cacau show',
  'o boticário',
  'subway',
  'mcdonald',
  'burger king',
];

/** Termos que caracterizam o âncora "ninguém responde" dentro de uma avaliação. */
const ANCHOR_TERMS = [
  'não atende',
  'nao atende',
  'não responde',
  'nao responde',
  'não retorna',
  'nao retorna',
  'liguei',
  'whatsapp',
  'remarcar',
  'demora',
  'agendamento',
  'ninguém',
  'ninguem',
];

const RECENT_WINDOW_DAYS = 180;

/** Baixa a caixa e remove acentos (faixa de diacríticos combinantes U+0300–U+036F). */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function containsAny(haystack: string | null, needles: string[]): boolean {
  if (!haystack) return false;
  const hay = normalize(haystack);
  return needles.some(n => hay.includes(normalize(n)));
}

/** Uma avaliação conta se é dos últimos 180 dias E cita um termo do âncora. */
function hasRecentAnchoredReview(reviews: RadarReview[], now: Date): boolean {
  const cutoff = now.getTime() - RECENT_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  return reviews.some(r => {
    if (!r.publishedAt) return false; // sem data não dá para afirmar recência
    const t = Date.parse(r.publishedAt);
    if (!Number.isFinite(t) || t < cutoff) return false;
    return containsAny(r.text, ANCHOR_TERMS);
  });
}

function line(label: string, points: number, matched: boolean, pending?: boolean): ScoreBreakdownItem {
  return pending
    ? { label, points: 0, matched: false, pending: true }
    : { label, points: matched ? points : 0, matched };
}

/**
 * Calcula o score de uma empresa.
 *
 * @param place - Lugar vindo do Google Maps.
 * @param opts.reviews - Avaliações já puxadas. Ausente = sinal fica pendente.
 * @param opts.now - Momento de referência para a janela de 180 dias.
 */
export function computeScore(
  place: RadarPlace,
  opts?: { reviews?: RadarReview[]; now?: Date }
): RadarScore {
  const now = opts?.now ?? new Date();
  const reviews = opts?.reviews;

  const nota = place.totalScore;
  const qtd = place.reviewsCount;

  const notaNaFaixa = nota !== null && nota >= 3.5 && nota <= 4.7;
  const temVolume = qtd !== null && qtd >= 50;
  const temTelefone = (place.phone ?? '').trim().length > 0;
  const noIcp = containsAny(place.categoryName, ICP_NICHES);

  const breakdown: ScoreBreakdownItem[] = [
    line('Nota entre 3,5 e 4,7', 2, notaNaFaixa),
    line('50 ou mais avaliações', 2, temVolume),
    reviews === undefined
      ? line('Avaliação dos últimos 180 dias citando demora, resposta ou agendamento', 3, false, true)
      : line(
          'Avaliação dos últimos 180 dias citando demora, resposta ou agendamento',
          3,
          hasRecentAnchoredReview(reviews, now)
        ),
    line('Telefone presente', 1, temTelefone),
    line('Categoria dentro dos nichos do ICP', 1, noIcp),
  ];

  const score = breakdown.reduce((acc, b) => acc + b.points, 0);

  const disqualifyReasons: string[] = [];
  if (nota === null || nota < 3.0) disqualifyReasons.push('Nota abaixo de 3,0');
  if (qtd === null || qtd < 50) disqualifyReasons.push('Menos de 50 avaliações');
  const chainHit = CHAIN_MARKERS.find(m => normalize(place.title).includes(normalize(m)));
  if (chainHit) disqualifyReasons.push(`Nome sugere rede ou franquia ("${chainHit.trim()}")`);

  return {
    score,
    breakdown,
    disqualified: disqualifyReasons.length > 0,
    disqualifyReasons,
  };
}
```

- [ ] **Step 4: Rodar os testes**

Run: `npx vitest run lib/radar/score.test.ts`
Expected: PASS, 20 testes.

- [ ] **Step 5: Commit**

```bash
git add lib/radar/score.ts lib/radar/score.test.ts
git commit -m "feat(radar): score deterministico com breakdown aberto e desqualificacao visivel"
```

---

## Task 4: Âncora e destaque de trechos

**Files:**
- Create: `lib/radar/anchors.ts`
- Test: `lib/radar/anchors.test.ts`

**Interfaces:**
- Consumes: `RadarReview` de `@/lib/radar/types`.
- Produces:
  - `ANCHOR_TERMS: string[]`
  - `APIFY_REVIEWS_FILTER: string` — string pronta para `reviewsFilterString`
  - `findAnchorMatches(review: RadarReview): AnchorMatch[]` com `interface AnchorMatch { term: string; start: number; end: number; snippet: string }`
  - `rankReviewsByAnchor(reviews: RadarReview[]): RadarReview[]`

- [ ] **Step 1: Escrever o teste (que vai falhar)**

Criar `lib/radar/anchors.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import {
  ANCHOR_TERMS,
  APIFY_REVIEWS_FILTER,
  findAnchorMatches,
  rankReviewsByAnchor,
} from '@/lib/radar/anchors';
import type { RadarReview } from '@/lib/radar/types';

function review(text: string, over: Partial<RadarReview> = {}): RadarReview {
  return {
    reviewId: 'r',
    text,
    stars: 3,
    publishedAt: '2026-08-01T00:00:00Z',
    reviewerName: null,
    ...over,
  };
}

describe('ANCHOR_TERMS', () => {
  it('contém os nove termos do âncora "ninguém responde"', () => {
    for (const t of ['não atende', 'não responde', 'não retorna', 'liguei', 'whatsapp', 'remarcar', 'demora', 'agendamento', 'ninguém']) {
      expect(ANCHOR_TERMS).toContain(t);
    }
  });
});

describe('APIFY_REVIEWS_FILTER', () => {
  it('junta os termos numa string única para o campo reviewsFilterString', () => {
    expect(typeof APIFY_REVIEWS_FILTER).toBe('string');
    expect(APIFY_REVIEWS_FILTER).toContain('demora');
    expect(APIFY_REVIEWS_FILTER.length).toBeGreaterThan(0);
  });
});

describe('findAnchorMatches', () => {
  it('acha o termo e devolve as posições exatas no texto original', () => {
    const r = review('Ligação nunca atendida, muita demora para responder.');
    const m = findAnchorMatches(r);
    const demora = m.find(x => x.term === 'demora');
    expect(demora).toBeDefined();
    expect(r.text.slice(demora!.start, demora!.end).toLowerCase()).toBe('demora');
  });

  it('casa mesmo quando o texto está sem acento', () => {
    const m = findAnchorMatches(review('Ninguem responde o whatsapp deles.'));
    expect(m.map(x => x.term)).toContain('ninguém');
  });

  it('casa mesmo quando o texto está em caixa alta', () => {
    const m = findAnchorMatches(review('LIGUEI TRÊS VEZES E NADA'));
    expect(m.map(x => x.term)).toContain('liguei');
  });

  it('devolve lista vazia quando nada casa', () => {
    expect(findAnchorMatches(review('Atendimento impecável, equipe nota dez.'))).toEqual([]);
  });

  it('devolve um trecho com contexto ao redor do termo', () => {
    const r = review('Fui muito bem recebido mas tive que remarcar quatro vezes seguidas por telefone.');
    const m = findAnchorMatches(r);
    expect(m[0].snippet).toContain('remarcar');
    expect(m[0].snippet.length).toBeGreaterThan('remarcar'.length);
  });

  it('acha vários termos distintos na mesma avaliação', () => {
    const m = findAnchorMatches(review('Liguei, mandei whatsapp, e ninguém responde.'));
    expect(m.length).toBeGreaterThanOrEqual(3);
  });

  it('não quebra com texto vazio', () => {
    expect(findAnchorMatches(review(''))).toEqual([]);
  });
});

describe('rankReviewsByAnchor', () => {
  it('põe as avaliações com mais casamentos na frente', () => {
    const nenhum = review('Tudo ótimo.', { reviewId: 'a' });
    const um = review('Que demora.', { reviewId: 'b' });
    const tres = review('Liguei, mandei whatsapp, ninguém responde.', { reviewId: 'c' });
    const out = rankReviewsByAnchor([nenhum, um, tres]);
    expect(out.map(r => r.reviewId)).toEqual(['c', 'b', 'a']);
  });

  it('não altera o array recebido', () => {
    const entrada = [review('Tudo ótimo.', { reviewId: 'a' }), review('Demora.', { reviewId: 'b' })];
    const copia = [...entrada];
    rankReviewsByAnchor(entrada);
    expect(entrada).toEqual(copia);
  });

  it('desempata pela avaliação mais recente', () => {
    const velha = review('Demora.', { reviewId: 'velha', publishedAt: '2025-01-01T00:00:00Z' });
    const nova = review('Demora.', { reviewId: 'nova', publishedAt: '2026-08-01T00:00:00Z' });
    expect(rankReviewsByAnchor([velha, nova]).map(r => r.reviewId)).toEqual(['nova', 'velha']);
  });
});
```

- [ ] **Step 2: Rodar para confirmar que falha**

Run: `npx vitest run lib/radar/anchors.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/radar/anchors"`.

- [ ] **Step 3: Escrever `lib/radar/anchors.ts`**

```typescript
/**
 * @fileoverview O âncora de busca do Radar: "ninguém responde".
 *
 * Estes termos servem a dois propósitos:
 * 1. `reviewsFilterString` do actor de avaliações — filtra na origem e corta
 *    eventos `review-scraped`, que são cobrados um a um.
 * 2. Destaque na leitura, para o Ricardo escolher o trecho que vira citação.
 *
 * @module lib/radar/anchors
 */

import type { RadarReview } from './types';

/** Os termos do âncora, na grafia canônica com acento. */
export const ANCHOR_TERMS: string[] = [
  'não atende',
  'não responde',
  'não retorna',
  'liguei',
  'whatsapp',
  'remarcar',
  'demora',
  'agendamento',
  'ninguém',
];

/**
 * Termos prontos para `reviewsFilterString` do actor.
 * O actor trata a string como lista de palavras-chave separadas por espaço.
 */
export const APIFY_REVIEWS_FILTER: string = ANCHOR_TERMS.join(' ');

/** Quantos caracteres de contexto mostrar de cada lado do termo. */
const SNIPPET_PADDING = 60;

export interface AnchorMatch {
  /** O termo canônico que casou. */
  term: string;
  /** Índice inicial no texto ORIGINAL da avaliação. */
  start: number;
  /** Índice final (exclusivo) no texto ORIGINAL. */
  end: number;
  /** Trecho com contexto, pronto para virar citação. */
  snippet: string;
}

/**
 * Remove acentos e baixa a caixa, preservando o comprimento de cada caractere
 * para que os índices continuem válidos no texto original.
 */
function foldPreservingLength(text: string): string {
  return Array.from(text)
    .map(ch => {
      const folded = ch
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
      // Se a dobra mudou o comprimento, devolve o original em minúscula
      // para não deslocar os índices.
      return folded.length === 1 ? folded : ch.toLowerCase();
    })
    .join('');
}

/**
 * Acha todas as ocorrências dos termos do âncora numa avaliação.
 *
 * @returns Uma entrada por termo distinto encontrado, na ordem em que aparecem.
 */
export function findAnchorMatches(review: RadarReview): AnchorMatch[] {
  const text = review.text ?? '';
  if (!text.trim()) return [];

  const haystack = foldPreservingLength(text);
  const matches: AnchorMatch[] = [];

  for (const term of ANCHOR_TERMS) {
    const needle = foldPreservingLength(term);
    const start = haystack.indexOf(needle);
    if (start === -1) continue;
    const end = start + needle.length;
    const from = Math.max(0, start - SNIPPET_PADDING);
    const to = Math.min(text.length, end + SNIPPET_PADDING);
    matches.push({
      term,
      start,
      end,
      snippet: (from > 0 ? '…' : '') + text.slice(from, to).trim() + (to < text.length ? '…' : ''),
    });
  }

  return matches.sort((a, b) => a.start - b.start);
}

/**
 * Ordena avaliações pela quantidade de termos do âncora que casam,
 * desempatando pela mais recente. Não altera o array recebido.
 */
export function rankReviewsByAnchor(reviews: RadarReview[]): RadarReview[] {
  return [...reviews].sort((a, b) => {
    const diff = findAnchorMatches(b).length - findAnchorMatches(a).length;
    if (diff !== 0) return diff;
    const ta = a.publishedAt ? Date.parse(a.publishedAt) : 0;
    const tb = b.publishedAt ? Date.parse(b.publishedAt) : 0;
    return (Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0);
  });
}
```

- [ ] **Step 4: Rodar os testes**

Run: `npx vitest run lib/radar/anchors.test.ts`
Expected: PASS, 12 testes.

- [ ] **Step 5: Commit**

```bash
git add lib/radar/anchors.ts lib/radar/anchors.test.ts
git commit -m "feat(radar): termos do ancora, filtro do actor e destaque de trechos"
```

---

## Task 5: Dedupe

**Files:**
- Create: `lib/radar/dedupe.ts`
- Test: `lib/radar/dedupe.test.ts`

**Interfaces:**
- Consumes: `normalizePhoneE164` de `@/lib/phone`.
- Produces:
  - `interface DedupeIndex { placeIds: Set<string>; phones: Set<string> }`
  - `buildDedupeIndex(input: { knownPlaceIds: string[]; knownPhones: (string | null | undefined)[] }): DedupeIndex`
  - `checkDuplicate(place: { placeId: string; phone: string | null }, index: DedupeIndex): DuplicateVerdict` com `interface DuplicateVerdict { isDuplicate: boolean; reasons: Array<'place_id' | 'phone'> }`

- [ ] **Step 1: Escrever o teste (que vai falhar)**

Criar `lib/radar/dedupe.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { buildDedupeIndex, checkDuplicate } from '@/lib/radar/dedupe';

describe('buildDedupeIndex', () => {
  it('normaliza os telefones conhecidos para E.164', () => {
    const idx = buildDedupeIndex({ knownPlaceIds: [], knownPhones: ['(24) 3300-1122'] });
    expect(idx.phones.has('+552433001122')).toBe(true);
  });

  it('descarta telefone vazio, nulo e indefinido sem poluir o índice', () => {
    const idx = buildDedupeIndex({ knownPlaceIds: [], knownPhones: ['', '   ', null, undefined] });
    expect(idx.phones.size).toBe(0);
  });

  it('guarda os place_ids como vieram', () => {
    const idx = buildDedupeIndex({ knownPlaceIds: ['ChIJ_a', 'ChIJ_b'], knownPhones: [] });
    expect(idx.placeIds.has('ChIJ_a')).toBe(true);
    expect(idx.placeIds.size).toBe(2);
  });
});

describe('checkDuplicate', () => {
  const idx = buildDedupeIndex({
    knownPlaceIds: ['ChIJ_ja_visto'],
    knownPhones: ['+552433001122'],
  });

  it('marca duplicata por place_id', () => {
    const v = checkDuplicate({ placeId: 'ChIJ_ja_visto', phone: null }, idx);
    expect(v).toEqual({ isDuplicate: true, reasons: ['place_id'] });
  });

  it('marca duplicata por telefone escrito de outro jeito', () => {
    const v = checkDuplicate({ placeId: 'ChIJ_novo', phone: '(24) 3300-1122' }, idx);
    expect(v).toEqual({ isDuplicate: true, reasons: ['phone'] });
  });

  it('acumula os dois motivos quando ambos batem', () => {
    const v = checkDuplicate({ placeId: 'ChIJ_ja_visto', phone: '+55 24 3300-1122' }, idx);
    expect(v.isDuplicate).toBe(true);
    expect(v.reasons).toEqual(['place_id', 'phone']);
  });

  it('não marca nada quando é empresa nova', () => {
    const v = checkDuplicate({ placeId: 'ChIJ_novo', phone: '+552499998888' }, idx);
    expect(v).toEqual({ isDuplicate: false, reasons: [] });
  });

  it('não marca duplicata quando o telefone da empresa é nulo', () => {
    const v = checkDuplicate({ placeId: 'ChIJ_novo', phone: null }, idx);
    expect(v.isDuplicate).toBe(false);
  });

  it('não trata telefone impossível de normalizar como duplicata de outro impossível', () => {
    const idxSujo = buildDedupeIndex({ knownPlaceIds: [], knownPhones: ['ramal 22'] });
    const v = checkDuplicate({ placeId: 'ChIJ_x', phone: 'ramal 33' }, idxSujo);
    expect(v.isDuplicate).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar para confirmar que falha**

Run: `npx vitest run lib/radar/dedupe.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/radar/dedupe"`.

- [ ] **Step 3: Escrever `lib/radar/dedupe.ts`**

```typescript
/**
 * @fileoverview Dedupe do Radar contra o que já existe.
 *
 * Duplicata NÃO bloqueia nada — apenas marca o card. A decisão continua sendo
 * de quem lê.
 *
 * @module lib/radar/dedupe
 */

import { normalizePhoneE164 } from '@/lib/phone';

export interface DedupeIndex {
  placeIds: Set<string>;
  phones: Set<string>;
}

export type DuplicateReason = 'place_id' | 'phone';

export interface DuplicateVerdict {
  isDuplicate: boolean;
  reasons: DuplicateReason[];
}

/**
 * `normalizePhoneE164` devolve o input trimado quando não consegue parsear.
 * Só entra no índice o que virou E.164 de verdade, senão dois lixos diferentes
 * poderiam colidir por acaso.
 */
function toIndexablePhone(raw: string | null | undefined): string | null {
  const e164 = normalizePhoneE164(raw, { defaultCountry: 'BR' });
  return e164.startsWith('+') ? e164 : null;
}

/**
 * Monta o índice a partir dos place_ids de buscas anteriores e dos telefones
 * de contatos que já existem no CRM.
 */
export function buildDedupeIndex(input: {
  knownPlaceIds: string[];
  knownPhones: (string | null | undefined)[];
}): DedupeIndex {
  const phones = new Set<string>();
  for (const raw of input.knownPhones) {
    const phone = toIndexablePhone(raw);
    if (phone) phones.add(phone);
  }
  return {
    placeIds: new Set(input.knownPlaceIds.filter(Boolean)),
    phones,
  };
}

/** Verifica um lugar contra o índice. Ordem dos motivos: place_id, depois phone. */
export function checkDuplicate(
  place: { placeId: string; phone: string | null },
  index: DedupeIndex
): DuplicateVerdict {
  const reasons: DuplicateReason[] = [];

  if (place.placeId && index.placeIds.has(place.placeId)) reasons.push('place_id');

  const phone = toIndexablePhone(place.phone);
  if (phone && index.phones.has(phone)) reasons.push('phone');

  return { isDuplicate: reasons.length > 0, reasons };
}
```

- [ ] **Step 4: Rodar os testes**

Run: `npx vitest run lib/radar/dedupe.test.ts`
Expected: PASS, 9 testes.

- [ ] **Step 5: Commit**

```bash
git add lib/radar/dedupe.ts lib/radar/dedupe.test.ts
git commit -m "feat(radar): dedupe por place_id e telefone E.164"
```

---

## Task 6: Cliente do Apify

**Files:**
- Create: `lib/radar/apify.ts`
- Test: `lib/radar/apify.test.ts`

**Interfaces:**
- Consumes: `RadarPlace`, `RadarReview` de `@/lib/radar/types`. **Não** importa nada de `anchors.ts` — a filtragem por termo é local, feita depois, em `findAnchorMatches`.
- Produces:
  - `class ApifyConfigError extends Error`
  - `runPlacesSearch(input: PlacesSearchInput): Promise<{ runId: string; costUsd: number; finished: boolean; places: RadarPlace[] }>`
  - `runReviewsScrape(input: ReviewsInput): Promise<{ runId: string; costUsd: number; finished: boolean; reviews: RadarReview[] }>`
  - `mapPlace(raw: Record<string, unknown>, collectedAt: string): RadarPlace | null`
  - `mapReview(raw: Record<string, unknown>): RadarReview | null`

**Nota:** `server-only` **não** é importado aqui, para o módulo continuar testável em Vitest. A garantia de que o token não vaza vem de o arquivo só ser importado por Route Handlers e de `APIFY_TOKEN` não ter prefixo `NEXT_PUBLIC_` — sem esse prefixo o Next não inlina a variável no bundle do client.

- [ ] **Step 1: Escrever o teste (que vai falhar)**

Criar `lib/radar/apify.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mapPlace, mapReview, runPlacesSearch, ApifyConfigError } from '@/lib/radar/apify';

const COLLECTED = '2026-08-31T00:00:00.000Z';

describe('mapPlace', () => {
  it('enxuga o registro bruto e carimba procedência e data de coleta', () => {
    const out = mapPlace(
      {
        placeId: 'ChIJ_1',
        title: 'Clínica Sorriso',
        categoryName: 'Clínica odontológica',
        address: 'Rua A, 100',
        city: 'Resende',
        phone: '+55 24 3300-1122',
        website: 'https://sorriso.com.br',
        totalScore: 4.3,
        reviewsCount: 87,
        url: 'https://maps.google.com/?cid=1',
      },
      COLLECTED
    );
    expect(out).toEqual({
      placeId: 'ChIJ_1',
      title: 'Clínica Sorriso',
      categoryName: 'Clínica odontológica',
      address: 'Rua A, 100',
      city: 'Resende',
      phone: '+55 24 3300-1122',
      website: 'https://sorriso.com.br',
      socials: [],
      totalScore: 4.3,
      reviewsCount: 87,
      url: 'https://maps.google.com/?cid=1',
      source: 'google_maps',
      collectedAt: COLLECTED,
    });
  });

  it('devolve null quando falta placeId, que é a chave de dedupe', () => {
    expect(mapPlace({ title: 'Sem id' }, COLLECTED)).toBeNull();
  });

  it('devolve null quando falta título', () => {
    expect(mapPlace({ placeId: 'ChIJ_1' }, COLLECTED)).toBeNull();
  });

  it('normaliza campos ausentes para null em vez de undefined', () => {
    const out = mapPlace({ placeId: 'ChIJ_1', title: 'X' }, COLLECTED);
    expect(out).toMatchObject({
      categoryName: null, address: null, phone: null, website: null,
      totalScore: null, reviewsCount: null,
    });
  });

  it('junta os perfis sociais do add-on de contatos', () => {
    const out = mapPlace(
      {
        placeId: 'ChIJ_1', title: 'X',
        instagrams: ['https://instagram.com/x'],
        facebooks: ['https://facebook.com/x'],
      },
      COLLECTED
    );
    expect(out!.socials).toEqual(['https://instagram.com/x', 'https://facebook.com/x']);
  });
});

describe('mapReview', () => {
  it('mapeia os campos usados na leitura', () => {
    expect(mapReview({
      reviewId: 'r1', text: 'Demora demais', stars: 2,
      publishedAtDate: '2026-07-01T00:00:00.000Z', name: 'Fulano',
    })).toEqual({
      reviewId: 'r1', text: 'Demora demais', stars: 2,
      publishedAt: '2026-07-01T00:00:00.000Z', reviewerName: 'Fulano',
    });
  });

  it('descarta avaliação sem texto, que não vira citação', () => {
    expect(mapReview({ reviewId: 'r1', stars: 5 })).toBeNull();
    expect(mapReview({ reviewId: 'r1', text: '   ', stars: 5 })).toBeNull();
  });
});

describe('runPlacesSearch', () => {
  const OLD_ENV = process.env.APIFY_TOKEN;

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.APIFY_TOKEN = 'tok_teste';
  });

  afterEach(() => {
    process.env.APIFY_TOKEN = OLD_ENV;
  });

  it('explode com ApifyConfigError quando o token não está configurado', async () => {
    delete process.env.APIFY_TOKEN;
    await expect(
      runPlacesSearch({ nicho: 'clínica odontológica', cidade: 'Resende', uf: 'RJ', maxResults: 3, withContacts: false })
    ).rejects.toBeInstanceOf(ApifyConfigError);
  });

  it('manda pt-BR, br e o limite de resultados no input do actor', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: { id: 'run_1', defaultDatasetId: 'ds_1', usageTotalUsd: 0.0125, status: 'SUCCEEDED' },
      }), { status: 201, headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify([
        { placeId: 'ChIJ_1', title: 'Clínica A', totalScore: 4.1, reviewsCount: 60 },
      ]), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    const out = await runPlacesSearch({
      nicho: 'clínica odontológica', cidade: 'Resende', uf: 'RJ', maxResults: 3, withContacts: false,
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body).toMatchObject({
      searchStringsArray: ['clínica odontológica'],
      city: 'Resende',
      state: 'RJ',
      countryCode: 'br',
      language: 'pt-BR',
      maxCrawledPlacesPerSearch: 3,
      scrapeContacts: false,
      skipClosedPlaces: true,
    });
    expect(out.runId).toBe('run_1');
    expect(out.costUsd).toBeCloseTo(0.0125, 5);
    expect(out.places).toHaveLength(1);
  });

  it('nunca põe o token na URL, só no header Authorization', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: { id: 'run_1', defaultDatasetId: 'ds_1', usageTotalUsd: 0, status: 'SUCCEEDED' },
      }), { status: 201, headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    await runPlacesSearch({ nicho: 'x', cidade: 'Resende', uf: 'RJ', maxResults: 1, withContacts: false });

    for (const call of fetchMock.mock.calls) {
      expect(String(call[0])).not.toContain('tok_teste');
      expect((call[1].headers as Record<string, string>).Authorization).toBe('Bearer tok_teste');
    }
  });

  it('propaga erro legível quando o Apify responde com falha', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response('quota exceeded', { status: 402 })
    ));
    await expect(
      runPlacesSearch({ nicho: 'x', cidade: 'Resende', uf: 'RJ', maxResults: 1, withContacts: false })
    ).rejects.toThrow(/402/);
  });

  it('descarta registros inválidos do dataset em vez de quebrar a busca inteira', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: { id: 'run_1', defaultDatasetId: 'ds_1', usageTotalUsd: 0, status: 'SUCCEEDED' },
      }), { status: 201, headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify([
        { placeId: 'ChIJ_1', title: 'Boa' },
        { title: 'Sem placeId' },
        null,
      ]), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    const out = await runPlacesSearch({ nicho: 'x', cidade: 'Resende', uf: 'RJ', maxResults: 3, withContacts: false });
    expect(out.places).toHaveLength(1);
    expect(out.places[0].placeId).toBe('ChIJ_1');
  });

  it('marca finished=true quando o run chegou a SUCCEEDED', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: { id: 'run_1', defaultDatasetId: 'ds_1', usageTotalUsd: 0.01, status: 'SUCCEEDED' },
      }), { status: 201, headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    const out = await runPlacesSearch({ nicho: 'x', cidade: 'Resende', uf: 'RJ', maxResults: 1, withContacts: false });
    expect(out.finished).toBe(true);
  });

  it('marca finished=false quando o run ainda está RUNNING, sem lançar erro', async () => {
    // waitForFinish é o teto da conexão, não garantia de término: o Apify devolve
    // 201 com o run em andamento e um dataset possivelmente incompleto.
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: { id: 'run_1', defaultDatasetId: 'ds_1', usageTotalUsd: 0.02, status: 'RUNNING' },
      }), { status: 201, headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify([
        { placeId: 'ChIJ_1', title: 'Parcial' },
      ]), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    const out = await runPlacesSearch({ nicho: 'x', cidade: 'Resende', uf: 'RJ', maxResults: 10, withContacts: false });
    expect(out.finished).toBe(false);
    // O que veio até aqui é devolvido: o dinheiro já saiu, jogar fora seria pior.
    expect(out.places).toHaveLength(1);
    expect(out.costUsd).toBeCloseTo(0.02, 5);
  });
});
```

- [ ] **Step 2: Rodar para confirmar que falha**

Run: `npx vitest run lib/radar/apify.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/radar/apify"`.

- [ ] **Step 3: Escrever `lib/radar/apify.ts`**

```typescript
/**
 * @fileoverview Cliente HTTP do Apify para o Radar de Clientes.
 *
 * ⚠️ Este módulo lê `APIFY_TOKEN` e só pode ser importado por Route Handlers.
 * A variável NÃO tem prefixo `NEXT_PUBLIC_`, logo o Next nunca a inlina no
 * bundle do browser. O token vai apenas no header Authorization, nunca na URL,
 * para não vazar em log de proxy.
 *
 * @module lib/radar/apify
 */

import type { RadarPlace, RadarReview } from './types';

const APIFY_BASE = 'https://api.apify.com/v2';
const PLACES_ACTOR = 'compass~crawler-google-places';
const REVIEWS_ACTOR = 'compass~google-maps-reviews-scraper';

/** Lançado quando `APIFY_TOKEN` não está configurado no servidor. */
export class ApifyConfigError extends Error {
  constructor(message = 'APIFY_TOKEN não configurado no servidor.') {
    super(message);
    this.name = 'ApifyConfigError';
  }
}

function requireToken(): string {
  const token = process.env.APIFY_TOKEN;
  if (!token || !token.trim()) throw new ApifyConfigError();
  return token.trim();
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function urlList(raw: Record<string, unknown>, key: string): string[] {
  const v = raw[key];
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x.trim()) : [];
}

/**
 * Converte um registro bruto do dataset num `RadarPlace`.
 *
 * @returns `null` quando falta `placeId` ou `title` — sem eles o registro não
 *   serve nem para dedupe nem para leitura.
 */
export function mapPlace(raw: Record<string, unknown>, collectedAt: string): RadarPlace | null {
  if (!raw || typeof raw !== 'object') return null;
  const placeId = str(raw.placeId);
  const title = str(raw.title);
  if (!placeId || !title) return null;

  return {
    placeId,
    title,
    categoryName: str(raw.categoryName),
    address: str(raw.address),
    city: str(raw.city),
    phone: str(raw.phone),
    website: str(raw.website),
    socials: [
      ...urlList(raw, 'instagrams'),
      ...urlList(raw, 'facebooks'),
      ...urlList(raw, 'linkedIns'),
    ],
    totalScore: num(raw.totalScore),
    reviewsCount: num(raw.reviewsCount),
    url: str(raw.url),
    source: 'google_maps',
    collectedAt,
  };
}

/**
 * Converte uma avaliação bruta. Avaliação sem texto é descartada: ela não
 * pode virar citação literal, que é o único motivo de puxarmos avaliações.
 */
export function mapReview(raw: Record<string, unknown>): RadarReview | null {
  if (!raw || typeof raw !== 'object') return null;
  const text = str(raw.text);
  if (!text) return null;
  return {
    reviewId: str(raw.reviewId) ?? str(raw.reviewUrl) ?? text.slice(0, 40),
    text,
    stars: num(raw.stars),
    publishedAt: str(raw.publishedAtDate),
    reviewerName: str(raw.name),
  };
}

async function apifyFetch(path: string, init: RequestInit, token: string): Promise<Response> {
  const res = await fetch(`${APIFY_BASE}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init.headers as Record<string, string> | undefined),
    },
    cache: 'no-store',
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Apify respondeu ${res.status}: ${body.slice(0, 300)}`);
  }
  return res;
}

interface RunEnvelope {
  data?: {
    id?: string;
    defaultDatasetId?: string;
    usageTotalUsd?: number;
    /** SUCCEEDED, FAILED, RUNNING, TIMED-OUT, ABORTED… */
    status?: string;
  };
}

/**
 * Roda o actor de forma síncrona e devolve o run com o custo real.
 *
 * `usageTotalUsd` é o valor cobrado de verdade — nunca usar a estimativa aqui.
 *
 * ⚠️ `waitForFinish=300` é o teto de quanto tempo a API segura a conexão, e NÃO
 * garantia de que o run terminou. Estourando esse tempo, a resposta volta 201
 * com `status: 'RUNNING'` e um dataset ainda incompleto. Por isso devolvemos
 * `finished`: quem chama decide o que fazer com um resultado parcial. Aqui não
 * fazemos polling — o parcial é mostrado, e a Task 7 cuida de não cacheá-lo.
 */
async function runActorSync(
  actor: string,
  input: Record<string, unknown>,
  token: string
): Promise<{ runId: string; datasetId: string; costUsd: number; finished: boolean }> {
  const res = await apifyFetch(
    `/acts/${actor}/runs?waitForFinish=300`,
    { method: 'POST', body: JSON.stringify(input) },
    token
  );
  const json = (await res.json()) as RunEnvelope;
  const runId = json.data?.id;
  const datasetId = json.data?.defaultDatasetId;
  if (!runId || !datasetId) throw new Error('Apify não devolveu runId ou datasetId.');
  return {
    runId,
    datasetId,
    costUsd: json.data?.usageTotalUsd ?? 0,
    finished: json.data?.status === 'SUCCEEDED',
  };
}

/**
 * Lê os itens do dataset.
 *
 * Sem `limit`/`offset` a API devolve o dataset inteiro numa resposta só, que é
 * o comportamento padrão documentado. Nos volumes deste produto (no máximo 100
 * lugares por busca) isso cabe folgado; se algum dia o teto subir muito, esta
 * premissa precisa de paginação explícita.
 */
async function readDataset(datasetId: string, token: string): Promise<Record<string, unknown>[]> {
  const res = await apifyFetch(`/datasets/${datasetId}/items?clean=true&format=json`, { method: 'GET' }, token);
  const items = (await res.json()) as unknown;
  return Array.isArray(items) ? (items.filter(Boolean) as Record<string, unknown>[]) : [];
}

export interface PlacesSearchInput {
  nicho: string;
  cidade: string;
  uf: string;
  maxResults: number;
  withContacts: boolean;
}

/**
 * Busca de descoberta no Google Maps.
 *
 * `skipClosedPlaces` fica ligado porque empresa fechada não é lead, e cada
 * lugar retornado é um `place-scraped` cobrado.
 */
export async function runPlacesSearch(
  input: PlacesSearchInput
): Promise<{ runId: string; costUsd: number; finished: boolean; places: RadarPlace[] }> {
  const token = requireToken();
  const collectedAt = new Date().toISOString();

  const { runId, datasetId, costUsd, finished } = await runActorSync(
    PLACES_ACTOR,
    {
      searchStringsArray: [input.nicho],
      city: input.cidade,
      state: input.uf,
      countryCode: 'br',
      language: 'pt-BR',
      maxCrawledPlacesPerSearch: input.maxResults,
      scrapeContacts: input.withContacts,
      skipClosedPlaces: true,
    },
    token
  );

  const raw = await readDataset(datasetId, token);
  const places = raw
    .map(item => mapPlace(item, collectedAt))
    .filter((p): p is RadarPlace => p !== null);

  return { runId, costUsd, finished, places };
}

export interface ReviewsInput {
  placeId: string;
  maxReviews: number;
}

/**
 * Avaliações sob demanda de UMA empresa.
 *
 * Corte de custo por DATA, não por termo. `reviewsStartDate` é documentado sem
 * ambiguidade pelo actor (data absoluta `2024-05-03` ou relativa `8 days`,
 * `3 months`), e 180 dias é exatamente a janela que o sinal de +3 do score usa
 * — então filtrar por ela corta `review-scraped` pelo mesmo eixo que a regra de
 * negócio já aplica.
 *
 * Deliberadamente NÃO mandamos `reviewsFilterString`: a doc do actor diz
 * "keywords" no plural mas tipa o campo como `string` única, sem especificar se
 * espaço separa termos ou se a string inteira é uma frase literal. Se for frase
 * literal, o filtro casaria zero avaliações e ainda assim pagaríamos o
 * `place-details-scraped`. A filtragem por termo acontece localmente em
 * `findAnchorMatches`, que é nossa e não custa nada.
 */
export async function runReviewsScrape(
  input: ReviewsInput
): Promise<{ runId: string; costUsd: number; finished: boolean; reviews: RadarReview[] }> {
  const token = requireToken();

  const { runId, datasetId, costUsd, finished } = await runActorSync(
    REVIEWS_ACTOR,
    {
      startUrls: [{ url: `https://www.google.com/maps/place/?q=place_id:${input.placeId}` }],
      maxReviews: input.maxReviews,
      reviewsSort: 'newest',
      reviewsStartDate: '180 days',
      language: 'pt-BR',
      countryCode: 'br',
    },
    token
  );

  const raw = await readDataset(datasetId, token);
  const reviews = raw.map(mapReview).filter((r): r is RadarReview => r !== null);

  return { runId, costUsd, finished, reviews };
}
```

- [ ] **Step 4: Rodar os testes**

Run: `npx vitest run lib/radar/apify.test.ts`
Expected: PASS, 12 testes.

- [ ] **Step 5: Confirmar de novo que o token não vazou**

Run: `grep -rn "APIFY_TOKEN" --include="*.tsx" features components app/\(protected\)`
Expected: nenhuma saída.

- [ ] **Step 6: Commit**

```bash
git add lib/radar/apify.ts lib/radar/apify.test.ts
git commit -m "feat(radar): cliente Apify server-side com custo real do run"
```

---

## Task 7: Rotas de busca e de orçamento

**Files:**
- Create: `app/api/radar/search/route.ts`
- Create: `app/api/radar/budget/route.ts`
- Test: `app/api/radar/search/route.test.ts`

**Interfaces:**
- Consumes: `runPlacesSearch`, `ApifyConfigError` de `@/lib/radar/apify`; `computeScore` de `@/lib/radar/score`; `buildDedupeIndex`, `checkDuplicate` de `@/lib/radar/dedupe`; `estimateSearchCost`, `budgetVerdict`, `currentCycleStart`, `monthlyBudgetUsd` de `@/lib/radar/pricing`; `createClient` de `@/lib/supabase/server`.
- Produces:
  - `POST /api/radar/search` → `{ searchId, origin: 'live'|'cache', costUsd, cachedAt: string|null, budget: BudgetVerdict, results: RadarResultDTO[] }`
  - `GET /api/radar/budget` → `{ spentUsd, budgetUsd, cycleStart, level }`
  - `interface RadarResultDTO { id, place, score, breakdown, disqualified, disqualifyReasons, duplicate, savedDealId }` exportada de `app/api/radar/search/route.ts` para a UI tipar a resposta.

**Cache:** 30 dias por `(organization_id, nicho, cidade, uf)`. Se houver busca dentro do prazo, a rota lê `radar_results` e devolve `origin: 'cache'` com `costUsd: 0` — sem tocar no Apify.

- [ ] **Step 1: Escrever o teste (que vai falhar)**

Criar `app/api/radar/search/route.test.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest';

const runPlacesSearch = vi.fn();
const createClient = vi.fn();

vi.mock('@/lib/radar/apify', async () => {
  const actual = await vi.importActual<typeof import('@/lib/radar/apify')>('@/lib/radar/apify');
  return { ...actual, runPlacesSearch };
});
vi.mock('@/lib/supabase/server', () => ({ createClient }));

import { POST } from '@/app/api/radar/search/route';

const ORG = 'dc09e9de-2030-426b-9dcd-1beae85bac5e';
const USER = 'c2fce80e-77f6-4c85-9d41-f98d9a2aef16';

/**
 * Supabase falso. `searchRows` é o que a consulta de cache devolve,
 * `spentRows` o que a soma do ciclo devolve.
 */
function fakeSupabase(opts: {
  user?: { id: string } | null;
  searchRows?: unknown[];
  spentRows?: { cost_usd: number }[];
  resultRows?: unknown[];
}) {
  const table = (name: string) => {
    const rows =
      name === 'radar_searches'
        ? (opts.searchRows ?? [])
        : name === 'radar_results'
          ? (opts.resultRows ?? [])
          : name === 'profiles'
            ? [{ organization_id: ORG, role: 'admin' }]
            : name === 'contacts'
              ? []
              : [];
    const builder: Record<string, unknown> = {
      data: rows, error: null,
      select: () => builder, eq: () => builder, gte: () => builder,
      order: () => builder, limit: () => builder,
      insert: () => ({ select: () => ({ single: async () => ({ data: { id: 'search_1' }, error: null }) }) }),
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
      then: (r: (v: { data: unknown[]; error: null }) => unknown) => r({ data: rows, error: null }),
    };
    if (name === 'radar_searches' && opts.spentRows) {
      (builder as { gte: () => unknown }).gte = () => ({
        then: (r: (v: { data: unknown[]; error: null }) => unknown) =>
          r({ data: opts.spentRows!, error: null }),
      });
    }
    return builder;
  };
  return {
    auth: { getUser: async () => ({ data: { user: opts.user === undefined ? { id: USER } : opts.user }, error: null }) },
    from: (name: string) => table(name),
  };
}

function req(body: unknown) {
  return new Request('http://localhost/api/radar/search', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const VALID = { nicho: 'clínica odontológica', cidade: 'Resende', uf: 'RJ', maxResults: 3 };

beforeEach(() => {
  vi.clearAllMocks();
  process.env.RADAR_MONTHLY_BUDGET_USD = '5.00';
});

describe('POST /api/radar/search — autenticação', () => {
  it('responde 401 sem sessão e não chama o Apify', async () => {
    createClient.mockResolvedValue(fakeSupabase({ user: null }));
    const res = await POST(req(VALID));
    expect(res.status).toBe(401);
    expect(runPlacesSearch).not.toHaveBeenCalled();
  });
});

describe('POST /api/radar/search — validação', () => {
  it('responde 400 quando falta cidade', async () => {
    createClient.mockResolvedValue(fakeSupabase({}));
    const res = await POST(req({ ...VALID, cidade: '' }));
    expect(res.status).toBe(400);
    expect(runPlacesSearch).not.toHaveBeenCalled();
  });

  it('responde 400 quando maxResults passa do limite de segurança', async () => {
    createClient.mockResolvedValue(fakeSupabase({}));
    const res = await POST(req({ ...VALID, maxResults: 500 }));
    expect(res.status).toBe(400);
    expect(runPlacesSearch).not.toHaveBeenCalled();
  });
});

describe('POST /api/radar/search — teto de gasto', () => {
  it('responde 402 e não chama o Apify quando o ciclo já estourou o teto', async () => {
    createClient.mockResolvedValue(fakeSupabase({ spentRows: [{ cost_usd: 5.0 }] }));
    const res = await POST(req(VALID));
    expect(res.status).toBe(402);
    expect(runPlacesSearch).not.toHaveBeenCalled();
  });
});

describe('POST /api/radar/search — cache', () => {
  it('serve do banco sem chamar o Apify quando há busca dos últimos 30 dias', async () => {
    const ontem = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    createClient.mockResolvedValue(fakeSupabase({
      searchRows: [{ id: 'search_antiga', created_at: ontem }],
      resultRows: [{
        id: 'res_1', place_id: 'ChIJ_1',
        payload: { placeId: 'ChIJ_1', title: 'Clínica A', source: 'google_maps', collectedAt: ontem, socials: [] },
        score: 5, score_breakdown: [], disqualified: false, disqualify_reasons: [], saved_deal_id: null,
      }],
    }));
    const res = await POST(req(VALID));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.origin).toBe('cache');
    expect(json.costUsd).toBe(0);
    expect(json.cachedAt).toBe(ontem);
    expect(runPlacesSearch).not.toHaveBeenCalled();
  });
});

describe('POST /api/radar/search — execução ao vivo', () => {
  it('chama o Apify, pontua e devolve o custo REAL do run, não a estimativa', async () => {
    createClient.mockResolvedValue(fakeSupabase({}));
    runPlacesSearch.mockResolvedValue({
      runId: 'run_1',
      costUsd: 0.0131,
      places: [{
        placeId: 'ChIJ_1', title: 'Clínica A', categoryName: 'Clínica odontológica',
        address: null, city: 'Resende', phone: '+552433001122', website: null, socials: [],
        totalScore: 4.2, reviewsCount: 90, url: null,
        source: 'google_maps', collectedAt: '2026-08-31T00:00:00.000Z',
      }],
    });

    const res = await POST(req(VALID));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.origin).toBe('live');
    expect(json.costUsd).toBeCloseTo(0.0131, 5);
    expect(json.results).toHaveLength(1);
    expect(json.results[0].score).toBeGreaterThan(0);
    expect(json.results[0].breakdown.length).toBe(5);
  });

  it('nunca deixa maxResults acima do teto passar para o actor', async () => {
    createClient.mockResolvedValue(fakeSupabase({}));
    runPlacesSearch.mockResolvedValue({ runId: 'run_1', costUsd: 0, places: [] });
    await POST(req({ ...VALID, maxResults: 20 }));
    expect(runPlacesSearch).toHaveBeenCalledWith(
      expect.objectContaining({ maxResults: 20, nicho: 'clínica odontológica' })
    );
  });

  it('responde 503 com mensagem clara quando o token não está configurado', async () => {
    const { ApifyConfigError } = await vi.importActual<typeof import('@/lib/radar/apify')>('@/lib/radar/apify');
    createClient.mockResolvedValue(fakeSupabase({}));
    runPlacesSearch.mockRejectedValue(new ApifyConfigError());
    const res = await POST(req(VALID));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatch(/APIFY_TOKEN/);
  });
});
```

- [ ] **Step 2: Rodar para confirmar que falha**

Run: `npx vitest run app/api/radar/search/route.test.ts`
Expected: FAIL — `Failed to resolve import "@/app/api/radar/search/route"`.

- [ ] **Step 3: Escrever `app/api/radar/search/route.ts`**

```typescript
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
  withContacts: z.boolean().optional().default(false),
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
        // Busca parcial nunca serve de cache: a lista pode estar incompleta.
        .eq('partial', false)
        .gte('created_at', cutoff)
        .order('created_at', { ascending: false })
        .limit(1);

      const hit = (cached ?? [])[0] as { id: string; created_at: string } | undefined;
      if (hit) {
        const { data: rows } = await supabase
          .from('radar_results')
          .select('id, place_id, payload, score, score_breakdown, disqualified, disqualify_reasons, saved_deal_id')
          .eq('search_id', hit.id)
          .eq('organization_id', organizationId);

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
      const s = computeScore(place); // sem avaliações: o +3 fica pendente
      const duplicate = checkDuplicate({ placeId: place.placeId, phone: place.phone }, index);
      return { place, s, duplicate };
    });

    // Se a gravação falhar depois de um run pago, o custo já foi debitado e
    // não há como desfazer: a busca fica marcada `partial` para nunca ser
    // servida do cache (ver comentário no schema de SearchResponse.partial),
    // mas a resposta a ESTA requisição ainda devolve os resultados em
    // memória — um run pago não pode simplesmente sumir da tela do usuário.
    // `tryWrite` (de `lib/radar/supabaseWrite.ts`) checa `error` sem lançar —
    // a rota PRECISA continuar e compensar (marcar `partial`), não abortar.
    let persistFailed = false;
    if (scored.length > 0) {
      const upsertOutcome = await tryWrite(
        supabase.from('radar_results').upsert(
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
        ),
        `gravar radar_results para search_id=${searchId}`
      );

      if (!upsertOutcome.success) {
        persistFailed = true;
        console.error(`[radar/search] falha ao ${upsertOutcome.message}`);
        const updateOutcome = await tryWrite(
          supabase
            .from('radar_searches')
            .update({ partial: true })
            .eq('id', searchId)
            .eq('organization_id', organizationId),
          `compensar: marcar search_id=${searchId} como partial failed`
        );

        if (!updateOutcome.success) {
          console.error(`[radar/search] falha ao ${updateOutcome.message}`);
        }
      }
    }

    const { data: savedRows } = await supabase
      .from('radar_results')
      .select('id, place_id, saved_deal_id')
      .eq('search_id', searchId)
      .eq('organization_id', organizationId);
    const byPlace = new Map(
      ((savedRows ?? []) as { id: string; place_id: string; saved_deal_id: string | null }[])
        .map(r => [r.place_id, r])
    );

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
```

- [ ] **Step 4: Escrever `app/api/radar/budget/route.ts`**

```typescript
/**
 * @fileoverview Acumulado de gasto do Radar no ciclo vigente.
 * @module app/api/radar/budget/route
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { budgetVerdict, currentCycleStart, monthlyBudgetUsd } from '@/lib/radar/pricing';

export async function GET() {
  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', auth.user.id)
    .maybeSingle();

  const organizationId = (profile as { organization_id?: string } | null)?.organization_id;
  if (!organizationId) {
    return NextResponse.json({ error: 'Organização não identificada.' }, { status: 403 });
  }

  const cycleStart = currentCycleStart(new Date());
  const { data } = await supabase
    .from('radar_searches')
    .select('cost_usd')
    .eq('organization_id', organizationId)
    .gte('created_at', cycleStart.toISOString());

  const spentUsd = ((data ?? []) as { cost_usd: number | string }[])
    .reduce((acc, r) => acc + Number(r.cost_usd ?? 0), 0);

  const verdict = budgetVerdict({ spentUsd, estimateUsd: 0, budgetUsd: monthlyBudgetUsd() });

  return NextResponse.json({
    spentUsd,
    budgetUsd: verdict.budgetUsd,
    remainingUsd: verdict.remainingUsd,
    level: verdict.level,
    cycleStart: cycleStart.toISOString(),
  });
}
```

- [ ] **Step 5: Rodar os testes**

Run: `npx vitest run app/api/radar/search/route.test.ts`
Expected: PASS, 8 testes.

- [ ] **Step 6: Commit**

```bash
git add app/api/radar/search/route.ts app/api/radar/search/route.test.ts app/api/radar/budget/route.ts
git commit -m "feat(radar): rota de busca com cache 30d, teto de gasto e custo real gravado"
```

---

## Task 8: Hooks TanStack Query

**Files:**
- Create: `lib/query/hooks/useRadarQuery.ts`
- Test: `lib/query/hooks/useRadarQuery.test.ts`

**Interfaces:**
- Consumes: `SearchResponse`, `RadarResultDTO` de `@/app/api/radar/search/route`.
- Produces:
  - `RADAR_BUDGET_KEY: readonly ['radar','budget']`
  - `useRadarBudget(): UseQueryResult<BudgetSnapshot>` com `interface BudgetSnapshot { spentUsd, budgetUsd, remainingUsd, level, cycleStart }`
  - `useRadarSearch(): UseMutationResult<SearchResponse, Error, RadarSearchVars>` com `interface RadarSearchVars { nicho, cidade, uf, maxResults, withContacts?, refresh? }`
  - `useRadarReviews(): UseMutationResult<{ reviews: RadarReview[]; costUsd: number }, Error, { resultId: string; maxReviews: number }>`

**A regra que este arquivo existe para garantir:** a busca é `useMutation`, nunca `useQuery`. Uma `useQuery` com key derivada do formulário dispararia a cada tecla e queimaria o teto em minutos.

- [ ] **Step 1: Escrever o teste (que vai falhar)**

Criar `lib/query/hooks/useRadarQuery.test.ts`:

```typescript
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useRadarSearch, useRadarBudget, RADAR_BUDGET_KEY } from '@/lib/query/hooks/useRadarQuery';

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client }, children);
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('useRadarSearch', () => {
  it('NÃO chama a rede ao montar — a busca só roda no clique', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    renderHook(() => useRadarSearch(), { wrapper });

    // Espera um tick para dar chance a qualquer efeito de disparar.
    await new Promise(r => setTimeout(r, 20));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('chama POST /api/radar/search quando mutateAsync é invocado', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ searchId: 's1', origin: 'live', costUsd: 0.01, cachedAt: null, budget: {}, results: [] }),
        { status: 200, headers: { 'content-type': 'application/json' } })
    );
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useRadarSearch(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ nicho: 'clínica odontológica', cidade: 'Resende', uf: 'RJ', maxResults: 3 });
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/radar/search');
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'POST' });
  });

  it('transforma resposta de erro em Error com a mensagem do servidor', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'Teto mensal de US$ 5.00 atingido.' }),
        { status: 402, headers: { 'content-type': 'application/json' } })
    ));

    const { result } = renderHook(() => useRadarSearch(), { wrapper });

    await expect(
      act(async () => {
        await result.current.mutateAsync({ nicho: 'x', cidade: 'Resende', uf: 'RJ', maxResults: 3 });
      })
    ).rejects.toThrow(/Teto mensal/);
  });
});

describe('useRadarBudget', () => {
  it('busca o orçamento do ciclo por GET', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ spentUsd: 1.3, budgetUsd: 5, remainingUsd: 3.7, level: 'ok', cycleStart: '2026-08-16T00:00:00.000Z' }),
        { status: 200, headers: { 'content-type': 'application/json' } })
    );
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useRadarBudget(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toMatchObject({ spentUsd: 1.3, budgetUsd: 5, level: 'ok' });
    expect(fetchMock.mock.calls[0][0]).toBe('/api/radar/budget');
  });
});

describe('RADAR_BUDGET_KEY', () => {
  it('é estável, para a busca poder invalidar o orçamento depois de gastar', () => {
    expect(RADAR_BUDGET_KEY).toEqual(['radar', 'budget']);
  });
});
```

- [ ] **Step 2: Rodar para confirmar que falha**

Run: `npx vitest run lib/query/hooks/useRadarQuery.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/query/hooks/useRadarQuery"`.

- [ ] **Step 3: Escrever `lib/query/hooks/useRadarQuery.ts`**

```typescript
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
import type { RadarReview } from '@/lib/radar/types';

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
    { reviews: RadarReview[]; costUsd: number },
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
```

- [ ] **Step 4: Rodar os testes**

Run: `npx vitest run lib/query/hooks/useRadarQuery.test.ts`
Expected: PASS, 5 testes.

- [ ] **Step 5: Commit**

```bash
git add lib/query/hooks/useRadarQuery.ts lib/query/hooks/useRadarQuery.test.ts
git commit -m "feat(radar): hooks de busca por mutation e orcamento do ciclo"
```

---

## Task 9: Rota de avaliações sob demanda

**Files:**
- Create: `app/api/radar/reviews/route.ts`

**Interfaces:**
- Consumes: `runReviewsScrape` de `@/lib/radar/apify`; `computeScore` de `@/lib/radar/score`; `rankReviewsByAnchor` de `@/lib/radar/anchors`; `estimateReviewsCost`, `budgetVerdict`, `currentCycleStart`, `monthlyBudgetUsd` de `@/lib/radar/pricing`.
- Produces: `POST /api/radar/reviews` → `{ reviews: RadarReview[]; costUsd: number; score: number; breakdown: ScoreBreakdownItem[] }`

**Comportamento:** se `radar_results.reviews_fetched_at` já estiver preenchido, devolve do banco com `costUsd: 0` — reabrir uma empresa já lida não gasta nada, mesmo quando a coleta anterior devolveu zero avaliações (a checagem é sobre TER buscado, nunca sobre `reviews.length > 0`, senão uma empresa sem avaliações batendo com o âncora seria recobrada para sempre). Depois de puxar, recalcula o score **com** as avaliações (o +3 sai de pendente) e regrava `score` e `score_breakdown`. O `placeId` usado no scrape é sempre o da linha `radar_results` já autorizada (`place.placeId`) — nunca um valor vindo do corpo da requisição, que não é aceito no schema.

- [ ] **Step 1: Escrever a rota**

```typescript
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
import { tryWrite } from '@/lib/radar/supabaseWrite';
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
    const { resultId, maxReviews } = parsed.data;

    const { data: profile } = await supabase
      .from('profiles').select('organization_id').eq('id', auth.user.id).maybeSingle();
    const organizationId = (profile as { organization_id?: string } | null)?.organization_id;
    if (!organizationId) {
      return NextResponse.json({ error: 'Organização não identificada.' }, { status: 403 });
    }

    const { data: row } = await supabase
      .from('radar_results')
      .select('id, payload, reviews, reviews_fetched_at')
      .eq('id', resultId)
      .eq('organization_id', organizationId)
      .maybeSingle();

    if (!row) return NextResponse.json({ error: 'Empresa não encontrada.' }, { status: 404 });

    const place = (row as { payload: RadarPlace }).payload;
    const cached = (row as { reviews: RadarReview[] | null }).reviews;
    const fetchedAt = (row as { reviews_fetched_at: string | null }).reviews_fetched_at;

    // Já buscadas antes — mesmo que o resultado tenha sido zero avaliações —
    // devolve do banco, sem gastar. A checagem é sobre TER buscado, não sobre
    // quantas avaliações vieram: `cached.length > 0` recobraria para sempre uma
    // empresa que legitimamente não tem avaliações batendo com o âncora.
    if (fetchedAt) {
      const reviews = cached ?? [];
      const s = computeScore(place, { reviews });
      // Já vem ordenado do momento em que foi gravado — reordenar de novo é
      // trabalho redundante numa ordenação pura.
      return NextResponse.json({
        reviews,
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

    // O placeId vem SEMPRE da linha autorizada, nunca do corpo da requisição —
    // um placeId arbitrário no body cobraria a organização por um lugar
    // diferente e gravaria avaliações alheias dentro deste registro.
    const run = await runReviewsScrape({ placeId: place.placeId, maxReviews });
    const ranked = rankReviewsByAnchor(run.reviews);
    const s = computeScore(place, { reviews: ranked });

    // O gasto entra no acumulado do ciclo como uma "busca" de origem live.
    // Marcada como parcial quando o run não chegou a SUCCEEDED — o dinheiro saiu
    // e precisa contar, mas a linha não representa uma coleta completa.
    // `tryWrite` checa `error` sem lançar — a rota registra o log e segue.
    const insertOutcome = await tryWrite(
      supabase.from('radar_searches').insert({
        organization_id: organizationId,
        nicho: `avaliações: ${place.title}`,
        cidade: place.city ?? '-',
        uf: '--',
        params: { kind: 'reviews', placeId: place.placeId, maxReviews },
        apify_run_id: run.runId,
        cost_usd: run.costUsd,
        origin: 'live',
        partial: !run.finished,
        places_count: 1,
        created_by: auth.user.id,
      }),
      `registrar gasto em radar_searches — organização ${organizationId}, run ${run.runId}, costUsd ${run.costUsd} NÃO CONTABILIZADO`
    );
    if (!insertOutcome.success) {
      // Esse gasto já saiu no Apify e some do teto do ciclo se não for
      // reconciliado à mão — visibilidade máxima.
      console.error(`[radar/reviews] FALHA ao ${insertOutcome.message}`);
    }

    // Só persistimos as avaliações quando o run terminou. Um resultado parcial
    // gravado aqui viraria cache permanente: a checagem lá em cima devolve o que
    // estiver em `reviews` sem nunca reconsultar o Apify, então uma coleta pela
    // metade ficaria congelada para sempre. Devolvemos o parcial para leitura,
    // sem gravar, e a próxima tentativa busca de novo.
    let persisted = false;
    if (run.finished) {
      const updateOutcome = await tryWrite(
        supabase
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
          .eq('organization_id', organizationId),
        `gravar avaliações em radar_results ${resultId}`
      );
      if (updateOutcome.success) {
        persisted = true;
      } else {
        console.error(`[radar/reviews] FALHA ao ${updateOutcome.message}`);
      }
    }

    return NextResponse.json({
      reviews: ranked,
      costUsd: run.costUsd,
      score: s.score,
      breakdown: s.breakdown,
      // Reflete o que realmente foi gravado, não apenas se o run terminou —
      // um update que falhou não pode ser reportado como sucesso.
      persisted,
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
```

- [ ] **Step 2: Verificar tipos**

Run: `npm run typecheck`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add app/api/radar/reviews/route.ts
git commit -m "feat(radar): avaliacoes sob demanda com filtro do ancora e recalculo do score"
```

---

## Task 10: Tela — formulário, estimativa e lista

**Files:**
- Create: `app/(protected)/radar/page.tsx`
- Create: `features/radar/RadarPage.tsx`
- Create: `features/radar/components/SearchForm.tsx`
- Create: `features/radar/components/CostEstimate.tsx`
- Create: `features/radar/components/ScoreBreakdown.tsx`
- Create: `features/radar/components/ResultCard.tsx`
- Modify: `components/Layout.tsx:305-313`

**Interfaces:**
- Consumes: `useRadarSearch`, `useRadarBudget` de `@/lib/query/hooks/useRadarQuery`; `estimateSearchCost` de `@/lib/radar/pricing`; `RadarResultDTO` de `@/app/api/radar/search/route`.
- Produces: componentes React. `SearchForm` chama `onSubmit(vars: RadarSearchVars)`; `ResultCard` chama `onOpenReviews(result: RadarResultDTO)` e `onSave(result: RadarResultDTO)`.

- [ ] **Step 1: Criar o shell da rota**

`app/(protected)/radar/page.tsx`:

```typescript
import type { Metadata } from 'next';
import { RadarPage } from '@/features/radar/RadarPage';

export const metadata: Metadata = { title: 'Radar | NossoCRM' };

export default function Radar() {
    return <RadarPage />;
}
```

- [ ] **Step 2: Adicionar o item de menu**

Em `components/Layout.tsx`, importar `Radar` de `lucide-react` junto dos outros ícones, e inserir a linha logo após a de Contatos (linha 309):

```typescript
            { to: '/radar', icon: Radar, label: 'Radar', prefetch: undefined, badge: undefined, adminOnly: true },
```

- [ ] **Step 3: Escrever `features/radar/components/ScoreBreakdown.tsx`**

```typescript
'use client';

import { cn } from '@/lib/utils';
import type { ScoreBreakdownItem } from '@/lib/radar/types';

/**
 * Mostra de onde veio cada ponto. O score nunca aparece sozinho — um número
 * opaco não é auditável, e a qualificação final é de quem lê.
 */
export function ScoreBreakdown({
    score,
    breakdown,
    disqualifyReasons,
}: {
    score: number;
    breakdown: ScoreBreakdownItem[];
    disqualifyReasons: string[];
}) {
    return (
        <div className="space-y-1 text-xs">
            <div className="font-semibold text-slate-700 dark:text-slate-200">
                Score {score}
            </div>
            <ul className="space-y-0.5">
                {breakdown.map((item) => (
                    <li
                        key={item.label}
                        className={cn(
                            'flex items-baseline justify-between gap-2',
                            item.matched ? 'text-slate-700 dark:text-slate-200' : 'text-slate-400 dark:text-slate-500'
                        )}
                    >
                        <span>
                            {item.label}
                            {item.pending && (
                                <span className="ml-1 italic">— pendente, puxe as avaliações</span>
                            )}
                        </span>
                        <span className="tabular-nums font-medium">
                            {item.points > 0 ? `+${item.points}` : '0'}
                        </span>
                    </li>
                ))}
            </ul>
            {disqualifyReasons.length > 0 && (
                <ul className="mt-2 space-y-0.5 text-red-600 dark:text-red-400">
                    {disqualifyReasons.map((r) => (
                        <li key={r}>Desqualifica: {r}</li>
                    ))}
                </ul>
            )}
        </div>
    );
}
```

- [ ] **Step 4: Escrever `features/radar/components/CostEstimate.tsx`**

```typescript
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
```

- [ ] **Step 5: Escrever `features/radar/components/SearchForm.tsx`**

```typescript
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { CostEstimate, isSearchAllowed } from './CostEstimate';
import type { BudgetSnapshot, RadarSearchVars } from '@/lib/query/hooks/useRadarQuery';

/**
 * Quantidades oferecidas na tela: 10 a 100, de 10 em 10.
 *
 * A rota aceita a partir de 1, para permitir teste barato em desenvolvimento,
 * mas a tela não oferece valores menores — abaixo de 10 a busca não rende uma
 * fila de leitura útil. A 100 lugares o custo é de cerca de US$ 0,40.
 */
const RESULT_OPTIONS = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

/** Nichos do ICP oferecidos como atalho. O campo aceita texto livre. */
const NICHOS_ICP = [
    'clínica odontológica',
    'clínica de estética',
    'pet shop',
    'oficina mecânica',
    'academia',
    'salão de beleza',
    'escritório de contabilidade',
    'imobiliária',
];

export interface SearchFilters {
    semSite: boolean;
    semRedeSocial: boolean;
    notaMin: number | null;
    notaMax: number | null;
    minAvaliacoes: number | null;
    ordenarPor: 'avaliacoes' | 'nota' | 'score';
}

/**
 * Formulário de busca.
 *
 * ⚠️ Nada aqui dispara rede. O estado é local e só o clique em Buscar chama
 * `onSubmit`. Buscar enquanto digita queimaria o teto do mês em minutos.
 */
export function SearchForm({
    budget,
    isBudgetLoading,
    isBudgetError,
    isSearching,
    filters,
    onFiltersChange,
    onSubmit,
}: {
    budget: BudgetSnapshot | undefined;
    isBudgetLoading: boolean;
    isBudgetError: boolean;
    isSearching: boolean;
    filters: SearchFilters;
    onFiltersChange: (f: SearchFilters) => void;
    onSubmit: (vars: RadarSearchVars) => void;
}) {
    const [nicho, setNicho] = useState('');
    const [cidade, setCidade] = useState('');
    const [uf, setUf] = useState('RJ');
    const [maxResults, setMaxResults] = useState(RESULT_OPTIONS[0]);
    const [withContacts, setWithContacts] = useState(false);

    const camposOk = nicho.trim().length > 0 && cidade.trim().length > 0 && uf.trim().length === 2;
    const dentroDoTeto = isSearchAllowed(maxResults, withContacts, budget);
    const podeBuscar = camposOk && dentroDoTeto && !isSearching;

    return (
        <form
            className="space-y-4"
            onSubmit={(e) => {
                e.preventDefault();
                if (!podeBuscar) return;
                onSubmit({ nicho: nicho.trim(), cidade: cidade.trim(), uf: uf.trim().toUpperCase(), maxResults, withContacts });
            }}
        >
            <div className="space-y-1">
                <Label htmlFor="radar-nicho">Nicho</Label>
                <Input
                    id="radar-nicho"
                    value={nicho}
                    onChange={(e) => setNicho(e.target.value)}
                    placeholder="clínica odontológica"
                    list="radar-nichos-icp"
                />
                <datalist id="radar-nichos-icp">
                    {NICHOS_ICP.map((n) => (
                        <option key={n} value={n} />
                    ))}
                </datalist>
            </div>

            <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2 space-y-1">
                    <Label htmlFor="radar-cidade">Cidade</Label>
                    <Input id="radar-cidade" value={cidade} onChange={(e) => setCidade(e.target.value)} placeholder="Resende" />
                </div>
                <div className="space-y-1">
                    <Label htmlFor="radar-uf">UF</Label>
                    <Input id="radar-uf" value={uf} maxLength={2} onChange={(e) => setUf(e.target.value.toUpperCase())} />
                </div>
            </div>

            <div className="space-y-1">
                <Label htmlFor="radar-max">Máximo de resultados</Label>
                <select
                    id="radar-max"
                    className="w-full rounded-md border border-slate-200 bg-transparent p-2 text-sm dark:border-slate-700"
                    value={maxResults}
                    onChange={(e) => setMaxResults(Number(e.target.value))}
                >
                    {RESULT_OPTIONS.map((n) => (
                        <option key={n} value={n}>{n}</option>
                    ))}
                </select>
            </div>

            <div className="flex items-center justify-between">
                <Label htmlFor="radar-contatos" className="text-sm font-normal">
                    Enriquecer contatos pelo site (+US$ 0,002 por empresa)
                </Label>
                <Switch id="radar-contatos" checked={withContacts} onCheckedChange={setWithContacts} />
            </div>

            <fieldset className="space-y-2 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                <legend className="px-1 text-xs text-slate-500 dark:text-slate-400">
                    Filtros de descoberta — ordenam a fila de leitura, não qualificam
                </legend>
                <div className="flex items-center justify-between">
                    <Label htmlFor="radar-sem-site" className="text-sm font-normal">Sem site</Label>
                    <Switch
                        id="radar-sem-site"
                        checked={filters.semSite}
                        onCheckedChange={(v) => onFiltersChange({ ...filters, semSite: v })}
                    />
                </div>
                <div className="flex items-center justify-between">
                    <Label htmlFor="radar-sem-social" className="text-sm font-normal">Sem rede social</Label>
                    <Switch
                        id="radar-sem-social"
                        checked={filters.semRedeSocial}
                        onCheckedChange={(v) => onFiltersChange({ ...filters, semRedeSocial: v })}
                    />
                </div>
                <div className="grid grid-cols-3 gap-2">
                    <div className="space-y-1">
                        <Label htmlFor="radar-nota-min" className="text-xs">Nota mín.</Label>
                        <Input
                            id="radar-nota-min" type="number" step="0.1" min={0} max={5}
                            value={filters.notaMin ?? ''}
                            onChange={(e) => onFiltersChange({ ...filters, notaMin: e.target.value === '' ? null : Number(e.target.value) })}
                        />
                    </div>
                    <div className="space-y-1">
                        <Label htmlFor="radar-nota-max" className="text-xs">Nota máx.</Label>
                        <Input
                            id="radar-nota-max" type="number" step="0.1" min={0} max={5}
                            value={filters.notaMax ?? ''}
                            onChange={(e) => onFiltersChange({ ...filters, notaMax: e.target.value === '' ? null : Number(e.target.value) })}
                        />
                    </div>
                    <div className="space-y-1">
                        <Label htmlFor="radar-min-aval" className="text-xs">Mín. aval.</Label>
                        <Input
                            id="radar-min-aval" type="number" min={0}
                            value={filters.minAvaliacoes ?? ''}
                            onChange={(e) => onFiltersChange({ ...filters, minAvaliacoes: e.target.value === '' ? null : Number(e.target.value) })}
                        />
                    </div>
                </div>
                <div className="space-y-1">
                    <Label htmlFor="radar-ordem" className="text-xs">Ordenar por</Label>
                    <select
                        id="radar-ordem"
                        className="w-full rounded-md border border-slate-200 bg-transparent p-2 text-sm dark:border-slate-700"
                        value={filters.ordenarPor}
                        onChange={(e) => onFiltersChange({ ...filters, ordenarPor: e.target.value as SearchFilters['ordenarPor'] })}
                    >
                        <option value="score">Score</option>
                        <option value="avaliacoes">Número de avaliações</option>
                        <option value="nota">Nota</option>
                    </select>
                </div>
            </fieldset>

            <CostEstimate
                maxResults={maxResults}
                withContacts={withContacts}
                budget={budget}
                isBudgetLoading={isBudgetLoading}
                isBudgetError={isBudgetError}
            />

            <Button type="submit" disabled={!podeBuscar} className="w-full">
                {isSearching ? 'Buscando…' : 'Buscar'}
            </Button>
        </form>
    );
}
```

- [ ] **Step 6: Escrever `features/radar/components/ResultCard.tsx`**

```typescript
'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { ScoreBreakdown } from './ScoreBreakdown';
import type { RadarResultDTO } from '@/app/api/radar/search/route';

export function ResultCard({
    result,
    onOpenReviews,
    onSave,
}: {
    result: RadarResultDTO;
    onOpenReviews: (r: RadarResultDTO) => void;
    onSave: (r: RadarResultDTO) => void;
}) {
    const p = result.place;

    return (
        <Card className={cn('p-4 space-y-3', result.disqualified && 'opacity-70')}>
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <h3 className="truncate font-semibold">{p.title}</h3>
                    <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                        {p.categoryName ?? 'Sem categoria'}
                        {p.address ? ` · ${p.address}` : ''}
                    </p>
                </div>
                <div className="flex shrink-0 gap-1">
                    {result.disqualified && <Badge variant="destructive">Desqualificada</Badge>}
                    {result.duplicate.isDuplicate && <Badge variant="secondary">Já está no CRM</Badge>}
                    {result.savedDealId && <Badge>Salva</Badge>}
                </div>
            </div>

            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <div className="flex justify-between"><dt className="text-slate-500">Nota</dt><dd className="tabular-nums">{p.totalScore ?? '—'}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">Avaliações</dt><dd className="tabular-nums">{p.reviewsCount ?? '—'}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">Telefone</dt><dd className="truncate">{p.phone ?? '—'}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">Site</dt><dd className="truncate">{p.website ? 'sim' : 'não'}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">Redes</dt><dd className="truncate">{p.socials.length > 0 ? p.socials.length : 'não'}</dd></div>
            </dl>

            <ScoreBreakdown
                score={result.score}
                breakdown={result.breakdown}
                disqualifyReasons={result.disqualifyReasons}
            />

            <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => onOpenReviews(result)}>
                    Ler avaliações
                </Button>
                <Button size="sm" onClick={() => onSave(result)}>
                    Salvar no CRM
                </Button>
            </div>
        </Card>
    );
}
```

- [ ] **Step 7: Escrever `features/radar/RadarPage.tsx`**

```typescript
'use client';

import { useMemo, useState } from 'react';
import { Radar as RadarIcon } from 'lucide-react';
import { useRadarBudget, useRadarSearch } from '@/lib/query/hooks/useRadarQuery';
import { EmptyState } from '@/components/ui/EmptyState';
import { SearchForm, type SearchFilters } from './components/SearchForm';
import { ResultCard } from './components/ResultCard';
import type { RadarResultDTO } from '@/app/api/radar/search/route';

const FILTROS_INICIAIS: SearchFilters = {
    semSite: false,
    semRedeSocial: false,
    notaMin: null,
    notaMax: null,
    minAvaliacoes: null,
    ordenarPor: 'score',
};

/**
 * Aplica os filtros de descoberta e a ordenação.
 *
 * ⚠️ Isto NUNCA remove empresa desqualificada da lista: ela aparece marcada,
 * porque sumir com ela esconderia o motivo. Filtro aqui é fila de leitura.
 */
function aplicarFiltros(results: RadarResultDTO[], f: SearchFilters): RadarResultDTO[] {
    const filtrados = results.filter((r) => {
        const p = r.place;
        if (f.semSite && p.website) return false;
        if (f.semRedeSocial && p.socials.length > 0) return false;
        if (f.notaMin !== null && (p.totalScore ?? 0) < f.notaMin) return false;
        if (f.notaMax !== null && (p.totalScore ?? 0) > f.notaMax) return false;
        if (f.minAvaliacoes !== null && (p.reviewsCount ?? 0) < f.minAvaliacoes) return false;
        return true;
    });

    return [...filtrados].sort((a, b) => {
        if (f.ordenarPor === 'nota') return (b.place.totalScore ?? 0) - (a.place.totalScore ?? 0);
        if (f.ordenarPor === 'avaliacoes') return (b.place.reviewsCount ?? 0) - (a.place.reviewsCount ?? 0);
        return b.score - a.score;
    });
}

export function RadarPage() {
    const { data: budget, isLoading: isBudgetLoading, isError: isBudgetError } = useRadarBudget();
    const search = useRadarSearch();
    const [filters, setFilters] = useState<SearchFilters>(FILTROS_INICIAIS);

    const results = search.data?.results ?? [];
    const visiveis = useMemo(() => aplicarFiltros(results, filters), [results, filters]);

    return (
        <div className="grid gap-6 p-4 lg:grid-cols-[320px_1fr]">
            <aside className="space-y-4">
                <div>
                    <h1 className="text-xl font-semibold">Radar de Clientes</h1>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                        Busca empresas no Google Maps. Só entra no CRM com citação literal e data.
                    </p>
                </div>
                <SearchForm
                    budget={budget}
                    isBudgetLoading={isBudgetLoading}
                    isBudgetError={isBudgetError}
                    isSearching={search.isPending}
                    filters={filters}
                    onFiltersChange={setFilters}
                    onSubmit={(vars) => search.mutate(vars)}
                />
            </aside>

            <section className="space-y-3">
                {search.isError && (
                    <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">
                        {search.error.message}
                    </div>
                )}

                {search.data && (
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                        {search.data.origin === 'cache'
                            ? `Resultado do cache, buscado em ${new Date(search.data.cachedAt!).toLocaleString('pt-BR')}. Não gastou nada.`
                            : `Busca ao vivo. Custo real: US$ ${search.data.costUsd.toFixed(4)}.`}
                        {' '}
                        {visiveis.length} de {results.length} empresas visíveis com os filtros atuais.
                    </p>
                )}

                {!search.data && !search.isPending && (
                    <EmptyState
                        icon={RadarIcon}
                        title="Nenhuma busca ainda"
                        description="Preencha nicho e cidade e clique em Buscar. A busca só roda no clique — nada é consultado enquanto você digita."
                    />
                )}

                <div className="grid gap-3 md:grid-cols-2">
                    {visiveis.map((r) => (
                        <ResultCard
                            key={r.id}
                            result={r}
                            onOpenReviews={() => { /* Task 11 */ }}
                            onSave={() => { /* Task 11 */ }}
                        />
                    ))}
                </div>
            </section>
        </div>
    );
}
```

- [ ] **Step 8: Verificar lint e tipos**

Run: `npm run lint && npm run typecheck`
Expected: sem erros nem warnings.

Assinaturas já conferidas contra o repo: `EmptyState` exige `icon: LucideIcon` além de `title` e `description?`; `Badge` aceita as variantes `default`, `secondary`, `destructive` e `outline` — todas as usadas aqui existem.

- [ ] **Step 9: Commit**

```bash
git add "app/(protected)/radar" features/radar components/Layout.tsx
git commit -m "feat(radar): tela de busca com estimativa de custo e lista pontuada"
```

---

## Task 11: Painel de avaliações e salvamento com citação obrigatória

**Files:**
- Create: `features/radar/components/ReviewsPanel.tsx`
- Create: `features/radar/components/SaveToCrmModal.tsx`
- Modify: `features/radar/RadarPage.tsx`
- Test: `test/stories/radar-salvar-exige-citacao.test.tsx`

**Interfaces:**
- Consumes: `useRadarReviews` de `@/lib/query/hooks/useRadarQuery`; `findAnchorMatches` de `@/lib/radar/anchors`; `useCreateDealWithContact` de `@/lib/query/hooks/useDealsQuery`; `useDefaultBoard` de `@/lib/query/hooks/useBoardsQuery`; `dealNotesService` de `@/lib/supabase/dealNotes`; `useAuth` de `@/context/AuthContext`.
- Produces: `ReviewsPanel`, `SaveToCrmModal`.

**A regra deste task:** o botão de confirmar em `SaveToCrmModal` fica `disabled` enquanto `citacao.trim()` for vazio. Não existe outro caminho na tela que crie deal.

- [ ] **Step 1: Escrever a story (que vai falhar)**

Criar `test/stories/radar-salvar-exige-citacao.test.tsx`:

```typescript
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { SaveToCrmModal } from '@/features/radar/components/SaveToCrmModal';
import type { RadarResultDTO } from '@/app/api/radar/search/route';

const criarDeal = vi.fn().mockResolvedValue({ id: 'deal_1' });

vi.mock('@/lib/query/hooks/useDealsQuery', () => ({
    useCreateDealWithContact: () => ({ mutateAsync: criarDeal, isPending: false }),
}));
vi.mock('@/lib/query/hooks/useBoardsQuery', () => ({
    useDefaultBoard: () => ({
        data: {
            id: 'b0a1d000-0000-4000-8000-0000000000ff',
            name: 'Prospecção R.A.F.O',
            stages: [
                { id: 'b0a1d000-0000-4000-8000-000000000000', label: 'Radar', order: 0 },
                { id: 'b0a1d000-0000-4000-8000-000000000001', label: 'Abordado', order: 1 },
            ],
        },
    }),
}));
vi.mock('@/context/AuthContext', () => ({
    useAuth: () => ({ user: { id: 'u1', email: 'ric2bam@gmail.com' }, profile: { nickname: 'Ricardo' }, organizationId: 'org1' }),
}));
const createNote = vi.fn().mockResolvedValue({ error: null });
vi.mock('@/lib/supabase/dealNotes', () => ({
    dealNotesService: { createNote: (...a: unknown[]) => createNote(...a) },
}));

const RESULT: RadarResultDTO = {
    id: 'res_1',
    place: {
        placeId: 'ChIJ_1', title: 'Clínica Sorriso', categoryName: 'Clínica odontológica',
        address: 'Rua A, 100', city: 'Resende', phone: '+552433001122', website: null, socials: [],
        totalScore: 4.2, reviewsCount: 90, url: null,
        source: 'google_maps', collectedAt: '2026-08-31T00:00:00.000Z',
    },
    score: 6,
    breakdown: [],
    disqualified: false,
    disqualifyReasons: [],
    duplicate: { isDuplicate: false, reasons: [] },
    savedDealId: null,
};

function renderModal() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
        React.createElement(QueryClientProvider, { client },
            React.createElement(SaveToCrmModal, { result: RESULT, onClose: () => {}, onSaved: () => {} })
        )
    );
}

describe('Salvar no CRM exige citação literal', () => {
    it('nasce com o botão desabilitado, porque a citação está vazia', () => {
        renderModal();
        expect(screen.getByRole('button', { name: /salvar no crm/i })).toBeDisabled();
    });

    it('continua desabilitado com citação só de espaços em branco', () => {
        renderModal();
        fireEvent.change(screen.getByLabelText(/citação literal/i), { target: { value: '    ' } });
        expect(screen.getByRole('button', { name: /salvar no crm/i })).toBeDisabled();
    });

    it('habilita assim que existe citação de verdade', () => {
        renderModal();
        fireEvent.change(screen.getByLabelText(/citação literal/i), {
            target: { value: 'Liguei três vezes e ninguém responde.' },
        });
        expect(screen.getByRole('button', { name: /salvar no crm/i })).toBeEnabled();
    });

    it('grava o deal no primeiro estágio do board e anexa a citação como nota', async () => {
        renderModal();
        fireEvent.change(screen.getByLabelText(/citação literal/i), {
            target: { value: 'Liguei três vezes e ninguém responde.' },
        });
        fireEvent.change(screen.getByLabelText(/data da avaliação/i), { target: { value: '2026-07-01' } });
        fireEvent.click(screen.getByRole('button', { name: /salvar no crm/i }));

        await vi.waitFor(() => expect(criarDeal).toHaveBeenCalled());

        const args = criarDeal.mock.calls[0][0];
        expect(args.deal.boardId).toBe('b0a1d000-0000-4000-8000-0000000000ff');
        // O primeiro estágio por ordem — nunca um nome literal.
        expect(args.deal.status).toBe('b0a1d000-0000-4000-8000-000000000000');
        expect(args.relatedData.companyName).toBe('Clínica Sorriso');
        expect(args.relatedData.contact.phone).toBe('+552433001122');

        await vi.waitFor(() => expect(createNote).toHaveBeenCalled());
        const [, conteudo] = createNote.mock.calls[0];
        expect(conteudo).toContain('Liguei três vezes e ninguém responde.');
        expect(conteudo).toContain('2026-07-01');
        expect(conteudo).toContain('google_maps');
    });
});
```

- [ ] **Step 2: Rodar para confirmar que falha**

Run: `npx vitest run test/stories/radar-salvar-exige-citacao.test.tsx`
Expected: FAIL — `Failed to resolve import "@/features/radar/components/SaveToCrmModal"`.

- [ ] **Step 3: Escrever `features/radar/components/SaveToCrmModal.tsx`**

```typescript
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCreateDealWithContact } from '@/lib/query/hooks/useDealsQuery';
import { useDefaultBoard } from '@/lib/query/hooks/useBoardsQuery';
import { dealNotesService } from '@/lib/supabase/dealNotes';
import { useAuth } from '@/context/AuthContext';
import type { RadarResultDTO } from '@/app/api/radar/search/route';

/**
 * Colapsa quebras de linha e espaços repetidos em um campo vindo do Google
 * Maps, para que não quebre a estrutura de uma lista markdown.
 */
function colapsarEspacos(valor: string | null | undefined, fallback = '—'): string {
    if (!valor) return fallback;
    const limpo = valor.replace(/\s+/g, ' ').trim();
    return limpo.length > 0 ? limpo : fallback;
}

/**
 * Extrai uma mensagem legível de um erro do Supabase (PostgrestError) ou de
 * um Error nativo, sem depender de um tipo específico.
 */
function mensagemDeErro(erro: unknown): string {
    if (erro && typeof erro === 'object' && 'message' in erro) {
        return String((erro as { message?: unknown }).message);
    }
    return 'Erro desconhecido.';
}

/**
 * Monta a nota que vai para `deal_notes`. Guarda a citação, a data dela e a
 * procedência de cada campo — exigência da constituição.
 */
function montarNota(result: RadarResultDTO, citacao: string, dataCitacao: string): string {
    const p = result.place;
    // A citação pode ter várias linhas (avaliação real colada do Google) —
    // cada linha precisa do seu próprio `> ` para continuar dentro do blockquote.
    const citacaoEmBlockquote = citacao
        .trim()
        .split('\n')
        .map(linha => `> ${linha}`)
        .join('\n');
    return [
        '## Sinal do Radar',
        '',
        citacaoEmBlockquote,
        '',
        `**Data da avaliação:** ${dataCitacao || 'não informada'}`,
        `**Origem:** google_maps · coletado em ${new Date(p.collectedAt).toLocaleString('pt-BR')}`,
        '',
        '### Dados da busca',
        `- Nota: ${p.totalScore ?? '—'} · Avaliações: ${p.reviewsCount ?? '—'}`,
        `- Categoria: ${colapsarEspacos(p.categoryName)}`,
        `- Endereço: ${colapsarEspacos(p.address)}`,
        `- Telefone: ${p.phone ?? '—'}`,
        `- Site: ${p.website ?? 'não tem'}`,
        `- Redes: ${p.socials.length > 0 ? p.socials.join(', ') : 'não tem'}`,
        `- Score: ${result.score}`,
        ...result.breakdown.map(b => `  - ${b.label}: ${b.points > 0 ? `+${b.points}` : '0'}`),
        ...(result.disqualifyReasons.length > 0
            ? ['', `**Desqualificações:** ${result.disqualifyReasons.join(' · ')}`]
            : []),
        '',
        `**place_id:** ${p.placeId}`,
    ].join('\n');
}

/**
 * Salvar no CRM.
 *
 * ⚠️ O botão fica desabilitado enquanto a citação estiver vazia. Este é o
 * único caminho da tela que cria deal, e a citação é o portão.
 */
export function SaveToCrmModal({
    result,
    onClose,
    onSaved,
}: {
    result: RadarResultDTO;
    onClose: () => void;
    onSaved: (dealId: string) => void;
}) {
    const { user, profile } = useAuth();
    const { data: board } = useDefaultBoard();
    const createDealWithContact = useCreateDealWithContact();

    const [citacao, setCitacao] = useState('');
    const [dataCitacao, setDataCitacao] = useState('');
    const [erro, setErro] = useState<string | null>(null);
    const [salvando, setSalvando] = useState(false);
    // Preenchido assim que o deal é criado. A partir daí, o botão nunca mais
    // pode chamar createDealWithContact de novo — só retentar a nota.
    const [dealIdCriado, setDealIdCriado] = useState<string | null>(null);

    const p = result.place;
    // Primeiro estágio por ordem. Nunca um nome literal.
    const primeiroEstagio = board?.stages?.[0];
    const temCitacao = citacao.trim().length > 0;
    const podeSalvar = temCitacao && !!board && !!primeiroEstagio && !salvando;
    // O deal já existe, só falta a nota de auditoria pegar.
    const aguardandoRetentativaDeNota = dealIdCriado !== null;

    /**
     * Cria a nota de auditoria, com uma retentativa automática (falha
     * transiente não deve incomodar o usuário). Retorna o erro final, se
     * as duas tentativas falharem.
     */
    async function criarNotaComRetryAutomatico(dealId: string): Promise<unknown> {
        const conteudo = montarNota(result, citacao, dataCitacao);
        const primeira = await dealNotesService.createNote(dealId, conteudo);
        if (!primeira.error) return null;
        const segunda = await dealNotesService.createNote(dealId, conteudo);
        return segunda.error ?? null;
    }

    /**
     * Retentativa manual, disparada pelo usuário quando as duas tentativas
     * automáticas já falharam. NUNCA cria um novo deal — só regrava a nota
     * no deal que já existe, para não duplicar o negócio.
     */
    async function retentarNota() {
        if (!dealIdCriado || salvando) return;
        setSalvando(true);
        setErro(null);
        try {
            const conteudo = montarNota(result, citacao, dataCitacao);
            const { error } = await dealNotesService.createNote(dealIdCriado, conteudo);
            if (error) {
                setErro(
                    `O negócio já foi salvo, mas a nota de auditoria continua sem gravar: ${mensagemDeErro(error)}. Tente novamente.`
                );
                return;
            }
            onSaved(dealIdCriado);
            onClose();
        } catch (e) {
            setErro(e instanceof Error ? e.message : 'Falha ao gravar a nota de auditoria.');
        } finally {
            setSalvando(false);
        }
    }

    async function salvar() {
        if (!podeSalvar || !board || !primeiroEstagio) return;
        setSalvando(true);
        setErro(null);
        try {
            const ownerName =
                (profile as { nickname?: string; first_name?: string } | null)?.nickname ||
                (profile as { first_name?: string } | null)?.first_name ||
                (user?.email ?? '').split('@')[0] ||
                'Eu';

            const criado = await createDealWithContact.mutateAsync({
                deal: {
                    title: p.title,
                    companyId: '',
                    contactId: '',
                    boardId: board.id,
                    ownerId: user?.id ?? '',
                    value: 0,
                    items: [],
                    status: primeiroEstagio.id,
                    updatedAt: new Date().toISOString(),
                    probability: 10,
                    priority: 'medium',
                    tags: ['Radar'],
                    owner: { name: ownerName, avatar: '' },
                    customFields: {
                        radar: {
                            place_id: p.placeId,
                            rating: p.totalScore,
                            reviews_count: p.reviewsCount,
                            category: p.categoryName,
                            address: p.address,
                            website: p.website,
                            socials: p.socials,
                            score: result.score,
                            score_breakdown: result.breakdown,
                            disqualified: result.disqualified,
                            disqualify_reasons: result.disqualifyReasons,
                            source: 'google_maps',
                            collected_at: p.collectedAt,
                            quote: citacao.trim(),
                            quote_date: dataCitacao || null,
                        },
                    },
                    isWon: false,
                    isLost: false,
                },
                relatedData: {
                    companyName: p.title,
                    contact: {
                        name: p.title,
                        email: '',
                        phone: p.phone ?? '',
                    },
                },
            });

            setDealIdCriado(criado.id);

            const erroNota = await criarNotaComRetryAutomatico(criado.id);
            if (erroNota) {
                // O negócio já existe — manter o modal aberto e trocar a ação
                // principal para retentar só a nota, nunca criar outro deal.
                setErro(
                    `O negócio foi salvo, mas a nota de auditoria não foi gravada: ${mensagemDeErro(erroNota)}. Tente novamente.`
                );
                return;
            }

            onSaved(criado.id);
            onClose();
        } catch (e) {
            setErro(e instanceof Error ? e.message : 'Falha ao salvar no CRM.');
        } finally {
            setSalvando(false);
        }
    }

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
            <div className="w-full max-w-lg space-y-4 rounded-xl bg-white p-5 shadow-xl dark:bg-slate-900">
                <div>
                    <h2 className="text-lg font-semibold">Salvar no CRM</h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                        {p.title} · vai para o estágio &ldquo;{primeiroEstagio?.label ?? '—'}&rdquo; do board{' '}
                        {board?.name ?? '—'}
                    </p>
                </div>

                <div className="space-y-1">
                    <Label htmlFor="radar-citacao">Citação literal *</Label>
                    <textarea
                        id="radar-citacao"
                        rows={4}
                        className="w-full rounded-md border border-slate-200 bg-transparent p-2 text-sm dark:border-slate-700"
                        value={citacao}
                        onChange={(e) => setCitacao(e.target.value)}
                        placeholder="Cole o trecho da avaliação, ou escreva sua observação à mão."
                    />
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                        Sem citação não há lead. Alvo é dor reclamada publicamente, nunca ausência.
                    </p>
                </div>

                <div className="space-y-1">
                    <Label htmlFor="radar-data-citacao">Data da avaliação</Label>
                    <Input
                        id="radar-data-citacao"
                        type="date"
                        value={dataCitacao}
                        onChange={(e) => setDataCitacao(e.target.value)}
                    />
                </div>

                {erro && <p className="text-sm text-red-600 dark:text-red-400">{erro}</p>}

                <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={onClose} disabled={salvando}>
                        Cancelar
                    </Button>
                    <Button
                        onClick={aguardandoRetentativaDeNota ? retentarNota : salvar}
                        disabled={aguardandoRetentativaDeNota ? salvando : !podeSalvar}
                    >
                        {salvando
                            ? 'Salvando…'
                            : aguardandoRetentativaDeNota
                                ? 'Tentar gravar a nota novamente'
                                : 'Salvar no CRM'}
                    </Button>
                </div>
            </div>
        </div>
    );
}
```

- [ ] **Step 4: Rodar a story**

Run: `npx vitest run test/stories/radar-salvar-exige-citacao.test.tsx`
Expected: PASS, 4 testes.

- [ ] **Step 5: Escrever `features/radar/components/ReviewsPanel.tsx`**

```typescript
'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useRadarReviews } from '@/lib/query/hooks/useRadarQuery';
import { findAnchorMatches } from '@/lib/radar/anchors';
import { estimateReviewsCost } from '@/lib/radar/pricing';
import type { RadarReview } from '@/lib/radar/types';
import type { RadarResultDTO } from '@/app/api/radar/search/route';

const MAX_REVIEWS = 10;

/** Destaca os termos do âncora dentro do texto da avaliação. */
function Destacado({ review }: { review: RadarReview }) {
    const matches = findAnchorMatches(review);
    if (matches.length === 0) return <>{review.text}</>;

    const pedacos: React.ReactNode[] = [];
    let cursor = 0;
    for (const m of matches) {
        if (m.start < cursor) continue; // termos sobrepostos: fica o primeiro
        pedacos.push(review.text.slice(cursor, m.start));
        pedacos.push(
            <mark key={`${m.term}-${m.start}`} className="rounded bg-amber-200 px-0.5 dark:bg-amber-700/60">
                {review.text.slice(m.start, m.end)}
            </mark>
        );
        cursor = m.end;
    }
    pedacos.push(review.text.slice(cursor));
    return <>{pedacos}</>;
}

/**
 * Painel lateral por empresa. Só chama a rede quando o usuário clica —
 * cada avaliação é cobrada.
 */
export function ReviewsPanel({
    result,
    onClose,
    onUseQuote,
}: {
    result: RadarResultDTO;
    onClose: () => void;
    onUseQuote: (quote: string, date: string | null) => void;
}) {
    const puxar = useRadarReviews();
    const [reviews, setReviews] = useState<RadarReview[] | null>(null);

    useEffect(() => {
        setReviews(null);
    }, [result.id]);

    const custo = estimateReviewsCost({ places: 1, reviewsPerPlace: MAX_REVIEWS });

    return (
        <aside className="fixed inset-y-0 right-0 z-[9998] w-full max-w-md overflow-y-auto border-l border-slate-200 bg-white p-4 shadow-xl dark:border-slate-700 dark:bg-slate-900">
            <div className="mb-3 flex items-start justify-between gap-2">
                <div>
                    <h2 className="font-semibold">{result.place.title}</h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                        Avaliações filtradas pelos termos do âncora
                    </p>
                </div>
                <Button variant="ghost" size="sm" onClick={onClose}>Fechar</Button>
            </div>

            {reviews === null && (
                <div className="space-y-2">
                    <p className="text-sm text-slate-600 dark:text-slate-300">
                        Puxar até {MAX_REVIEWS} avaliações custa cerca de US$ {custo.toFixed(4)}.
                    </p>
                    <Button
                        disabled={puxar.isPending}
                        onClick={async () => {
                            const out = await puxar.mutateAsync({
                                resultId: result.id,
                                maxReviews: MAX_REVIEWS,
                            });
                            setReviews(out.reviews);
                        }}
                    >
                        {puxar.isPending ? 'Puxando…' : 'Puxar avaliações'}
                    </Button>
                    {puxar.isError && (
                        <p className="text-sm text-red-600 dark:text-red-400">{puxar.error.message}</p>
                    )}
                </div>
            )}

            {reviews !== null && reviews.length === 0 && (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                    Nenhuma avaliação casou com os termos do âncora. Sem citação, não há lead.
                </p>
            )}

            <ul className="space-y-3">
                {(reviews ?? []).map((r) => (
                    <li key={r.reviewId} className="rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-700">
                        <p className="mb-2 whitespace-pre-wrap">
                            <Destacado review={r} />
                        </p>
                        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                            <span>
                                {r.stars ?? '—'}★ ·{' '}
                                {r.publishedAt ? new Date(r.publishedAt).toLocaleDateString('pt-BR') : 'sem data'}
                            </span>
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() => onUseQuote(r.text, r.publishedAt ? r.publishedAt.slice(0, 10) : null)}
                            >
                                Usar como citação
                            </Button>
                        </div>
                    </li>
                ))}
            </ul>
        </aside>
    );
}
```

- [ ] **Step 6: Ligar os dois na `RadarPage`**

Em `features/radar/RadarPage.tsx`, acrescentar os imports e o estado, e substituir os dois handlers vazios:

```typescript
import { ReviewsPanel } from './components/ReviewsPanel';
import { SaveToCrmModal } from './components/SaveToCrmModal';
```

Dentro do componente, junto dos outros `useState`:

```typescript
    const [lendo, setLendo] = useState<RadarResultDTO | null>(null);
    const [salvando, setSalvando] = useState<RadarResultDTO | null>(null);
    const [citacaoSugerida, setCitacaoSugerida] = useState<{ quote: string; date: string | null } | null>(null);
```

Trocar os handlers do `ResultCard`:

```typescript
                            onOpenReviews={setLendo}
                            onSave={setSalvando}
```

E antes do `</div>` final do componente:

```typescript
            {lendo && (
                <ReviewsPanel
                    result={lendo}
                    onClose={() => setLendo(null)}
                    onUseQuote={(quote, date) => {
                        setCitacaoSugerida({ quote, date });
                        setSalvando(lendo);
                        setLendo(null);
                    }}
                />
            )}

            {salvando && (
                <SaveToCrmModal
                    key={citacaoSugerida?.quote ?? salvando.id}
                    result={salvando}
                    initialQuote={citacaoSugerida?.quote ?? ''}
                    initialQuoteDate={citacaoSugerida?.date ?? ''}
                    onClose={() => { setSalvando(null); setCitacaoSugerida(null); }}
                    onSaved={() => { setSalvando(null); setCitacaoSugerida(null); }}
                />
            )}
```

- [ ] **Step 7: Aceitar a citação sugerida no modal**

Em `features/radar/components/SaveToCrmModal.tsx`, acrescentar as duas props e usá-las como estado inicial:

```typescript
export function SaveToCrmModal({
    result,
    initialQuote = '',
    initialQuoteDate = '',
    onClose,
    onSaved,
}: {
    result: RadarResultDTO;
    initialQuote?: string;
    initialQuoteDate?: string;
    onClose: () => void;
    onSaved: (dealId: string) => void;
}) {
```

e trocar as duas linhas de estado:

```typescript
    const [citacao, setCitacao] = useState(initialQuote);
    const [dataCitacao, setDataCitacao] = useState(initialQuoteDate);
```

- [ ] **Step 8: Rodar a story de novo (as props opcionais não podem quebrá-la)**

Run: `npx vitest run test/stories/radar-salvar-exige-citacao.test.tsx`
Expected: PASS, 4 testes.

- [ ] **Step 9: Commit**

```bash
git add features/radar test/stories/radar-salvar-exige-citacao.test.tsx
git commit -m "feat(radar): painel de avaliacoes com destaque do ancora e salvamento com citacao obrigatoria"
```

---

## Task 12: Apagar um lead e o que veio junto

**Files:**
- Create: `app/api/radar/results/[id]/route.ts`
- Modify: `features/radar/components/ResultCard.tsx`
- Modify: `features/radar/RadarPage.tsx`
- Test: `app/api/radar/results/[id]/route.test.ts`

**Interfaces:**
- Consumes: `createClient` de `@/lib/supabase/server`.
- Produces: `DELETE /api/radar/results/:id` → `{ deletedResult: true, deletedDealId: string | null }`. `ResultCard` ganha a prop `onDelete: (r: RadarResultDTO) => void`.

**Por que existe:** a constituição exige procedência rastreável e caminho de remoção. Apagar só o deal deixaria o payload do Google Maps no banco; apagar só o `radar_results` deixaria o deal órfão da sua evidência. Este endpoint faz os dois: remove a linha do Radar e faz soft-delete do deal ligado a ela, seguindo o `deleted_at` que o resto do CRM já usa.

- [ ] **Step 1: Escrever o teste (que vai falhar)**

Criar `app/api/radar/results/[id]/route.test.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest';

const createClient = vi.fn();
vi.mock('@/lib/supabase/server', () => ({ createClient }));

import { DELETE } from '@/app/api/radar/results/[id]/route';

const ORG = 'dc09e9de-2030-426b-9dcd-1beae85bac5e';
const USER = 'c2fce80e-77f6-4c85-9d41-f98d9a2aef16';
const RESULT_ID = '11111111-1111-4111-8111-111111111111';

const deals = { update: vi.fn(), eq: vi.fn() };
const results = { delete: vi.fn(), eq: vi.fn() };

function fakeSupabase(opts: { user?: { id: string } | null; row?: { id: string; saved_deal_id: string | null } | null }) {
    const dealsBuilder: Record<string, unknown> = {
        update: (v: unknown) => { deals.update(v); return dealsBuilder; },
        eq: (...a: unknown[]) => { deals.eq(...a); return dealsBuilder; },
        then: (r: (v: { error: null }) => unknown) => r({ error: null }),
    };
    const resultsBuilder: Record<string, unknown> = {
        select: () => resultsBuilder,
        delete: () => { results.delete(); return resultsBuilder; },
        eq: (...a: unknown[]) => { results.eq(...a); return resultsBuilder; },
        maybeSingle: async () => ({ data: opts.row === undefined ? { id: RESULT_ID, saved_deal_id: null } : opts.row, error: null }),
        then: (r: (v: { error: null }) => unknown) => r({ error: null }),
    };
    return {
        auth: { getUser: async () => ({ data: { user: opts.user === undefined ? { id: USER } : opts.user }, error: null }) },
        from: (name: string) => {
            if (name === 'profiles') {
                return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { organization_id: ORG }, error: null }) }) }) };
            }
            if (name === 'deals') return dealsBuilder;
            return resultsBuilder;
        },
    };
}

function req() {
    return new Request(`http://localhost/api/radar/results/${RESULT_ID}`, { method: 'DELETE' });
}
const ctx = { params: Promise.resolve({ id: RESULT_ID }) };

beforeEach(() => {
    vi.clearAllMocks();
    deals.update.mockClear();
    results.delete.mockClear();
});

describe('DELETE /api/radar/results/:id', () => {
    it('responde 401 sem sessão e não apaga nada', async () => {
        createClient.mockResolvedValue(fakeSupabase({ user: null }));
        const res = await DELETE(req(), ctx);
        expect(res.status).toBe(401);
        expect(results.delete).not.toHaveBeenCalled();
    });

    it('responde 404 quando o resultado não é da organização do usuário', async () => {
        createClient.mockResolvedValue(fakeSupabase({ row: null }));
        const res = await DELETE(req(), ctx);
        expect(res.status).toBe(404);
        expect(results.delete).not.toHaveBeenCalled();
    });

    it('apaga a linha do Radar quando não há deal salvo', async () => {
        createClient.mockResolvedValue(fakeSupabase({ row: { id: RESULT_ID, saved_deal_id: null } }));
        const res = await DELETE(req(), ctx);
        const json = await res.json();
        expect(res.status).toBe(200);
        expect(json).toEqual({ deletedResult: true, deletedDealId: null });
        expect(results.delete).toHaveBeenCalled();
        expect(deals.update).not.toHaveBeenCalled();
    });

    it('faz soft-delete do deal ligado e depois apaga a linha do Radar', async () => {
        createClient.mockResolvedValue(fakeSupabase({ row: { id: RESULT_ID, saved_deal_id: 'deal_1' } }));
        const res = await DELETE(req(), ctx);
        const json = await res.json();
        expect(res.status).toBe(200);
        expect(json).toEqual({ deletedResult: true, deletedDealId: 'deal_1' });
        expect(deals.update).toHaveBeenCalledWith(
            expect.objectContaining({ deleted_at: expect.any(String) })
        );
        expect(results.delete).toHaveBeenCalled();
    });
});
```

- [ ] **Step 2: Rodar para confirmar que falha**

Run: `npx vitest run "app/api/radar/results/[id]/route.test.ts"`
Expected: FAIL — `Failed to resolve import "@/app/api/radar/results/[id]/route"`.

- [ ] **Step 3: Escrever `app/api/radar/results/[id]/route.ts`**

```typescript
/**
 * @fileoverview Remoção de um lead do Radar e do que veio junto com ele.
 *
 * A constituição exige procedência rastreável E caminho de remoção. Apagar só
 * o deal deixaria o payload do Google Maps no banco; apagar só a linha do
 * Radar deixaria o deal sem a evidência que o justificou. Aqui os dois somem.
 *
 * @module app/api/radar/results/[id]/route
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { mustWrite } from '@/lib/radar/supabaseWrite';

export async function DELETE(
    _req: Request,
    ctx: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await ctx.params;
        const supabase = await createClient();

        const { data: auth } = await supabase.auth.getUser();
        if (!auth?.user) {
            return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
        }

        const { data: profile } = await supabase
            .from('profiles')
            .select('organization_id')
            .eq('id', auth.user.id)
            .maybeSingle();

        const organizationId = (profile as { organization_id?: string } | null)?.organization_id;
        if (!organizationId) {
            return NextResponse.json({ error: 'Organização não identificada.' }, { status: 403 });
        }

        // Defense-in-depth: filtra por organization_id além do RLS.
        const { data: row } = await supabase
            .from('radar_results')
            .select('id, saved_deal_id')
            .eq('id', id)
            .eq('organization_id', organizationId)
            .maybeSingle();

        if (!row) {
            return NextResponse.json({ error: 'Resultado não encontrado.' }, { status: 404 });
        }

        const savedDealId = (row as { saved_deal_id: string | null }).saved_deal_id;

        // Soft-delete do deal primeiro: se isto falhar, a evidência continua no
        // banco e a operação pode ser repetida sem perder rastro. `mustWrite`
        // lança se `error` vier preenchido, o que interrompe a função ANTES do
        // delete abaixo — é essa interrupção que garante a ordem.
        if (savedDealId) {
            await mustWrite(
                supabase
                    .from('deals')
                    .update({ deleted_at: new Date().toISOString() })
                    .eq('id', savedDealId)
                    .eq('organization_id', organizationId),
                `soft-delete do deal ${savedDealId}`
            );
        }

        await mustWrite(
            supabase
                .from('radar_results')
                .delete()
                .eq('id', id)
                .eq('organization_id', organizationId),
            `apagar radar_results ${id}`
        );

        return NextResponse.json({ deletedResult: true, deletedDealId: savedDealId ?? null });
    } catch (err) {
        return NextResponse.json(
            { error: err instanceof Error ? err.message : 'Erro ao apagar o resultado.' },
            { status: 500 }
        );
    }
}
```

- [ ] **Step 4: Rodar os testes**

Run: `npx vitest run "app/api/radar/results/[id]/route.test.ts"`
Expected: PASS, 5 testes — os 4 originais mais um cobrindo a ordem das duas
escritas (`mock.invocationCallOrder`: o soft-delete do deal resolve antes do
delete de `radar_results`) e um cobrindo que uma falha no soft-delete do deal
interrompe a função **antes** do delete — a linha do Radar sobrevive e a rota
responde 500. Rodar o par "quebra deliberada" antes de fechar: inverter as
duas escritas na rota, confirmar que o teste de ordem FALHA, desfazer,
confirmar verde de novo — só assim o teste prova algo.

- [ ] **Step 5: Ligar o botão no card, com confirmação em dois cliques**

O botão soft-deleta o deal E apaga a única evidência que o justificou, sem
undo na UI. Por isso não dispara no primeiro clique: o primeiro clique só
troca o rótulo para "Confirmar?"; o segundo dispara `onDelete`. Perder o foco
do botão (`onBlur` — clicar em outro lugar do card, ou fora dele) desarma a
confirmação de novo, sem precisar de temporizador nem de `useEffect`.

Em `features/radar/components/ResultCard.tsx`:

```typescript
import { useState } from 'react';
// ...

export function ResultCard({
    result,
    onOpenReviews,
    onSave,
    onDelete,
    deleting = false,
}: {
    result: RadarResultDTO;
    onOpenReviews: (r: RadarResultDTO) => void;
    onSave: (r: RadarResultDTO) => void;
    onDelete: (r: RadarResultDTO) => void;
    /** Desabilita o botão Apagar enquanto a exclusão DESTE card está em andamento. */
    deleting?: boolean;
}) {
    const p = result.place;
    const [confirmando, setConfirmando] = useState(false);

    function handleDeleteClick() {
        if (confirmando) {
            setConfirmando(false);
            onDelete(result);
        } else {
            setConfirmando(true);
        }
    }
```

e o botão dentro do `<div className="flex gap-2">`, depois do "Salvar no CRM":

```typescript
                <Button
                    variant="ghost"
                    size="sm"
                    className="ml-auto text-red-600"
                    disabled={deleting}
                    onClick={handleDeleteClick}
                    onBlur={() => setConfirmando(false)}
                >
                    {confirmando ? 'Confirmar?' : 'Apagar'}
                </Button>
```

- [ ] **Step 6: Ligar o handler na página**

`apagandoId` é o id do resultado sendo apagado, não um boolean global — senão
o delete de um card desabilitaria o botão Apagar de todos os outros. E o
`catch` mora aqui, não no card: `ResultCard` chama `onDelete` a partir de um
`onClick` sem `await`/`.catch`, então uma falha sem tratamento aqui vira
unhandled rejection e o usuário nunca fica sabendo. Em
`features/radar/RadarPage.tsx`, acrescentar o estado e o handler junto dos
outros:

```typescript
    const [apagandoId, setApagandoId] = useState<string | null>(null);
    const [erroAoApagar, setErroAoApagar] = useState<string | null>(null);

    async function apagar(r: RadarResultDTO) {
        setApagandoId(r.id);
        setErroAoApagar(null);
        try {
            const res = await fetch(`/api/radar/results/${r.id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Falha ao apagar.');
            if (ultimaBusca) await search.mutateAsync({ ...ultimaBusca, refresh: false });
        } catch (err) {
            setErroAoApagar(err instanceof Error ? err.message : 'Falha ao apagar.');
        } finally {
            setApagandoId(null);
        }
    }
```

Guardar a última busca para poder recarregar. Junto dos outros `useState`:

```typescript
    const [ultimaBusca, setUltimaBusca] = useState<RadarSearchVars | null>(null);
```

No `onSubmit` do `SearchForm`, gravar antes de disparar:

```typescript
                    onSubmit={(vars) => { setUltimaBusca(vars); search.mutate(vars); }}
```

Mostrar `erroAoApagar` do mesmo jeito que o erro de busca já é mostrado
(bloco vermelho acima da lista), e passar o handler e o id ao card:

```typescript
                {erroAoApagar && (
                    <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">
                        {erroAoApagar}
                    </div>
                )}
```

```typescript
                            onDelete={apagar}
                            deleting={apagandoId === r.id}
```

Acrescentar o import do tipo no topo:

```typescript
import type { RadarSearchVars } from '@/lib/query/hooks/useRadarQuery';
```

Observação: recarregar chama a rota de busca com `refresh: false`, que cai no cache dos 30 dias e **não gasta nada**.

- [ ] **Step 7: Testar a confirmação em dois cliques e verificar lint e tipos**

Criar `test/stories/radar-apagar-exige-confirmacao.test.tsx` cobrindo: o
primeiro clique não chama `fetch` (só troca o rótulo); o segundo chama
`DELETE /api/radar/results/:id` com o id certo; perder o foco do botão
desarma a confirmação.

Run: `npm run lint && npm run typecheck`
Expected: sem erros nem warnings.

- [ ] **Step 8: Commit**

```bash
git add "app/api/radar/results" features/radar lib/radar/supabaseWrite.ts lib/radar/supabaseWrite.test.ts test/stories/radar-apagar-exige-confirmacao.test.tsx
git commit -m "feat(radar): apagar lead do Radar junto com o deal e a evidencia"
```

---

## Task 13: Fechamento — precheck e verificação dos sete critérios

**Files:**
- Modify: nenhum, salvo correções apontadas pelo precheck.

- [ ] **Step 1: Rodar a bateria completa**

Run: `npm run precheck`
Expected: lint sem warnings, typecheck limpo, todos os testes passando, build concluído.

- [ ] **Step 2: Confirmar o critério de pronto #6 — token não vazou**

Run: `grep -rnE "NEXT_PUBLIC_[A-Z0-9_]*APIFY" --include="*.ts" --include="*.tsx" --include="*.example" . | grep -v node_modules`
Expected: nenhuma saída.

Conferir também que `APIFY_TOKEN` só aparece em `.env.example` e em arquivos sob `app/api/` ou `lib/radar/apify.ts` — nunca em `features/` ou `components/`:

Run: `grep -rn "APIFY_TOKEN" --include="*.ts" --include="*.tsx" . | grep -v node_modules`

- [ ] **Step 3: Teste manual dos critérios #1 a #5**

Com `APIFY_TOKEN` configurado em `.env.local` e `npm run dev` rodando:

1. Abrir `/radar`, buscar "clínica odontológica" em Resende/RJ com **maxResults 3**. Conferir que os cards mostram nota e contagem de avaliações. → critério #1
2. Antes de clicar, conferir que a estimativa aparece; depois, conferir que o `costUsd` exibido bate com o run no console do Apify. → critério #2
3. Repetir a mesma busca. A tela deve dizer que veio do cache e a data, e o console do Apify não deve registrar novo run. → critério #3
4. Abrir "Salvar no CRM" numa empresa: o botão nasce desabilitado; digitar uma citação e ele habilita. → critério #4
5. Salvar e abrir `/boards`: o card deve estar na coluna **Radar** do board Prospecção R.A.F.O, com a citação na nota do deal. → critério #5

Anotar cada resultado. Se algum falhar, corrigir antes de seguir.

- [ ] **Step 4: Commit final**

```bash
git add -A
git commit -m "chore(radar): precheck verde e verificacao dos criterios de pronto da fase 1"
```

---

## Fora deste plano (Fase 2)

Mapa sincronizado com a lista, buscas salvas com reexecução agendada, exportação CSV, ações em lote, templates de busca por setor, relatório de conversão por segmento.

O **critério #7** — 40 empresas com citação literal e data dentro do teto de US$ 5 — não é uma task de código: é o uso da ferramenta depois que ela existe. Com a estimativa do documento (≈US$ 1,30 para uma rodada completa de 11 cidades), cabe quatro vezes no teto.
