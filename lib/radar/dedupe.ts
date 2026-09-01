/**
 * @fileoverview Dedupe do Radar contra o que já existe.
 *
 * Duplicata NÃO bloqueia nada — apenas marca o card. A decisão continua sendo
 * de quem lê.
 *
 * @module lib/radar/dedupe
 */

import { normalizePhoneE164 } from '@/lib/phone';

export interface DedupeIndex {
  placeIds: Set<string>;
  phones: Set<string>;
}

export type DuplicateReason = 'place_id' | 'phone';

export interface DuplicateVerdict {
  isDuplicate: boolean;
  reasons: DuplicateReason[];
}

/**
 * `normalizePhoneE164` devolve o input trimado quando não consegue parsear.
 * Só entra no índice o que virou E.164 de verdade, senão dois lixos diferentes
 * poderiam colidir por acaso.
 */
function toIndexablePhone(raw: string | null | undefined): string | null {
  const e164 = normalizePhoneE164(raw, { defaultCountry: 'BR' });
  return e164.startsWith('+') ? e164 : null;
}

/**
 * Monta o índice a partir dos place_ids de buscas anteriores e dos telefones
 * de contatos que já existem no CRM.
 */
export function buildDedupeIndex(input: {
  knownPlaceIds: string[];
  knownPhones: (string | null | undefined)[];
}): DedupeIndex {
  const phones = new Set<string>();
  for (const raw of input.knownPhones) {
    const phone = toIndexablePhone(raw);
    if (phone) phones.add(phone);
  }
  return {
    placeIds: new Set(input.knownPlaceIds.filter(Boolean)),
    phones,
  };
}

/** Verifica um lugar contra o índice. Ordem dos motivos: place_id, depois phone. */
export function checkDuplicate(
  place: { placeId: string; phone: string | null },
  index: DedupeIndex
): DuplicateVerdict {
  const reasons: DuplicateReason[] = [];

  if (place.placeId && index.placeIds.has(place.placeId)) reasons.push('place_id');

  const phone = toIndexablePhone(place.phone);
  if (phone && index.phones.has(phone)) reasons.push('phone');

  return { isDuplicate: reasons.length > 0, reasons };
}
