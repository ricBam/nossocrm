/**
 * @fileoverview Tipos compartilhados do Radar de Clientes.
 * @module lib/radar/types
 */

/** Um lugar retornado pelo actor compass~crawler-google-places, já enxugado. */
export interface RadarPlace {
  placeId: string;
  title: string;
  categoryName: string | null;
  address: string | null;
  city: string | null;
  phone: string | null;
  website: string | null;
  /** Perfis sociais achados pelo add-on scrapeContacts. */
  socials: string[];
  totalScore: number | null;
  reviewsCount: number | null;
  url: string | null;
  /** Sempre 'google_maps'. Procedência exigida pela constituição. */
  source: 'google_maps';
  /** ISO 8601. Quando este registro foi coletado. */
  collectedAt: string;
}

/** Uma avaliação do Google, como devolvida pelo actor de reviews. */
export interface RadarReview {
  reviewId: string;
  text: string;
  stars: number | null;
  /** ISO 8601. */
  publishedAt: string | null;
  reviewerName: string | null;
}

/** Uma linha do score, sempre visível ao usuário. */
export interface ScoreBreakdownItem {
  label: string;
  points: number;
  /** true quando o sinal foi atendido; false quando somou zero. */
  matched: boolean;
  /** Preenchido quando o sinal não pôde ser avaliado ainda (ex: faltam avaliações). */
  pending?: boolean;
}

export interface RadarScore {
  score: number;
  breakdown: ScoreBreakdownItem[];
  disqualified: boolean;
  disqualifyReasons: string[];
}

export interface SearchParams {
  nicho: string;
  cidade: string;
  uf: string;
  maxResults: number;
  semSite: boolean;
  semRedeSocial: boolean;
  notaMin: number | null;
  notaMax: number | null;
  minAvaliacoes: number | null;
  ordenarPor: 'avaliacoes' | 'nota' | 'score';
}
