import { describe, expect, it } from 'vitest';
import { lenientBoolean } from '@/lib/utils/lenientBoolean';

describe('lenientBoolean', () => {
  it('aceita boolean nativo', () => {
    expect(lenientBoolean().safeParse(true)).toMatchObject({ success: true, data: true });
    expect(lenientBoolean().safeParse(false)).toMatchObject({ success: true, data: false });
  });

  it('aceita string "true"/"false" e converte para boolean real', () => {
    expect(lenientBoolean().safeParse('true')).toMatchObject({ success: true, data: true });
    expect(lenientBoolean().safeParse('false')).toMatchObject({ success: true, data: false });
  });

  it('rejeita qualquer outro valor (string arbitrária, número, null)', () => {
    expect(lenientBoolean().safeParse('garbage')).toMatchObject({ success: false });
    expect(lenientBoolean().safeParse('1')).toMatchObject({ success: false });
    expect(lenientBoolean().safeParse(1)).toMatchObject({ success: false });
    expect(lenientBoolean().safeParse(null)).toMatchObject({ success: false });
  });

  it('compõe com .optional() e .describe() preservando comportamento (undefined passa)', () => {
    const schema = lenientBoolean().optional().describe('flag de teste');
    expect(schema.safeParse(undefined)).toMatchObject({ success: true, data: undefined });
    expect(schema.safeParse('true')).toMatchObject({ success: true, data: true });
  });

  it('compõe com .default() preservando o valor padrão quando omitido', () => {
    const schema = lenientBoolean().optional().default(true);
    expect(schema.parse(undefined)).toBe(true);
    expect(schema.parse('false')).toBe(false);
  });
});
