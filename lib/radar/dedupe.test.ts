import { describe, expect, it } from 'vitest';
import { buildDedupeIndex, checkDuplicate } from '@/lib/radar/dedupe';

describe('buildDedupeIndex', () => {
  it('normaliza os telefones conhecidos para E.164', () => {
    const idx = buildDedupeIndex({ knownPlaceIds: [], knownPhones: ['(24) 3300-1122'] });
    expect(idx.phones.has('+552433001122')).toBe(true);
  });

  it('descarta telefone vazio, nulo e indefinido sem poluir o índice', () => {
    const idx = buildDedupeIndex({ knownPlaceIds: [], knownPhones: ['', '   ', null, undefined] });
    expect(idx.phones.size).toBe(0);
  });

  it('guarda os place_ids como vieram', () => {
    const idx = buildDedupeIndex({ knownPlaceIds: ['ChIJ_a', 'ChIJ_b'], knownPhones: [] });
    expect(idx.placeIds.has('ChIJ_a')).toBe(true);
    expect(idx.placeIds.size).toBe(2);
  });
});

describe('checkDuplicate', () => {
  const idx = buildDedupeIndex({
    knownPlaceIds: ['ChIJ_ja_visto'],
    knownPhones: ['+552433001122'],
  });

  it('marca duplicata por place_id', () => {
    const v = checkDuplicate({ placeId: 'ChIJ_ja_visto', phone: null }, idx);
    expect(v).toEqual({ isDuplicate: true, reasons: ['place_id'] });
  });

  it('marca duplicata por telefone escrito de outro jeito', () => {
    const v = checkDuplicate({ placeId: 'ChIJ_novo', phone: '(24) 3300-1122' }, idx);
    expect(v).toEqual({ isDuplicate: true, reasons: ['phone'] });
  });

  it('acumula os dois motivos quando ambos batem', () => {
    const v = checkDuplicate({ placeId: 'ChIJ_ja_visto', phone: '+55 24 3300-1122' }, idx);
    expect(v.isDuplicate).toBe(true);
    expect(v.reasons).toEqual(['place_id', 'phone']);
  });

  it('não marca nada quando é empresa nova', () => {
    const v = checkDuplicate({ placeId: 'ChIJ_novo', phone: '+552499998888' }, idx);
    expect(v).toEqual({ isDuplicate: false, reasons: [] });
  });

  it('não marca duplicata quando o telefone da empresa é nulo', () => {
    const v = checkDuplicate({ placeId: 'ChIJ_novo', phone: null }, idx);
    expect(v.isDuplicate).toBe(false);
  });

  it('não trata telefone impossível de normalizar como duplicata de outro impossível', () => {
    const idxSujo = buildDedupeIndex({ knownPlaceIds: [], knownPhones: ['ramal 22'] });
    const v = checkDuplicate({ placeId: 'ChIJ_x', phone: 'ramal 33' }, idxSujo);
    expect(v.isDuplicate).toBe(false);
  });
});
