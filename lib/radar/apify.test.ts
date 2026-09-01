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
