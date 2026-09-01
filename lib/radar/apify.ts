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
 * `place-details-scraped`. NÃO há filtragem por termo — `findAnchorMatches`
 * só ordena e destaca localmente, sem custo, o que voltou dentro da janela de
 * 180 dias. A UI marca visivelmente uma avaliação sem nenhum termo do âncora.
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
