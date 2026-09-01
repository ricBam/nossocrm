/**
 * Duas buscas que se sobrepõem — "dentista Resende" e "clínica odontológica
 * Resende" — são o fluxo pretendido, porque o Google Maps devolve categorias
 * por aproximação. Estes testes rodam contra um Supabase em memória de
 * verdade (linhas, upsert com ON CONFLICT, filtros) porque o defeito que eles
 * cobrem só aparece na SEGUNDA gravação: um mock que devolve linhas fixas não
 * consegue mostrar uma linha sendo roubada da busca anterior.
 */

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

type Row = Record<string, unknown>;

interface Db {
  profiles: Row[];
  radar_searches: Row[];
  radar_results: Row[];
  radar_search_results: Row[];
  contacts: Row[];
}

function place(placeId: string, title: string) {
  return {
    placeId,
    title,
    categoryName: 'Clínica odontológica',
    address: 'Rua A, 100',
    city: 'Resende',
    phone: null,
    website: null,
    socials: [],
    totalScore: 4.2,
    reviewsCount: 90,
    url: null,
    source: 'google_maps' as const,
    collectedAt: '2026-08-31T00:00:00.000Z',
  };
}

let idSeq = 0;
const novoId = () => `id_${++idSeq}`;

/**
 * Supabase em memória cobrindo exatamente as cadeias que a rota usa:
 * select/eq/gte/in/is/order/limit, insert().select().single(), upsert com
 * onConflict + ignoreDuplicates, e update().eq() awaited.
 */
function fakeSupabase(db: Db) {
  const from = (name: keyof Db) => {
    const filtros: ((r: Row) => boolean)[] = [];
    let ordenarPor: string | null = null;
    let ascendente = true;
    let limite: number | null = null;
    let modo: 'select' | 'update' | 'delete' = 'select';
    let patch: Row = {};

    const linhas = () => {
      let rows = db[name].filter((r) => filtros.every((f) => f(r)));
      if (ordenarPor) {
        const key = ordenarPor;
        rows = [...rows].sort((a, b) => {
          const cmp = String(a[key]).localeCompare(String(b[key]));
          return ascendente ? cmp : -cmp;
        });
      }
      if (limite !== null) rows = rows.slice(0, limite);
      return rows;
    };

    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: (col: string, val: unknown) => { filtros.push((r) => r[col] === val); return builder; },
      gte: (col: string, val: unknown) => { filtros.push((r) => String(r[col]) >= String(val)); return builder; },
      in: (col: string, vals: unknown[]) => { filtros.push((r) => vals.includes(r[col])); return builder; },
      is: (col: string, val: unknown) => { filtros.push((r) => (r[col] ?? null) === val); return builder; },
      order: (col: string, o?: { ascending?: boolean }) => { ordenarPor = col; ascendente = o?.ascending !== false; return builder; },
      limit: (n: number) => { limite = n; return builder; },
      maybeSingle: async () => ({ data: linhas()[0] ?? null, error: null }),
      single: async () => ({ data: linhas()[0] ?? null, error: null }),
      update: (p: Row) => { modo = 'update'; patch = p; return builder; },
      delete: () => { modo = 'delete'; return builder; },
      insert: (payload: Row) => {
        const row = { id: novoId(), created_at: new Date().toISOString(), ...payload };
        db[name].push(row);
        return {
          select: () => ({ single: async () => ({ data: row, error: null }) }),
          then: (r: (v: { data: Row; error: null }) => unknown) => r({ data: row, error: null }),
        };
      },
      upsert: async (payload: Row[], o?: { onConflict?: string; ignoreDuplicates?: boolean }) => {
        const chaves = (o?.onConflict ?? '').split(',').map((c) => c.trim()).filter(Boolean);
        for (const nova of payload) {
          const existente = chaves.length > 0
            ? db[name].find((r) => chaves.every((k) => r[k] === nova[k]))
            : undefined;
          if (existente) {
            // ON CONFLICT DO NOTHING vs DO UPDATE: no update, só as colunas
            // presentes no payload são reescritas — é exatamente essa
            // propriedade que protege score/reviews de uma re-busca.
            if (!o?.ignoreDuplicates) Object.assign(existente, nova);
          } else {
            db[name].push({ id: novoId(), created_at: new Date().toISOString(), ...nova });
          }
        }
        return { data: null, error: null };
      },
      then: (r: (v: { data: Row[] | null; error: null }) => unknown) => {
        if (modo === 'update') {
          for (const row of linhas()) Object.assign(row, patch);
          return r({ data: null, error: null });
        }
        if (modo === 'delete') {
          const alvo = new Set(linhas());
          db[name] = db[name].filter((row) => !alvo.has(row)) as Row[];
          return r({ data: null, error: null });
        }
        return r({ data: linhas(), error: null });
      },
    };
    return builder;
  };

  return {
    auth: { getUser: async () => ({ data: { user: { id: USER } }, error: null }) },
    from: (name: string) => from(name as keyof Db),
  };
}

function req(body: unknown) {
  return new Request('http://localhost/api/radar/search', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

let db: Db;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.RADAR_MONTHLY_BUDGET_USD = '5.00';
  idSeq = 0;
  db = {
    profiles: [{ id: USER, organization_id: ORG, role: 'admin' }],
    radar_searches: [],
    radar_results: [],
    radar_search_results: [],
    contacts: [],
  };
  createClient.mockResolvedValue(fakeSupabase(db));
});

const P_COMPARTILHADO = place('ChIJ_compartilhado', 'Clínica Compartilhada');

describe('POST /api/radar/search — um lugar pertence a todas as buscas que o acharam', () => {
  it('a segunda busca não esvazia o cache da primeira', async () => {
    runPlacesSearch.mockResolvedValueOnce({
      runId: 'run_a', finished: true, costUsd: 0.01,
      places: [place('ChIJ_so_da_a', 'Só da A'), P_COMPARTILHADO],
    });
    const buscaA = { nicho: 'dentista', cidade: 'Resende', uf: 'RJ', maxResults: 10 };
    const primeira = await POST(req(buscaA));
    expect(primeira.status).toBe(200);
    expect((await primeira.json()).results).toHaveLength(2);

    // Segunda busca, outro termo, mesma cidade: o Google devolve o mesmo lugar.
    runPlacesSearch.mockResolvedValueOnce({
      runId: 'run_b', finished: true, costUsd: 0.01,
      places: [P_COMPARTILHADO, place('ChIJ_so_da_b', 'Só da B')],
    });
    const segunda = await POST(req({ nicho: 'clínica odontológica', cidade: 'Resende', uf: 'RJ', maxResults: 10 }));
    expect(segunda.status).toBe(200);

    // O dedupe continua valendo: o lugar é UMA linha por organização.
    expect(db.radar_results).toHaveLength(3);

    // Repetir a primeira busca cai no cache — e precisa devolver os DOIS
    // lugares que ela achou, inclusive o que a segunda busca também achou.
    const cache = await POST(req(buscaA));
    const json = await cache.json();
    expect(cache.status).toBe(200);
    expect(json.origin).toBe('cache');
    expect(json.costUsd).toBe(0);
    expect(runPlacesSearch).toHaveBeenCalledTimes(2);
    expect(json.results.map((r: { place: { placeId: string } }) => r.place.placeId).sort())
      .toEqual(['ChIJ_compartilhado', 'ChIJ_so_da_a']);
  });

  it('o lugar compartilhado fica filiado às duas buscas', async () => {
    runPlacesSearch.mockResolvedValueOnce({
      runId: 'run_a', finished: true, costUsd: 0.01, places: [P_COMPARTILHADO],
    });
    await POST(req({ nicho: 'dentista', cidade: 'Resende', uf: 'RJ', maxResults: 10 }));
    runPlacesSearch.mockResolvedValueOnce({
      runId: 'run_b', finished: true, costUsd: 0.01, places: [P_COMPARTILHADO],
    });
    await POST(req({ nicho: 'clínica odontológica', cidade: 'Resende', uf: 'RJ', maxResults: 10 }));

    const linha = db.radar_results.find((r) => r.place_id === 'ChIJ_compartilhado')!;
    const filiacoes = db.radar_search_results.filter((l) => l.result_id === linha.id);
    expect(filiacoes).toHaveLength(2);
    expect(new Set(filiacoes.map((l) => l.search_id)).size).toBe(2);

    // `search_id` na própria linha é a busca que a DESCOBRIU e nunca é
    // reescrito — reescrevê-lo era o roubo que esvaziava o cache anterior.
    expect(linha.search_id).toBe(db.radar_searches[0].id);
  });
});

describe('POST /api/radar/search — re-busca não corrompe linha já enriquecida', () => {
  it('preserva score, breakdown e reviews_fetched_at de uma linha com avaliações', async () => {
    const enriquecida = {
      id: 'res_enriquecido',
      organization_id: ORG,
      search_id: 'search_antiga',
      place_id: P_COMPARTILHADO.placeId,
      payload: { ...P_COMPARTILHADO, title: 'Título antigo' },
      score: 9,
      score_breakdown: [{ label: 'Avaliações com dor', points: 3 }],
      disqualified: false,
      disqualify_reasons: [],
      reviews: [{ text: 'demorou demais', stars: 2 }],
      reviews_fetched_at: '2026-08-30T12:00:00.000Z',
      saved_deal_id: null,
      collected_at: '2026-08-30T12:00:00.000Z',
    };
    db.radar_results.push({ ...enriquecida });

    runPlacesSearch.mockResolvedValueOnce({
      runId: 'run_c', finished: true, costUsd: 0.01, places: [P_COMPARTILHADO],
    });
    const res = await POST(req({ nicho: 'dentista', cidade: 'Resende', uf: 'RJ', maxResults: 10 }));
    expect(res.status).toBe(200);

    const linha = db.radar_results.find((r) => r.place_id === P_COMPARTILHADO.placeId)!;

    // O que foi calculado COM avaliações continua de pé. Regravá-lo aqui
    // gravaria uma pontuação sem avaliações ao lado de `reviews` preenchido —
    // a linha afirmaria que as avaliações estão pendentes tendo-as consigo.
    expect(linha.score).toBe(9);
    expect(linha.score_breakdown).toEqual([{ label: 'Avaliações com dor', points: 3 }]);
    expect(linha.reviews).toEqual([{ text: 'demorou demais', stars: 2 }]);
    expect(linha.reviews_fetched_at).toBe('2026-08-30T12:00:00.000Z');
    expect(linha.search_id).toBe('search_antiga');

    // O payload em si é atualizado — é o dado fresco que a re-busca trouxe.
    expect((linha.payload as { title: string }).title).toBe('Clínica Compartilhada');
  });

  it('recalcula normalmente a linha que ainda não tem avaliações', async () => {
    db.radar_results.push({
      id: 'res_cru',
      organization_id: ORG,
      search_id: 'search_antiga',
      place_id: P_COMPARTILHADO.placeId,
      payload: P_COMPARTILHADO,
      score: 0,
      score_breakdown: [],
      disqualified: false,
      disqualify_reasons: [],
      reviews: null,
      reviews_fetched_at: null,
      saved_deal_id: null,
      collected_at: '2026-08-30T12:00:00.000Z',
    });

    runPlacesSearch.mockResolvedValueOnce({
      runId: 'run_d', finished: true, costUsd: 0.01, places: [P_COMPARTILHADO],
    });
    await POST(req({ nicho: 'dentista', cidade: 'Resende', uf: 'RJ', maxResults: 10 }));

    const linha = db.radar_results.find((r) => r.place_id === P_COMPARTILHADO.placeId)!;
    expect(Number(linha.score)).toBeGreaterThan(0);
    expect((linha.score_breakdown as unknown[]).length).toBeGreaterThan(0);
  });
});
