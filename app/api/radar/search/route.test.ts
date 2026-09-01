import { beforeEach, describe, expect, it, vi } from 'vitest';

const { runPlacesSearch, createClient } = vi.hoisted(() => ({
  runPlacesSearch: vi.fn(),
  createClient: vi.fn(),
}));

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
  role?: string;
  searchRows?: unknown[];
  spentRows?: { cost_usd: number }[];
  resultRows?: unknown[];
  /** Quando true, o upsert em `radar_results` devolve um erro (Finding 1). */
  upsertFails?: boolean;
  /**
   * Quando true, a SEGUNDA leitura via `.select()` em `radar_results` (a
   * leitura de `savedRows`, que roda depois da leitura de `existentes` e do
   * upsert) devolve um erro do Postgrest.
   */
  savedRowsReadFails?: boolean;
}) {
  // A rota chama `.from('radar_searches')` duas vezes: primeiro para somar o
  // gasto do ciclo (spentThisCycle), depois — se não houver refresh — para o
  // lookup de cache. `spentRows`, quando presente, deve responder só à
  // primeira chamada; a segunda continua sendo o lookup normal de cache
  // (`searchRows`), senão o `.order().limit()` do cache quebraria em cima do
  // atalho usado pela soma do ciclo.
  let radarSearchesCalls = 0;
  let radarResultsSelectCalls = 0;
  const updateCalls: unknown[] = [];
  const table = (name: string) => {
    const rows =
      name === 'radar_searches'
        ? (opts.searchRows ?? [])
        : name === 'radar_results'
          ? (opts.resultRows ?? [])
          : name === 'profiles'
            ? [{ organization_id: ORG, role: opts.role ?? 'admin' }]
            : name === 'contacts'
              ? []
              // A filiação espelha o que `resultRows` devolveria: um link por
              // linha de resultado, que é o que a leitura de cache percorre.
              : name === 'radar_search_results'
                ? (opts.resultRows ?? []).map((r) => ({ result_id: (r as { id: string }).id }))
                : [];
    const builder: Record<string, unknown> = {
      data: rows, error: null,
      select: () => {
        if (name === 'radar_results') radarResultsSelectCalls += 1;
        return builder;
      },
      eq: () => builder, gte: () => builder, is: () => builder,
      in: () => builder,
      order: () => builder, limit: () => builder,
      insert: () => ({ select: () => ({ single: async () => ({ data: { id: 'search_1' }, error: null }) }) }),
      upsert: async () =>
        name === 'radar_results' && opts.upsertFails
          ? { data: null, error: { message: 'upsert falhou (teste)' } }
          : { data: null, error: null },
      update: (patch: unknown) => {
        updateCalls.push({ table: name, patch });
        return builder;
      },
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
      then: (r: (v: { data: unknown[] | null; error: unknown }) => unknown) => {
        // A leitura de `existentes` é a 1ª `.select()` em `radar_results`
        // desta requisição; a de `savedRows` é a 2ª (roda depois do upsert,
        // que não passa por `.select()`).
        if (name === 'radar_results' && opts.savedRowsReadFails && radarResultsSelectCalls === 2) {
          return r({ data: null, error: { message: 'savedRows falhou (teste)' } });
        }
        return r({ data: rows, error: null });
      },
    };
    if (name === 'radar_searches') radarSearchesCalls += 1;
    if (name === 'radar_searches' && opts.spentRows && radarSearchesCalls === 1) {
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
    __updateCalls: updateCalls,
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

  it('responde 403 e não chama o Apify quando o usuário não é admin', async () => {
    // A RLS de radar_searches/radar_results é admin-only: sem este gate a soma
    // do ciclo voltaria vazia (teto nunca dispara), o Apify seria cobrado e o
    // insert do gasto morreria no WITH CHECK — dinheiro fora, nada registrado.
    createClient.mockResolvedValue(fakeSupabase({ role: 'vendedor' }));
    const res = await POST(req(VALID));
    expect(res.status).toBe(403);
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
      finished: true,
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
    expect(json.partial).toBe(false);
  });

  it('nunca deixa maxResults acima do teto passar para o actor', async () => {
    createClient.mockResolvedValue(fakeSupabase({}));
    runPlacesSearch.mockResolvedValue({ runId: 'run_1', finished: true, costUsd: 0, places: [] });
    await POST(req({ ...VALID, maxResults: 20 }));
    expect(runPlacesSearch).toHaveBeenCalledWith(
      expect.objectContaining({ maxResults: 20, nicho: 'clínica odontológica' })
    );
  });

  it('mantém os resultados do run e marca partial quando o upsert em radar_results falha', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const supabase = fakeSupabase({ upsertFails: true });
    createClient.mockResolvedValue(supabase);
    runPlacesSearch.mockResolvedValue({
      runId: 'run_1',
      finished: true,
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
    // O run já foi pago — os resultados em memória não podem sumir da tela.
    expect(json.results).toHaveLength(1);
    expect(json.results[0].place.placeId).toBe('ChIJ_1');
    // Mas a resposta e a linha ficam marcadas partial: nunca servir do cache.
    expect(json.partial).toBe(true);
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it('marca partial e loga o PostgrestError quando a leitura de savedRows falha', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const supabase = fakeSupabase({ savedRowsReadFails: true });
    createClient.mockResolvedValue(supabase);
    runPlacesSearch.mockResolvedValue({
      runId: 'run_1',
      finished: true,
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
    // O run já foi pago — os resultados em memória não podem sumir da tela.
    expect(json.results).toHaveLength(1);
    // Sem `salvas`, a filiação em `radar_search_results` não pode ser tratada
    // como sucesso silencioso: a busca fica partial, nunca cacheável.
    expect(json.partial).toBe(true);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('ler saved_deal_id'),
      expect.objectContaining({ message: 'savedRows falhou (teste)' })
    );
    consoleErrorSpy.mockRestore();
  });
});

describe('POST /api/radar/search — leitura de existentes escopada ao run atual', () => {
  it('filtra radar_results por place_id do run atual, não lê a tabela inteira', async () => {
    const inCalls: { columns: string; column: string; values: unknown[] }[] = [];
    let lastSelectColumns = '';
    const supabase = {
      auth: { getUser: async () => ({ data: { user: { id: USER } }, error: null }) },
      from: (name: string) => {
        const builder: Record<string, unknown> = {
          select: (cols: string) => { lastSelectColumns = cols; return builder; },
          eq: () => builder,
          gte: () => builder,
          is: () => builder,
          in: (col: string, vals: unknown[]) => {
            if (name === 'radar_results') {
              inCalls.push({ columns: lastSelectColumns, column: col, values: vals });
            }
            return builder;
          },
          order: () => builder,
          limit: () => builder,
          insert: () => ({ select: () => ({ single: async () => ({ data: { id: 'search_1' }, error: null }) }) }),
          upsert: async () => ({ data: null, error: null }),
          update: () => builder,
          maybeSingle: async () => ({
            data: name === 'profiles' ? { organization_id: ORG, role: 'admin' } : null,
            error: null,
          }),
          then: (r: (v: { data: unknown[]; error: null }) => unknown) => r({ data: [], error: null }),
        };
        return builder;
      },
    };
    createClient.mockResolvedValue(supabase);
    runPlacesSearch.mockResolvedValue({
      runId: 'run_1',
      finished: true,
      costUsd: 0.01,
      places: [
        {
          placeId: 'ChIJ_a', title: 'A', categoryName: null, address: null, city: 'Resende',
          phone: null, website: null, socials: [], totalScore: null, reviewsCount: null, url: null,
          source: 'google_maps', collectedAt: '2026-08-31T00:00:00.000Z',
        },
        {
          placeId: 'ChIJ_b', title: 'B', categoryName: null, address: null, city: 'Resende',
          phone: null, website: null, socials: [], totalScore: null, reviewsCount: null, url: null,
          source: 'google_maps', collectedAt: '2026-08-31T00:00:00.000Z',
        },
      ],
    });

    const res = await POST(req(VALID));
    expect(res.status).toBe(200);

    // Sem escopo, `max_rows = 1000` do PostgREST trunca em silêncio
    // organizações com mais de 1000 linhas em `radar_results`; um lugar fora
    // da janela truncada perde `search_id`/`reviews_fetched_at` e a re-busca
    // recalcula o score SEM avaliações por cima de uma linha que já as tem.
    const leituraDeExistentes = inCalls.find(c => c.columns.includes('reviews_fetched_at'));
    expect(leituraDeExistentes).toBeDefined();
    expect(leituraDeExistentes!.column).toBe('place_id');
    expect((leituraDeExistentes!.values as string[]).slice().sort()).toEqual(['ChIJ_a', 'ChIJ_b']);
  });
});

describe('POST /api/radar/search — módulo Apify', () => {
  it('responde 503 com mensagem clara quando o token não está configurado', async () => {
    const { ApifyConfigError } = await vi.importActual<typeof import('@/lib/radar/apify')>('@/lib/radar/apify');
    createClient.mockResolvedValue(fakeSupabase({}));
    runPlacesSearch.mockRejectedValue(new ApifyConfigError());
    const res = await POST(req(VALID));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatch(/APIFY_TOKEN/);
  });
});
