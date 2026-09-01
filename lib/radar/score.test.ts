import { describe, expect, it } from 'vitest';
import { computeScore, ICP_NICHES, CHAIN_MARKERS } from '@/lib/radar/score';
import type { RadarPlace, RadarReview } from '@/lib/radar/types';

const NOW = new Date('2026-08-31T00:00:00Z');

function place(over: Partial<RadarPlace> = {}): RadarPlace {
  return {
    placeId: 'ChIJ_teste',
    title: 'Clínica Odontológica Sorriso',
    categoryName: 'Clínica odontológica',
    address: 'Rua A, 100',
    city: 'Resende',
    phone: '+552433001122',
    website: null,
    socials: [],
    totalScore: 4.2,
    reviewsCount: 120,
    url: null,
    source: 'google_maps',
    collectedAt: NOW.toISOString(),
    ...over,
  };
}

function review(over: Partial<RadarReview> = {}): RadarReview {
  return {
    reviewId: 'r1',
    text: 'Liguei três vezes e ninguém responde.',
    stars: 2,
    publishedAt: '2026-07-01T00:00:00Z',
    reviewerName: 'Fulano',
    ...over,
  };
}

describe('computeScore — pontos positivos', () => {
  it('soma 2 para nota entre 3,5 e 4,7 inclusive nas bordas', () => {
    for (const nota of [3.5, 4.2, 4.7]) {
      const r = computeScore(place({ totalScore: nota }), { now: NOW });
      expect(r.breakdown.find(b => b.label.includes('Nota entre 3,5 e 4,7'))).toMatchObject({
        points: 2, matched: true,
      });
    }
  });

  it('não soma a nota quando está acima de 4,7 (bom demais para ter dor)', () => {
    const r = computeScore(place({ totalScore: 4.9 }), { now: NOW });
    expect(r.breakdown.find(b => b.label.includes('Nota entre 3,5 e 4,7'))).toMatchObject({
      points: 0, matched: false,
    });
  });

  it('soma 2 para 50 ou mais avaliações', () => {
    const r = computeScore(place({ reviewsCount: 50 }), { now: NOW });
    expect(r.breakdown.find(b => b.label.includes('50 ou mais avaliações'))).toMatchObject({
      points: 2, matched: true,
    });
  });

  it('soma 1 quando há telefone', () => {
    const r = computeScore(place(), { now: NOW });
    expect(r.breakdown.find(b => b.label === 'Telefone presente')).toMatchObject({
      points: 1, matched: true,
    });
  });

  it('não soma telefone quando o campo vem vazio', () => {
    const r = computeScore(place({ phone: '  ' }), { now: NOW });
    expect(r.breakdown.find(b => b.label === 'Telefone presente')).toMatchObject({
      points: 0, matched: false,
    });
  });

  it('soma 1 quando a categoria está nos nichos do ICP', () => {
    const r = computeScore(place({ categoryName: 'Clínica odontológica' }), { now: NOW });
    expect(r.breakdown.find(b => b.label.includes('nichos do ICP'))).toMatchObject({
      points: 1, matched: true,
    });
  });

  it('não soma categoria fora do ICP', () => {
    const r = computeScore(place({ categoryName: 'Loja de fogos de artifício' }), { now: NOW });
    expect(r.breakdown.find(b => b.label.includes('nichos do ICP'))).toMatchObject({
      points: 0, matched: false,
    });
  });
});

describe('computeScore — o sinal de avaliação recente', () => {
  it('fica pendente e vale zero quando as avaliações não foram puxadas', () => {
    const r = computeScore(place(), { now: NOW });
    const linha = r.breakdown.find(b => b.label.includes('últimos 180 dias'));
    expect(linha).toMatchObject({ points: 0, matched: false, pending: true });
  });

  it('soma 3 para avaliação dos últimos 180 dias citando demora ou resposta', () => {
    const r = computeScore(place(), { now: NOW, reviews: [review()] });
    expect(r.breakdown.find(b => b.label.includes('últimos 180 dias'))).toMatchObject({
      points: 3, matched: true, pending: undefined,
    });
  });

  it('não soma quando a avaliação casa o termo mas é mais velha que 180 dias', () => {
    const antiga = review({ publishedAt: '2025-12-01T00:00:00Z' });
    const r = computeScore(place(), { now: NOW, reviews: [antiga] });
    expect(r.breakdown.find(b => b.label.includes('últimos 180 dias'))).toMatchObject({
      points: 0, matched: false,
    });
  });

  it('não soma quando a avaliação é recente mas não fala de demora nem resposta', () => {
    const boa = review({ text: 'Atendimento excelente, recomendo muito.' });
    const r = computeScore(place(), { now: NOW, reviews: [boa] });
    expect(r.breakdown.find(b => b.label.includes('últimos 180 dias'))).toMatchObject({
      points: 0, matched: false,
    });
  });

  it('ignora avaliação sem data em vez de assumir que é recente', () => {
    const semData = review({ publishedAt: null });
    const r = computeScore(place(), { now: NOW, reviews: [semData] });
    expect(r.breakdown.find(b => b.label.includes('últimos 180 dias'))).toMatchObject({
      points: 0, matched: false,
    });
  });
});

describe('computeScore — desqualificação', () => {
  it('desqualifica nota abaixo de 3,0', () => {
    const r = computeScore(place({ totalScore: 2.9 }), { now: NOW });
    expect(r.disqualified).toBe(true);
    expect(r.disqualifyReasons).toContain('Nota abaixo de 3,0');
  });

  it('desqualifica menos de 50 avaliações', () => {
    const r = computeScore(place({ reviewsCount: 49 }), { now: NOW });
    expect(r.disqualified).toBe(true);
    expect(r.disqualifyReasons).toContain('Menos de 50 avaliações');
  });

  it('desqualifica quando o nome sugere rede ou franquia', () => {
    const r = computeScore(place({ title: 'OdontoCompany Resende — Unidade Centro' }), { now: NOW });
    expect(r.disqualified).toBe(true);
    expect(r.disqualifyReasons.some(m => m.startsWith('Nome sugere rede ou franquia'))).toBe(true);
  });

  it('acumula mais de um motivo quando há mais de um', () => {
    const r = computeScore(place({ totalScore: 2.0, reviewsCount: 3 }), { now: NOW });
    expect(r.disqualifyReasons).toHaveLength(2);
  });

  it('mantém o score calculado mesmo desqualificada, para o motivo continuar visível', () => {
    const r = computeScore(place({ reviewsCount: 10 }), { now: NOW });
    expect(r.disqualified).toBe(true);
    // nota 4,2 (+2) + telefone (+1) + categoria ICP (+1); avaliações não pontuam
    expect(r.score).toBe(4);
    expect(r.breakdown.length).toBeGreaterThan(0);
  });
});

describe('computeScore — soma total', () => {
  it('soma todos os sinais de uma empresa ideal com avaliação casada', () => {
    const r = computeScore(place(), { now: NOW, reviews: [review()] });
    // 2 nota + 2 avaliações + 3 recente + 1 telefone + 1 categoria
    expect(r.score).toBe(9);
    expect(r.disqualified).toBe(false);
  });

  it('trata nota e contagem nulas sem quebrar', () => {
    const r = computeScore(place({ totalScore: null, reviewsCount: null }), { now: NOW });
    expect(r.disqualified).toBe(true);
    expect(Number.isFinite(r.score)).toBe(true);
  });
});

describe('constantes', () => {
  it('expõe os nichos do ICP e os marcadores de rede em minúsculas', () => {
    expect(ICP_NICHES.length).toBeGreaterThan(0);
    expect(ICP_NICHES.every(n => n === n.toLowerCase())).toBe(true);
    expect(CHAIN_MARKERS.every(n => n === n.toLowerCase())).toBe(true);
  });
});
