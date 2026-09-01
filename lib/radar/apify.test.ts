import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mapPlace, runPlacesSearch, ApifyConfigError } from '@/lib/radar/apify';

const COLLECTED = '2026-08-31T00:00:00.000Z';

describe('mapPlace', () => {
  it('enxuga o registro bruto e carimba procedência e data de coleta', () => {
    const out = mapPlace(
      {
        placeId: 'ChIJ_1',
        title: 'Clínica Sorriso',
        primaryTypeDisplayName: 'Clínica odontológica',
        categories: ['dental_clinic'],
        formattedAddress: 'Rua A, 100',
        city: 'Resende',
        phone: '+55 24 3300-1122',
        website: 'https://sorriso.com.br',
        rating: 4.3,
        reviewCount: 87,
        googleMapsUri: 'https://maps.google.com/?cid=1',
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

  it('cai para o primeiro slug de categories quando falta primaryTypeDisplayName', () => {
    const out = mapPlace({ placeId: 'ChIJ_1', title: 'X', categories: ['dentist', 'health'] }, COLLECTED);
    expect(out!.categoryName).toBe('dentist');
  });

  it('sempre devolve socials vazio: o actor kaix não tem add-on de contatos', () => {
    const out = mapPlace({ placeId: 'ChIJ_1', title: 'X' }, COLLECTED);
    expect(out!.socials).toEqual([]);
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
      runPlacesSearch({ nicho: 'clínica odontológica', cidade: 'Resende', uf: 'RJ', maxResults: 3 })
    ).rejects.toBeInstanceOf(ApifyConfigError);
  });

  it('manda pt-BR, o modo basic e o limite de resultados no input do actor', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: { id: 'run_1', defaultDatasetId: 'ds_1', usageTotalUsd: 0.0125, status: 'SUCCEEDED' },
      }), { status: 201, headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify([
        { placeId: 'ChIJ_1', title: 'Clínica A', rating: 4.1, reviewCount: 60 },
      ]), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    const out = await runPlacesSearch({
      nicho: 'clínica odontológica', cidade: 'Resende', uf: 'RJ', maxResults: 3,
    });

    expect(String(fetchMock.mock.calls[0][0])).toContain('kaix~google-maps-places-scraper');
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body).toMatchObject({
      query: 'clínica odontológica',
      location: 'Resende, RJ, Brazil',
      maxResults: 3,
      mode: 'basic',
      language: 'pt-BR',
    });
    expect(out.runId).toBe('run_1');
    expect(out.costUsd).toBeCloseTo(0.0125, 5);
    expect(out.places).toHaveLength(1);
  });

  it('descarta empresas com businessStatus diferente de OPERATIONAL', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: { id: 'run_1', defaultDatasetId: 'ds_1', usageTotalUsd: 0, status: 'SUCCEEDED' },
      }), { status: 201, headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify([
        { placeId: 'ChIJ_1', title: 'Aberta', businessStatus: 'OPERATIONAL' },
        { placeId: 'ChIJ_2', title: 'Fechada', businessStatus: 'CLOSED_PERMANENTLY' },
      ]), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    const out = await runPlacesSearch({ nicho: 'x', cidade: 'Resende', uf: 'RJ', maxResults: 2 });
    expect(out.places).toHaveLength(1);
    expect(out.places[0].placeId).toBe('ChIJ_1');
  });

  it('nunca põe o token na URL, só no header Authorization', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: { id: 'run_1', defaultDatasetId: 'ds_1', usageTotalUsd: 0, status: 'SUCCEEDED' },
      }), { status: 201, headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    await runPlacesSearch({ nicho: 'x', cidade: 'Resende', uf: 'RJ', maxResults: 1 });

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
      runPlacesSearch({ nicho: 'x', cidade: 'Resende', uf: 'RJ', maxResults: 1 })
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

    const out = await runPlacesSearch({ nicho: 'x', cidade: 'Resende', uf: 'RJ', maxResults: 3 });
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

    const out = await runPlacesSearch({ nicho: 'x', cidade: 'Resende', uf: 'RJ', maxResults: 1 });
    expect(out.finished).toBe(true);
  });

  it('marca finished=false quando o run continua RUNNING mesmo após esgotar as tentativas de reconciliação', async () => {
    // waitForFinish é limitado a 60s por chamada — nem a chamada inicial nem
    // os polls de reconciliação são garantia de término. Depois de esgotar as
    // tentativas, o Apify ainda pode devolver o run em andamento.
    const runningResponse = () => new Response(JSON.stringify({
      data: { id: 'run_1', defaultDatasetId: 'ds_1', usageTotalUsd: 0.02, status: 'RUNNING' },
    }), { status: 201, headers: { 'content-type': 'application/json' } });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(runningResponse()) // POST inicial
      .mockResolvedValueOnce(runningResponse()) // poll 1
      .mockResolvedValueOnce(runningResponse()) // poll 2
      .mockResolvedValueOnce(runningResponse()) // poll 3 (MAX_RECONCILE_POLLS)
      .mockResolvedValueOnce(new Response(JSON.stringify([
        { placeId: 'ChIJ_1', title: 'Parcial' },
      ]), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    const out = await runPlacesSearch({ nicho: 'x', cidade: 'Resende', uf: 'RJ', maxResults: 10 });
    expect(out.finished).toBe(false);
    // O que veio até aqui é devolvido: o dinheiro já saiu, jogar fora seria pior.
    expect(out.places).toHaveLength(1);
    expect(out.costUsd).toBeCloseTo(0.02, 5);
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it('reconcilia o custo quando o poll seguinte devolve o run terminado com gasto maior', async () => {
    // O snapshot inicial (`waitForFinish` estourado) pode trazer um custo que
    // é só o gasto ATÉ AQUELE INSTANTE, não o final — isto é o que corrige o
    // bug de subcontagem: o `costUsd` devolvido tem que ser o do ÚLTIMO poll,
    // não o da chamada inicial.
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: { id: 'run_1', defaultDatasetId: 'ds_1', usageTotalUsd: 0.00005, status: 'RUNNING' },
      }), { status: 201, headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: { id: 'run_1', defaultDatasetId: 'ds_1', usageTotalUsd: 0.00335, status: 'SUCCEEDED' },
      }), { status: 200, headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify([
        { placeId: 'ChIJ_1', title: 'Completa' },
      ]), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    const out = await runPlacesSearch({ nicho: 'x', cidade: 'Resende', uf: 'RJ', maxResults: 10 });
    expect(out.finished).toBe(true);
    expect(out.costUsd).toBeCloseTo(0.00335, 5);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
