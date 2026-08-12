import { describe, expect, it } from 'vitest';
import { formatBRL, formatDateBR } from '@/lib/utils/formatCurrency';

describe('formatBRL', () => {
  it('formata valores positivos em BRL pt-BR', () => {
    expect(formatBRL(1234.56)).toBe('R$\xa01.234,56');
  });

  it('formata zero', () => {
    expect(formatBRL(0)).toBe('R$\xa00,00');
  });

  it('formata valores negativos com o sinal', () => {
    expect(formatBRL(-50)).toBe('-R$\xa050,00');
  });
});

describe('formatDateBR', () => {
  it('formata data ISO (YYYY-MM-DD) para DD/MM/AAAA', () => {
    expect(formatDateBR('2026-03-05')).toBe('05/03/2026');
  });
});
