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
  searchRows?: unknown[];
  spentRows?: { cost_usd: number }[];
  resultRows?: unknown[];
  /** Quando true, o upsert em `radar_results` devolve um erro (Finding 1). */
  upsertFails?: boolean;
}) {
  // A rota chama `.from('radar_searches')` duas vezes: primeiro para somar o
  // gasto do ciclo (spentThisCycle), depois — se não houver refresh — para o
  // lookup de cache. `spentRows`, quando presente, deve responder só à
  // primeira chamada; a segunda continua sendo o lookup normal de cache
  // (`searchRows`), senão o `.order().limit()` do cache quebraria em cima do
  // atalho usado pela soma do ciclo.
  let radarSearchesCalls = 0;
  const updateCalls: unknown[] = [];
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
      select: () => builder, eq: () => builder, gte: () => builder, is: () => builder,
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
      then: (r: (v: { data: unknown[]; error: null }) => unknown) => r({ data: rows, error: null }),
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

  it('mantém os resultados do run e marca partial quando o upsert em radar_results falha', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const supabase = fakeSupabase({ upsertFails: true });
    createClient.mockResolvedValue(supabase);
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
    // O run já foi pago — os resultados em memória não podem sumir da tela.
    expect(json.results).toHaveLength(1);
    expect(json.results[0].place.placeId).toBe('ChIJ_1');
    // Mas a resposta e a linha ficam marcadas partial: nunca servir do cache.
    expect(json.partial).toBe(true);
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
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
