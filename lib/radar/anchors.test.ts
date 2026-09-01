import { describe, expect, it } from 'vitest';
import {
  ANCHOR_TERMS,
  APIFY_REVIEWS_FILTER,
  findAnchorMatches,
  rankReviewsByAnchor,
} from '@/lib/radar/anchors';
import type { RadarReview } from '@/lib/radar/types';

function review(text: string, over: Partial<RadarReview> = {}): RadarReview {
  return {
    reviewId: 'r',
    text,
    stars: 3,
    publishedAt: '2026-08-01T00:00:00Z',
    reviewerName: null,
    ...over,
  };
}

describe('ANCHOR_TERMS', () => {
  it('contém os nove termos do âncora "ninguém responde"', () => {
    for (const t of ['não atende', 'não responde', 'não retorna', 'liguei', 'whatsapp', 'remarcar', 'demora', 'agendamento', 'ninguém']) {
      expect(ANCHOR_TERMS).toContain(t);
    }
  });
});

describe('APIFY_REVIEWS_FILTER', () => {
  it('junta os termos numa string única para o campo reviewsFilterString', () => {
    expect(typeof APIFY_REVIEWS_FILTER).toBe('string');
    expect(APIFY_REVIEWS_FILTER).toContain('demora');
    expect(APIFY_REVIEWS_FILTER.length).toBeGreaterThan(0);
  });
});

describe('findAnchorMatches', () => {
  it('acha o termo e devolve as posições exatas no texto original', () => {
    const r = review('Ligação nunca atendida, muita demora para responder.');
    const m = findAnchorMatches(r);
    const demora = m.find(x => x.term === 'demora');
    expect(demora).toBeDefined();
    expect(r.text.slice(demora!.start, demora!.end).toLowerCase()).toBe('demora');
  });

  it('casa mesmo quando o texto está sem acento', () => {
    const m = findAnchorMatches(review('Ninguem responde o whatsapp deles.'));
    expect(m.map(x => x.term)).toContain('ninguém');
  });

  it('casa mesmo quando o texto está em caixa alta', () => {
    const m = findAnchorMatches(review('LIGUEI TRÊS VEZES E NADA'));
    expect(m.map(x => x.term)).toContain('liguei');
  });

  it('devolve lista vazia quando nada casa', () => {
    expect(findAnchorMatches(review('Atendimento impecável, equipe nota dez.'))).toEqual([]);
  });

  it('devolve um trecho com contexto ao redor do termo', () => {
    const r = review('Fui muito bem recebido mas tive que remarcar quatro vezes seguidas por telefone.');
    const m = findAnchorMatches(r);
    expect(m[0].snippet).toContain('remarcar');
    expect(m[0].snippet.length).toBeGreaterThan('remarcar'.length);
  });

  it('acha vários termos distintos na mesma avaliação', () => {
    const m = findAnchorMatches(review('Liguei, mandei whatsapp, e ninguém responde.'));
    expect(m.length).toBeGreaterThanOrEqual(3);
  });

  it('não quebra com texto vazio', () => {
    expect(findAnchorMatches(review(''))).toEqual([]);
  });
});

describe('rankReviewsByAnchor', () => {
  it('põe as avaliações com mais casamentos na frente', () => {
    const nenhum = review('Tudo ótimo.', { reviewId: 'a' });
    const um = review('Que demora.', { reviewId: 'b' });
    const tres = review('Liguei, mandei whatsapp, ninguém responde.', { reviewId: 'c' });
    const out = rankReviewsByAnchor([nenhum, um, tres]);
    expect(out.map(r => r.reviewId)).toEqual(['c', 'b', 'a']);
  });

  it('não altera o array recebido', () => {
    const entrada = [review('Tudo ótimo.', { reviewId: 'a' }), review('Demora.', { reviewId: 'b' })];
    const copia = [...entrada];
    rankReviewsByAnchor(entrada);
    expect(entrada).toEqual(copia);
  });

  it('desempata pela avaliação mais recente', () => {
    const velha = review('Demora.', { reviewId: 'velha', publishedAt: '2025-01-01T00:00:00Z' });
    const nova = review('Demora.', { reviewId: 'nova', publishedAt: '2026-08-01T00:00:00Z' });
    expect(rankReviewsByAnchor([velha, nova]).map(r => r.reviewId)).toEqual(['nova', 'velha']);
  });
});
