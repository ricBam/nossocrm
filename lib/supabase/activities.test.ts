import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Mock leve do client Supabase, simulando só o suficiente da fluent API
 * (`from().insert().select().single()` e `from().update().eq()`) para
 * testar o retry defensivo de colunas ausentes em `activitiesService`.
 *
 * As respostas de cada chamada são consumidas em ordem (fila), permitindo
 * simular "primeira tentativa falha com 42703, segunda tentativa funciona".
 */
let insertResponses: Array<{ data: unknown; error: unknown }> = [];
let updateResponses: Array<{ error: unknown }> = [];
let insertPayloads: Record<string, unknown>[] = [];
let updatePayloads: Record<string, unknown>[] = [];

vi.mock('./client', () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: null } }) },
    from: (_table: string) => ({
      insert: (payload: Record<string, unknown>) => {
        insertPayloads.push(payload);
        return {
          select: () => ({
            single: async () => insertResponses.shift(),
          }),
        };
      },
      update: (payload: Record<string, unknown>) => {
        updatePayloads.push(payload);
        return {
          eq: async () => updateResponses.shift(),
        };
      },
    }),
  },
}));

// Import depois do mock (Vitest já faz hoist do vi.mock, mas mantém a leitura clara).
const { activitiesService } = await import('./activities');

function undefinedColumnError(columnName: string) {
  return {
    code: '42703',
    message: `column "${columnName}" of relation "activities" does not exist`,
  };
}

beforeEach(() => {
  insertResponses = [];
  updateResponses = [];
  insertPayloads = [];
  updatePayloads = [];
});

describe('activitiesService.create — retry defensivo de colunas ausentes', () => {
  const baseActivity = {
    title: 'Ligar para cliente',
    type: 'CALL' as const,
    date: '2026-08-10T10:00:00.000Z',
    completed: false,
    dealId: '',
    dealTitle: '',
    user: { name: 'Eu', avatar: '' },
    status: 'todo' as const,
    priority: 'medium' as const,
  };

  it('cria com sucesso de primeira quando todas as colunas existem', async () => {
    insertResponses = [
      {
        data: {
          id: 'act-1',
          organization_id: 'org-1',
          title: baseActivity.title,
          description: null,
          type: 'CALL',
          date: baseActivity.date,
          completed: false,
          deal_id: null,
          contact_id: null,
          created_at: '2026-08-10T09:00:00.000Z',
          owner_id: null,
          status: 'todo',
          priority: 'medium',
        },
        error: null,
      },
    ];

    const { data, error } = await activitiesService.create(baseActivity as any);

    expect(error).toBeNull();
    expect(data?.status).toBe('todo');
    expect(data?.priority).toBe('medium');
    expect(insertPayloads).toHaveLength(1);
  });

  it('remove a coluna "status" e tenta de novo quando a migration ainda não foi aplicada', async () => {
    insertResponses = [
      { data: null, error: undefinedColumnError('status') },
      {
        data: {
          id: 'act-2',
          organization_id: 'org-1',
          title: baseActivity.title,
          description: null,
          type: 'CALL',
          date: baseActivity.date,
          completed: false,
          deal_id: null,
          contact_id: null,
          created_at: '2026-08-10T09:00:00.000Z',
          owner_id: null,
        },
        error: null,
      },
    ];

    const { data, error } = await activitiesService.create(baseActivity as any);

    expect(error).toBeNull();
    expect(data?.id).toBe('act-2');
    expect(insertPayloads).toHaveLength(2);
    expect(insertPayloads[0]).toHaveProperty('status');
    expect(insertPayloads[1]).not.toHaveProperty('status');
    // A segunda tentativa deve manter as outras colunas novas intactas.
    expect(insertPayloads[1]).toHaveProperty('priority', 'medium');
  });

  it('remove múltiplas colunas ausentes em sequência até conseguir inserir', async () => {
    insertResponses = [
      { data: null, error: undefinedColumnError('status') },
      { data: null, error: undefinedColumnError('priority') },
      {
        data: {
          id: 'act-3',
          organization_id: 'org-1',
          title: baseActivity.title,
          description: null,
          type: 'CALL',
          date: baseActivity.date,
          completed: false,
          deal_id: null,
          contact_id: null,
          created_at: '2026-08-10T09:00:00.000Z',
          owner_id: null,
        },
        error: null,
      },
    ];

    const { data, error } = await activitiesService.create(baseActivity as any);

    expect(error).toBeNull();
    expect(data?.id).toBe('act-3');
    expect(insertPayloads).toHaveLength(3);
    expect(insertPayloads[2]).not.toHaveProperty('status');
    expect(insertPayloads[2]).not.toHaveProperty('priority');
  });

  it('propaga erros que não são de coluna ausente sem tentar retry', async () => {
    insertResponses = [{ data: null, error: { code: '23505', message: 'duplicate key value' } }];

    const { data, error } = await activitiesService.create(baseActivity as any);

    expect(data).toBeNull();
    expect((error as any)?.code).toBe('23505');
    expect(insertPayloads).toHaveLength(1);
  });
});

describe('activitiesService.update — retry defensivo de colunas ausentes', () => {
  it('remove a coluna "time_sphere" ausente e tenta de novo', async () => {
    updateResponses = [{ error: undefinedColumnError('time_sphere') }, { error: null }];

    const { error } = await activitiesService.update('act-1', {
      title: 'Novo título',
      timeSphere: 'importante',
    });

    expect(error).toBeNull();
    expect(updatePayloads).toHaveLength(2);
    expect(updatePayloads[0]).toHaveProperty('time_sphere');
    expect(updatePayloads[1]).not.toHaveProperty('time_sphere');
    expect(updatePayloads[1]).toHaveProperty('title', 'Novo título');
  });

  it('retorna o erro original quando a coluna citada não está no payload (evita loop infinito)', async () => {
    updateResponses = [{ error: undefinedColumnError('some_other_column') }];

    const { error } = await activitiesService.update('act-1', { title: 'X' });

    expect((error as any)?.code).toBe('42703');
    expect(updatePayloads).toHaveLength(1);
  });
});
