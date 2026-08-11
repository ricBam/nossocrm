import { beforeEach, describe, expect, it, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

// Mock do client service-role (mesmo padrão de test/tools.createTask.test.ts).
const activitiesQueryBuilder = {
  insert: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
  single: vi.fn(async () => ({
    data: { id: 'activity-1', title: 'Ligar para cliente', type: 'TASK' },
    error: null,
  })),
};

const supabaseMock = {
  from: vi.fn((table: string) => {
    if (table === 'activities') return activitiesQueryBuilder;
    throw new Error(`Unexpected table: ${table}`);
  }),
};

vi.mock('@/lib/supabase/staticAdminClient', () => ({
  createStaticAdminClient: () => supabaseMock,
}));

import { registerExistingCrmTools } from '@/lib/mcp/registerTools';
import { mcpContextStorage } from '@/lib/mcp/context';

/**
 * Regressão do bug real reportado em produção (2026-08-11): chamar
 * `crm.activities.create_task` via MCP externo com `isFocusToday: true`
 * falhava com "expected boolean, received string" — o valor chegava como
 * string no servidor mesmo o cliente enviando um boolean nativo.
 *
 * Investigação (ver `.claude/agent-memory/engenharia/memoria.md` e
 * `interno/int-05-crm/diretrizes.md`) NÃO confirmou a suspeita original de
 * que a extração de shape em `registerTools.ts` estivesse quebrada para
 * Zod v4 — testes diretos com as versões reais instaladas (zod 4.3.6,
 * @modelcontextprotocol/sdk 1.29.0) provam que a extração funciona
 * corretamente para campos boolean, e que o schema exposto via
 * `tools/list` já reportava `type: "boolean"` corretamente antes desta
 * mudança. A causa raiz exata (provavelmente o cliente MCP chamador
 * serializando o argumento como string antes de enviar) não pôde ser
 * confirmada nesta sessão.
 *
 * Este teste cobre a correção defensiva aplicada (`lenientBoolean`):
 * o schema exposto continua sendo `boolean`, um boolean nativo continua
 * funcionando, e agora uma string "true"/"false" (o que o cliente parece
 * ter enviado de fato) também é aceita — sem abrir mão de rejeitar
 * qualquer outro valor inválido.
 */
describe('registerExistingCrmTools — campos boolean expostos via MCP (crm.activities.create_task)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    activitiesQueryBuilder.insert.mockReturnThis();
    activitiesQueryBuilder.select.mockReturnThis();
  });

  async function setupClient() {
    const server = new McpServer({ name: 'test-crm', version: '1.0.0' });
    registerExistingCrmTools(server);

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'test-client', version: '1.0.0' });

    await Promise.all([
      client.connect(clientTransport),
      server.connect(serverTransport),
    ]);

    return client;
  }

  it('expõe isFocusToday com type "boolean" no inputSchema retornado por tools/list', async () => {
    const client = await setupClient();

    const { tools } = await client.listTools();
    const createTask = tools.find((t) => t.name === 'crm.activities.create_task');

    expect(createTask).toBeDefined();
    expect((createTask!.inputSchema.properties as any)?.isFocusToday).toMatchObject({
      type: 'boolean',
    });
  });

  it('aceita isFocusToday como boolean nativo (comportamento que já funcionava)', async () => {
    const client = await setupClient();

    await mcpContextStorage.run({ organizationId: 'org-1', userId: 'user-1' }, async () => {
      const result: any = await client.callTool({
        name: 'crm.activities.create_task',
        arguments: { title: 'Tarefa', isFocusToday: true },
      });
      expect(result.isError).not.toBe(true);
    });

    const payload = activitiesQueryBuilder.insert.mock.calls[0][0];
    expect(payload.is_focus_today).toBe(true);
  });

  it('aceita isFocusToday como string "true" (reproduz e corrige o erro real de produção)', async () => {
    const client = await setupClient();

    await mcpContextStorage.run({ organizationId: 'org-1', userId: 'user-1' }, async () => {
      const result: any = await client.callTool({
        name: 'crm.activities.create_task',
        arguments: { title: 'Tarefa', isFocusToday: 'true' as unknown as boolean },
      });
      expect(result.isError).not.toBe(true);
    });

    const payload = activitiesQueryBuilder.insert.mock.calls[0][0];
    expect(payload.is_focus_today).toBe(true);
  });

  it('continua rejeitando um valor de isFocusToday que não é boolean nem "true"/"false"', async () => {
    const client = await setupClient();

    const result: any = await client.callTool({
      name: 'crm.activities.create_task',
      arguments: { title: 'Tarefa', isFocusToday: 'garbage' as unknown as boolean },
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/expected.*boolean/i);
  });
});
