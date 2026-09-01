/**
 * @fileoverview O âncora de busca do Radar: "ninguém responde".
 *
 * Estes termos servem a dois propósitos, os dois LOCAIS — o corte de custo do
 * actor é por data (`reviewsStartDate`, ver `lib/radar/apify.ts`), não por termo:
 * 1. Ordenar as avaliações buscadas, via `rankReviewsByAnchor`.
 * 2. Destaque na leitura, para o Ricardo escolher o trecho que vira citação.
 *
 * @module lib/radar/anchors
 */

import type { RadarReview } from './types';

/** Os termos do âncora, na grafia canônica com acento. */
export const ANCHOR_TERMS: string[] = [
  'não atende',
  'não responde',
  'não retorna',
  'liguei',
  'whatsapp',
  'remarcar',
  'demora',
  'agendamento',
  'ninguém',
];

/**
 * Termos prontos para `reviewsFilterString` do actor.
 * O actor trata a string como lista de palavras-chave separadas por espaço.
 */
export const APIFY_REVIEWS_FILTER: string = ANCHOR_TERMS.join(' ');

/** Quantos caracteres de contexto mostrar de cada lado do termo. */
const SNIPPET_PADDING = 60;

export interface AnchorMatch {
  /** O termo canônico que casou. */
  term: string;
  /** Índice inicial no texto ORIGINAL da avaliação. */
  start: number;
  /** Índice final (exclusivo) no texto ORIGINAL. */
  end: number;
  /** Trecho com contexto, pronto para virar citação. */
  snippet: string;
}

/**
 * Remove acentos e baixa a caixa, preservando o comprimento de cada caractere
 * para que os índices continuem válidos no texto original.
 */
function foldPreservingLength(text: string): string {
  return Array.from(text)
    .map(ch => {
      const folded = ch
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
      // Se a dobra mudou o comprimento, devolve o original em minúscula
      // para não deslocar os índices.
      return folded.length === 1 ? folded : ch.toLowerCase();
    })
    .join('');
}

/**
 * Acha todas as ocorrências dos termos do âncora numa avaliação.
 *
 * @returns Uma entrada por termo distinto encontrado, na ordem em que aparecem.
 */
export function findAnchorMatches(review: RadarReview): AnchorMatch[] {
  const text = review.text ?? '';
  if (!text.trim()) return [];

  const haystack = foldPreservingLength(text);
  const matches: AnchorMatch[] = [];

  for (const term of ANCHOR_TERMS) {
    const needle = foldPreservingLength(term);
    const start = haystack.indexOf(needle);
    if (start === -1) continue;
    const end = start + needle.length;
    const from = Math.max(0, start - SNIPPET_PADDING);
    const to = Math.min(text.length, end + SNIPPET_PADDING);
    matches.push({
      term,
      start,
      end,
      snippet: (from > 0 ? '…' : '') + text.slice(from, to).trim() + (to < text.length ? '…' : ''),
    });
  }

  return matches.sort((a, b) => a.start - b.start);
}

/**
 * Ordena avaliações pela quantidade de termos do âncora que casam,
 * desempatando pela mais recente. Não altera o array recebido.
 */
export function rankReviewsByAnchor(reviews: RadarReview[]): RadarReview[] {
  return [...reviews].sort((a, b) => {
    const diff = findAnchorMatches(b).length - findAnchorMatches(a).length;
    if (diff !== 0) return diff;
    const ta = a.publishedAt ? Date.parse(a.publishedAt) : 0;
    const tb = b.publishedAt ? Date.parse(b.publishedAt) : 0;
    return (Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0);
  });
}
