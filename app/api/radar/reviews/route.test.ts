import { beforeEach, describe, expect, it, vi } from 'vitest';

const { runReviewsScrape, createClient } = vi.hoisted(() => ({
  runReviewsScrape: vi.fn(),
  createClient: vi.fn(),
}));

vi.mock('@/lib/radar/apify', async () => {
  const actual = await vi.importActual<typeof import('@/lib/radar/apify')>('@/lib/radar/apify');
  return { ...actual, runReviewsScrape };
});
vi.mock('@/lib/supabase/server', () => ({ createClient }));

import { POST } from '@/app/api/radar/reviews/route';

const ORG = 'dc09e9de-2030-426b-9dcd-1beae85bac5e';
const OTHER_ORG = '11111111-2222-3333-4444-555555555555';
const USER = 'c2fce80e-77f6-4c85-9d41-f98d9a2aef16';
const RESULT_ID = '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d';

const PLACE = {
  placeId: 'ChIJ_row',
  title: 'Clínica A',
  categoryName: 'Clínica odontológica',
  address: null,
  city: 'Resende',
  phone: '+552433001122',
  website: null,
  socials: [],
  totalScore: 4.2,
  reviewsCount: 90,
  url: null,
  source: 'google_maps' as const,
  collectedAt: '2026-08-31T00:00:00.000Z',
};

/**
 * Supabase falso para a rota de avaliações. `resultRow` é o que o lookup por
 * `resultId` + `organization_id` devolve (null simula "não encontrado" —
 * tanto 404 real quanto o caso "existe, mas é de outra organização", já que
 * a query sempre filtra por `organization_id`). `spentRows` é o que a soma do
 * teto do ciclo devolve. `insertFails`/`updateFails` simulam falha nas
 * escritas (Finding 2).
 */
function fakeSupabase(opts: {
  user?: { id: string } | null;
  role?: string;
  resultRow?: Record<string, unknown> | null;
  spentRows?: { cost_usd: number }[];
  insertFails?: boolean;
  updateFails?: boolean;
}) {
  const updateCalls: unknown[] = [];
  const insertCalls: unknown[] = [];

  const table = (name: string) => {
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: () => builder,
      gte: () => ({
        then: (r: (v: { data: unknown[]; error: null }) => unknown) =>
          r({ data: opts.spentRows ?? [], error: null }),
      }),
      maybeSingle: async () => {
        if (name === 'radar_results') return { data: opts.resultRow ?? null, error: null };
        if (name === 'profiles') return { data: { organization_id: ORG, role: opts.role ?? 'admin' }, error: null };
        return { data: null, error: null };
      },
      insert: (patch: unknown) => {
        insertCalls.push(patch);
        return {
          then: (r: (v: { data: null; error: unknown }) => unknown) =>
            r({
              data: null,
              error: name === 'radar_searches' && opts.insertFails ? { message: 'insert falhou (teste)' } : null,
            }),
        };
      },
      update: (patch: unknown) => {
        updateCalls.push({ table: name, patch });
        return {
          eq: () => ({
            eq: () => ({
              then: (r: (v: { data: null; error: unknown }) => unknown) =>
                r({
                  data: null,
                  error:
                    name === 'radar_results' && opts.updateFails ? { message: 'update falhou (teste)' } : null,
                }),
            }),
          }),
        };
      },
    };
    return builder;
  };

  return {
    auth: {
      getUser: async () => ({
        data: { user: opts.user === undefined ? { id: USER } : opts.user },
        error: null,
      }),
    },
    from: (name: string) => table(name),
    __updateCalls: updateCalls,
    __insertCalls: insertCalls,
  };
}

function req(body: unknown) {
  return new Request('http://localhost/api/radar/reviews', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const VALID = { resultId: RESULT_ID, maxReviews: 5 };

beforeEach(() => {
  vi.clearAllMocks();
  process.env.RADAR_MONTHLY_BUDGET_USD = '5.00';
});

describe('POST /api/radar/reviews — autenticação', () => {
  it('responde 401 sem sessão e não chama o Apify', async () => {
    createClient.mockResolvedValue(fakeSupabase({ user: null }));
    const res = await POST(req(VALID));
    expect(res.status).toBe(401);
    expect(runReviewsScrape).not.toHaveBeenCalled();
  });
});

describe('POST /api/radar/reviews — autorização', () => {
  it('responde 404 quando o resultId é de outra organização (ou não existe) e não chama o Apify', async () => {
    // A query filtra por organization_id, então uma linha de outra org nunca
    // é devolvida pelo maybeSingle — o fake simplesmente devolve null.
    createClient.mockResolvedValue(fakeSupabase({ resultRow: null }));
    const res = await POST(req(VALID));
    expect(res.status).toBe(404);
    expect(runReviewsScrape).not.toHaveBeenCalled();
  });

  it('responde 403 e não chama o Apify quando o usuário não é admin', async () => {
    // A RLS de radar_searches é admin-only: sem este gate a soma do ciclo
    // voltaria vazia, o teto nunca dispararia e o run seria pago sem que o
    // gasto conseguisse ser gravado.
    createClient.mockResolvedValue(fakeSupabase({ role: 'vendedor', resultRow: { id: RESULT_ID, payload: PLACE, reviews: null, reviews_fetched_at: null } }));
    const res = await POST(req(VALID));
    expect(res.status).toBe(403);
    expect(runReviewsScrape).not.toHaveBeenCalled();
  });
});

describe('POST /api/radar/reviews — teto de gasto', () => {
  it('responde 402 e não chama o Apify quando o ciclo já estourou o teto', async () => {
    createClient.mockResolvedValue(
      fakeSupabase({
        resultRow: { id: RESULT_ID, payload: PLACE, reviews: null, reviews_fetched_at: null },
        spentRows: [{ cost_usd: 5.0 }],
      })
    );
    const res = await POST(req(VALID));
    expect(res.status).toBe(402);
    expect(runReviewsScrape).not.toHaveBeenCalled();
  });
});

describe('POST /api/radar/reviews — cache', () => {
  it('Finding 1: uma empresa com zero avaliações já buscadas NÃO é recobrada', async () => {
    createClient.mockResolvedValue(
      fakeSupabase({
        resultRow: {
          id: RESULT_ID,
          payload: PLACE,
          reviews: [],
          reviews_fetched_at: '2026-08-01T00:00:00.000Z',
        },
      })
    );
    const res = await POST(req(VALID));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.costUsd).toBe(0);
    expect(json.reviews).toEqual([]);
    expect(runReviewsScrape).not.toHaveBeenCalled();
  });

  it('serve avaliações já gravadas do banco sem chamar o Apify', async () => {
    const storedReviews = [
      { reviewId: 'r1', text: 'ótimo', stars: 5, publishedAt: '2026-01-01T00:00:00.000Z', reviewerName: 'A' },
    ];
    createClient.mockResolvedValue(
      fakeSupabase({
        resultRow: {
          id: RESULT_ID,
          payload: PLACE,
          reviews: storedReviews,
          reviews_fetched_at: '2026-08-01T00:00:00.000Z',
        },
      })
    );
    const res = await POST(req(VALID));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.costUsd).toBe(0);
    expect(json.reviews).toEqual(storedReviews);
    expect(runReviewsScrape).not.toHaveBeenCalled();
  });
});

describe('POST /api/radar/reviews — execução ao vivo', () => {
  it('um run terminado persiste as avaliações e devolve persisted: true', async () => {
    const supabase = fakeSupabase({
      resultRow: { id: RESULT_ID, payload: PLACE, reviews: null, reviews_fetched_at: null },
    });
    createClient.mockResolvedValue(supabase);
    runReviewsScrape.mockResolvedValue({
      runId: 'run_1',
      finished: true,
      costUsd: 0.0025,
      reviews: [
        { reviewId: 'r1', text: 'bom atendimento', stars: 5, publishedAt: '2026-08-01T00:00:00.000Z', reviewerName: 'B' },
      ],
    });

    const res = await POST(req(VALID));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.persisted).toBe(true);
    expect(json.reviews).toHaveLength(1);
    expect(json.costUsd).toBeCloseTo(0.0025, 5);
    expect(supabase.__updateCalls).toHaveLength(1);
    expect((supabase.__updateCalls[0] as { table: string }).table).toBe('radar_results');
  });

  it('um run não terminado devolve persisted: false, registra o custo e não grava em radar_results', async () => {
    const supabase = fakeSupabase({
      resultRow: { id: RESULT_ID, payload: PLACE, reviews: null, reviews_fetched_at: null },
    });
    createClient.mockResolvedValue(supabase);
    runReviewsScrape.mockResolvedValue({
      runId: 'run_2',
      finished: false,
      costUsd: 0.0012,
      reviews: [
        { reviewId: 'r2', text: 'parcial', stars: 3, publishedAt: null, reviewerName: null },
      ],
    });

    const res = await POST(req(VALID));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.persisted).toBe(false);
    expect(json.reviews).toHaveLength(1);
    expect(json.costUsd).toBeCloseTo(0.0012, 5);
    expect(supabase.__updateCalls).toHaveLength(0);
    expect(supabase.__insertCalls).toHaveLength(1);
  });

  it('Finding 2: falha no insert de radar_searches não perde os resultados pagos, mas loga o erro', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const supabase = fakeSupabase({
      resultRow: { id: RESULT_ID, payload: PLACE, reviews: null, reviews_fetched_at: null },
      insertFails: true,
    });
    createClient.mockResolvedValue(supabase);
    runReviewsScrape.mockResolvedValue({
      runId: 'run_3',
      finished: true,
      costUsd: 0.003,
      reviews: [],
    });

    const res = await POST(req(VALID));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.reviews).toEqual([]);
    expect(json.costUsd).toBeCloseTo(0.003, 5);
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it('Finding 2: falha no update de radar_results devolve persisted: false mesmo com run.finished true', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const supabase = fakeSupabase({
      resultRow: { id: RESULT_ID, payload: PLACE, reviews: null, reviews_fetched_at: null },
      updateFails: true,
    });
    createClient.mockResolvedValue(supabase);
    runReviewsScrape.mockResolvedValue({
      runId: 'run_4',
      finished: true,
      costUsd: 0.003,
      reviews: [
        { reviewId: 'r4', text: 'ok', stars: 4, publishedAt: null, reviewerName: null },
      ],
    });

    const res = await POST(req(VALID));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.persisted).toBe(false);
    expect(json.reviews).toHaveLength(1);
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it('Finding 3: o placeId da linha autorizada é usado no scrape, ignorando qualquer placeId no body', async () => {
    const supabase = fakeSupabase({
      resultRow: { id: RESULT_ID, payload: PLACE, reviews: null, reviews_fetched_at: null },
    });
    createClient.mockResolvedValue(supabase);
    runReviewsScrape.mockResolvedValue({ runId: 'run_5', finished: true, costUsd: 0, reviews: [] });

    // placeId não faz mais parte do schema — mesmo enviado, é ignorado pelo
    // Zod .safeParse e nunca chega a influenciar o scrape.
    await POST(req({ ...VALID, placeId: 'ChIJ_alheio' }));

    expect(runReviewsScrape).toHaveBeenCalledWith(
      expect.objectContaining({ placeId: PLACE.placeId })
    );
    expect(runReviewsScrape).not.toHaveBeenCalledWith(
      expect.objectContaining({ placeId: 'ChIJ_alheio' })
    );
  });

  it('responde 503 com mensagem clara quando o token não está configurado', async () => {
    const { ApifyConfigError } = await vi.importActual<typeof import('@/lib/radar/apify')>('@/lib/radar/apify');
    createClient.mockResolvedValue(
      fakeSupabase({
        resultRow: { id: RESULT_ID, payload: PLACE, reviews: null, reviews_fetched_at: null },
      })
    );
    runReviewsScrape.mockRejectedValue(new ApifyConfigError());
    const res = await POST(req(VALID));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatch(/APIFY_TOKEN/);
  });
});
