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

import type { RadarPlace } from './types';

const APIFY_BASE = 'https://api.apify.com/v2';
const PLACES_ACTOR = 'kaix~google-maps-places-scraper';

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

/**
 * Converte um registro bruto do dataset do kaix/google-maps-places-scraper
 * num `RadarPlace`.
 *
 * @returns `null` quando falta `placeId` ou `title` — sem eles o registro não
 *   serve nem para dedupe nem para leitura.
 */
export function mapPlace(raw: Record<string, unknown>, collectedAt: string): RadarPlace | null {
  if (!raw || typeof raw !== 'object') return null;
  const placeId = str(raw.placeId);
  const title = str(raw.title);
  if (!placeId || !title) return null;

  const categories = Array.isArray(raw.categories)
    ? raw.categories.filter((c): c is string => typeof c === 'string')
    : [];

  return {
    placeId,
    title,
    // `primaryTypeDisplayName` respeita `language: 'pt-BR'` do input; `categories`
    // são slugs em inglês da Places API e servem só de fallback.
    categoryName: str(raw.primaryTypeDisplayName) ?? categories[0] ?? null,
    address: str(raw.formattedAddress),
    city: str(raw.city),
    phone: str(raw.phone),
    website: str(raw.website),
    // O actor kaix não tem equivalente ao add-on `scrapeContacts` do actor
    // antigo — não há como enriquecer perfis sociais a partir do site.
    socials: [],
    totalScore: num(raw.rating),
    reviewsCount: num(raw.reviewCount),
    url: str(raw.googleMapsUri),
    source: 'google_maps',
    collectedAt,
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

const TERMINAL_STATUSES = new Set(['SUCCEEDED', 'FAILED', 'ABORTED', 'TIMED-OUT']);

/**
 * Quantos long-polls de reconciliação fazer além da chamada inicial. Cada
 * chamada já bloqueia até 60s no servidor do Apify (é o próprio `waitForFinish`
 * que segura a conexão), então isto NÃO é um sleep local — é só um teto de
 * quantas vezes perguntar de novo. 3 tentativas ⇒ até ~4 minutos de espera
 * total (1 inicial + 3), abaixo do `maxDuration = 300` das rotas que chamam
 * isto, com folga para o resto da rota (leituras/gravações no Supabase).
 */
const MAX_RECONCILE_POLLS = 3;

/**
 * Roda o actor de forma síncrona e devolve o run com o custo real.
 *
 * `usageTotalUsd` é o valor cobrado de verdade — nunca usar a estimativa aqui.
 *
 * ⚠️ `waitForFinish` é limitado pelo Apify a 60s POR CHAMADA, mesmo pedindo
 * mais — não é o teto real de espera do run. Um run mais lento que isso
 * volta com `status: 'RUNNING'` e um `usageTotalUsd` que é só o gasto ATÉ
 * AQUELE INSTANTE — não o custo final. Gravar esse valor como se fosse
 * definitivo SUBCONTA o gasto real no teto do ciclo, silenciosamente. Por
 * isso, quando o status não é terminal, isto continua fazendo long-poll em
 * `GET /actor-runs/{id}` (mesmo teto de 60s por chamada) até um status
 * terminal ou até `MAX_RECONCILE_POLLS` tentativas — sempre atualizando o
 * `costUsd` a cada resposta, para nunca devolver um snapshot de custo antigo.
 */
async function runActorSync(
  actor: string,
  input: Record<string, unknown>,
  token: string
): Promise<{ runId: string; datasetId: string; costUsd: number; finished: boolean }> {
  const res = await apifyFetch(
    `/acts/${actor}/runs?waitForFinish=60`,
    { method: 'POST', body: JSON.stringify(input) },
    token
  );
  const json = (await res.json()) as RunEnvelope;
  const runId = json.data?.id;
  const datasetId = json.data?.defaultDatasetId;
  if (!runId || !datasetId) throw new Error('Apify não devolveu runId ou datasetId.');

  let status = json.data?.status;
  let costUsd = json.data?.usageTotalUsd ?? 0;

  for (let attempt = 0; attempt < MAX_RECONCILE_POLLS && (!status || !TERMINAL_STATUSES.has(status)); attempt++) {
    const pollRes = await apifyFetch(`/actor-runs/${runId}?waitForFinish=60`, { method: 'GET' }, token);
    const pollJson = (await pollRes.json()) as RunEnvelope;
    status = pollJson.data?.status;
    costUsd = pollJson.data?.usageTotalUsd ?? costUsd;
  }

  return { runId, datasetId, costUsd, finished: status === 'SUCCEEDED' };
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
}

/**
 * Empresa fechada não é lead — descartada depois do run porque o actor kaix
 * não aceita um filtro de status de negócio no input (diferente do
 * `skipClosedPlaces` do actor antigo). O `place-scraped` já foi cobrado de
 * qualquer forma; isto só evita que a empresa fechada chegue à tela.
 */
function isOperational(raw: Record<string, unknown>): boolean {
  const status = raw.businessStatus;
  return typeof status !== 'string' || status === 'OPERATIONAL';
}

/**
 * Busca de descoberta no Google Maps.
 *
 * `mode: 'basic'` porque é o suficiente para os sinais do score (nota,
 * volume de avaliações, telefone, categoria) e o mais barato dos três modos.
 * `language: 'pt-BR'` é obrigatório: `ICP_NICHES` casa substring em
 * português contra `categoryName`, e sem este parâmetro a Places API devolve
 * `primaryTypeDisplayName` em inglês, zerando esse sinal para toda empresa.
 */
export async function runPlacesSearch(
  input: PlacesSearchInput
): Promise<{ runId: string; costUsd: number; finished: boolean; places: RadarPlace[] }> {
  const token = requireToken();
  const collectedAt = new Date().toISOString();

  const { runId, datasetId, costUsd, finished } = await runActorSync(
    PLACES_ACTOR,
    {
      query: input.nicho,
      location: `${input.cidade}, ${input.uf}, Brazil`,
      maxResults: input.maxResults,
      mode: 'basic',
      language: 'pt-BR',
    },
    token
  );

  const raw = await readDataset(datasetId, token);
  const places = raw
    .filter(isOperational)
    .map(item => mapPlace(item, collectedAt))
    .filter((p): p is RadarPlace => p !== null);

  return { runId, costUsd, finished, places };
}
