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
    : { label, points: matched ? points : 0, matched, pending: undefined };
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
