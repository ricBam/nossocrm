import { z } from 'zod';

/**
 * Boolean tolerante a valores enviados como string ("true"/"false").
 *
 * Usar em qualquer campo boolean exposto como tool para um cliente MCP
 * (ver `lib/mcp/registerTools.ts`, `lib/mcp/tools/admin.ts`). Alguns
 * clientes MCP/agentes de IA serializam argumentos de tool call como
 * string mesmo quando o inputSchema exposto declara `type: "boolean"`
 * (achado real em produção: `crm.activities.create_task` com
 * `isFocusToday` — ver `interno/int-05-crm/diretrizes.md`). O schema
 * exposto via MCP (`tools/list`) continua reportando `type: "boolean"`
 * normalmente — só a validação em runtime fica tolerante.
 *
 * Continua rejeitando qualquer valor que não seja boolean nem a string
 * exata "true"/"false" (mesmo formato de erro do `z.boolean()` padrão).
 */
export function lenientBoolean() {
  return z.preprocess((value) => {
    if (typeof value === 'string') {
      if (value === 'true') return true;
      if (value === 'false') return false;
    }
    return value;
  }, z.boolean());
}
