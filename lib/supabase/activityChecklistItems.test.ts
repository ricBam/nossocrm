import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Mock leve do client Supabase para os métodos usados por
 * `activityChecklistItemsService` (select/insert/update/delete
 * encadeados com eq/order/limit/single).
 */
let selectOrderLimitResult: { data: unknown[]; error: unknown } = { data: [], error: null };
let insertSingleResult: { data: unknown; error: unknown } = { data: null, error: null };
let updateEqResult: { error: unknown } = { error: null };
let deleteEqResult: { error: unknown } = { error: null };
let listSelectResult: { data: unknown[]; error: unknown } = { data: [], error: null };

let insertPayloads: Record<string, unknown>[] = [];
let updatePayloads: Record<string, unknown>[] = [];

vi.mock('./client', () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: null } }) },
    from: (_table: string) => ({
      // listByActivity: select('*').eq().order().order()
      // create's lookup: select('position').eq().order().limit()
      select: (columns: string) => {
        const builder = {
          eq: () => builder,
          order: () => builder,
          limit: async () => selectOrderLimitResult,
          then: (resolve: (v: unknown) => void) => {
            // Permite `await sb.from(...).select('*').eq(...).order(...).order(...)` (sem limit)
            resolve(columns === '*' ? listSelectResult : selectOrderLimitResult);
          },
        };
        return builder;
      },
      insert: (payload: Record<string, unknown>) => {
        insertPayloads.push(payload);
        return {
          select: () => ({
            single: async () => insertSingleResult,
          }),
        };
      },
      update: (payload: Record<string, unknown>) => {
        updatePayloads.push(payload);
        return {
          eq: async () => updateEqResult,
        };
      },
      delete: () => ({
        eq: async () => deleteEqResult,
      }),
    }),
  },
}));

const { activityChecklistItemsService } = await import('./activityChecklistItems');

beforeEach(() => {
  selectOrderLimitResult = { data: [], error: null };
  insertSingleResult = { data: null, error: null };
  updateEqResult = { error: null };
  deleteEqResult = { error: null };
  listSelectResult = { data: [], error: null };
  insertPayloads = [];
  updatePayloads = [];
});

describe('activityChecklistItemsService', () => {
  it('listByActivity transforma os itens do banco para o formato da aplicação', async () => {
    listSelectResult = {
      data: [
        {
          id: 'item-1',
          activity_id: 'act-1',
          organization_id: 'org-1',
          title: 'Ligar antes da reunião',
          is_done: false,
          position: 0,
          created_at: '2026-08-10T09:00:00.000Z',
        },
      ],
      error: null,
    };

    const { data, error } = await activityChecklistItemsService.listByActivity('act-1');

    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data![0]).toMatchObject({
      id: 'item-1',
      activityId: 'act-1',
      title: 'Ligar antes da reunião',
      isDone: false,
      position: 0,
    });
  });

  it('create usa position 0 quando não há itens ainda', async () => {
    selectOrderLimitResult = { data: [], error: null };
    insertSingleResult = {
      data: {
        id: 'item-2',
        activity_id: 'act-1',
        organization_id: 'org-1',
        title: 'Novo item',
        is_done: false,
        position: 0,
        created_at: '2026-08-10T09:00:00.000Z',
      },
      error: null,
    };

    const { data, error } = await activityChecklistItemsService.create(
      '123e4567-e89b-12d3-a456-426614174000',
      'Novo item'
    );

    expect(error).toBeNull();
    expect(data?.position).toBe(0);
    expect(insertPayloads[0]).toMatchObject({ position: 0, title: 'Novo item' });
  });

  it('create usa a próxima posição quando já existem itens', async () => {
    selectOrderLimitResult = { data: [{ position: 3 }], error: null };
    insertSingleResult = {
      data: {
        id: 'item-3',
        activity_id: 'act-1',
        organization_id: 'org-1',
        title: 'Mais um item',
        is_done: false,
        position: 4,
        created_at: '2026-08-10T09:00:00.000Z',
      },
      error: null,
    };

    await activityChecklistItemsService.create('123e4567-e89b-12d3-a456-426614174000', 'Mais um item');

    expect(insertPayloads[0]).toMatchObject({ position: 4 });
  });

  it('create rejeita activityId inválido sem chamar o banco', async () => {
    const { data, error } = await activityChecklistItemsService.create('not-a-uuid', 'Item');

    expect(data).toBeNull();
    expect(error).not.toBeNull();
    expect(insertPayloads).toHaveLength(0);
  });

  it('toggle envia is_done para a coluna correta', async () => {
    const { error } = await activityChecklistItemsService.toggle('item-1', true);

    expect(error).toBeNull();
    expect(updatePayloads[0]).toEqual({ is_done: true });
  });

  it('delete propaga erro do banco', async () => {
    deleteEqResult = { error: new Error('falhou') };

    const { error } = await activityChecklistItemsService.delete('item-1');

    expect(error).not.toBeNull();
  });
});
