/**
 * @fileoverview Score de qualidade do Radar — determinístico, sem LLM.
 *
 * Regra do produto: o número nunca é opaco. Toda pontuação sai acompanhada
 * do breakdown linha a linha, e empresa desqualificada continua na lista
 * marcada — sumir com ela esconderia o motivo.
 *
 * @module lib/radar/score
 */

import type { RadarPlace, RadarScore, ScoreBreakdownItem } from './types';

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

function line(label: string, points: number, matched: boolean): ScoreBreakdownItem {
  return { label, points: matched ? points : 0, matched };
}

/**
 * Calcula o score de uma empresa.
 *
 * @param place - Lugar vindo do Google Maps.
 */
export function computeScore(place: RadarPlace): RadarScore {
  const nota = place.totalScore;
  const qtd = place.reviewsCount;

  const notaNaFaixa = nota !== null && nota >= 3.5 && nota <= 4.7;
  const temVolume = qtd !== null && qtd >= 30;
  const temTelefone = (place.phone ?? '').trim().length > 0;
  const noIcp = containsAny(place.categoryName, ICP_NICHES);

  const breakdown: ScoreBreakdownItem[] = [
    line('Nota entre 3,5 e 4,7', 2, notaNaFaixa),
    line('30 ou mais avaliações', 2, temVolume),
    line('Telefone presente', 1, temTelefone),
    line('Categoria dentro dos nichos do ICP', 1, noIcp),
  ];

  const score = breakdown.reduce((acc, b) => acc + b.points, 0);

  const disqualifyReasons: string[] = [];
  if (nota === null || nota < 3.0) disqualifyReasons.push('Nota abaixo de 3,0');
  if (qtd === null || qtd < 30) disqualifyReasons.push('Menos de 30 avaliações');
  const chainHit = CHAIN_MARKERS.find(m => normalize(place.title).includes(normalize(m)));
  if (chainHit) disqualifyReasons.push(`Nome sugere rede ou franquia ("${chainHit.trim()}")`);

  return {
    score,
    breakdown,
    disqualified: disqualifyReasons.length > 0,
    disqualifyReasons,
  };
}
