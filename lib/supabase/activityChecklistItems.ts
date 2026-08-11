/**
 * @fileoverview Serviço Supabase para o checklist simples de uma atividade
 * (Central de Tarefas, Fase 1 — CRUD sem reorder).
 *
 * Tabela nova (`activity_checklist_items`), criada pela migration
 * `20260810130000_task_center_activities_fields.sql`. Como é uma tabela
 * genuinamente nova (não uma coluna adicionada numa tabela existente), não
 * precisa do retry defensivo usado em `lib/supabase/activities.ts` — antes
 * da migration ser aplicada, a tabela simplesmente não existe e todas as
 * chamadas aqui falham com erro claro (`42P01`), o que é aceitável: o
 * checklist é uma feature nova, não um campo que código legado já espera.
 *
 * @module lib/supabase/activityChecklistItems
 */

import { supabase } from './client';
import { ActivityChecklistItem } from '@/types';
import { sanitizeUUID } from './utils';

export interface DbActivityChecklistItem {
  id: string;
  activity_id: string;
  organization_id: string;
  title: string;
  is_done: boolean;
  position: number;
  created_at: string;
}

const transformChecklistItem = (db: DbActivityChecklistItem): ActivityChecklistItem => ({
  id: db.id,
  activityId: db.activity_id,
  organizationId: db.organization_id,
  title: db.title,
  isDone: db.is_done,
  position: db.position,
  createdAt: db.created_at,
});

async function getCurrentOrganizationId(): Promise<string | null> {
  if (!supabase) return null;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', user.id)
    .single();
  return (profile as any)?.organization_id ?? null;
}

export const activityChecklistItemsService = {
  /**
   * Busca os itens de checklist de uma atividade, ordenados por posição.
   */
  async listByActivity(
    activityId: string
  ): Promise<{ data: ActivityChecklistItem[] | null; error: Error | null }> {
    try {
      const sb = supabase;
      if (!sb) return { data: null, error: new Error('Supabase não configurado') };

      const { data, error } = await sb
        .from('activity_checklist_items')
        .select('*')
        .eq('activity_id', activityId)
        .order('position', { ascending: true })
        .order('created_at', { ascending: true });

      if (error) return { data: null, error };
      return {
        data: (data || []).map(item => transformChecklistItem(item as DbActivityChecklistItem)),
        error: null,
      };
    } catch (e) {
      return { data: null, error: e as Error };
    }
  },

  /**
   * Cria um item de checklist novo. `position` recebe o próximo inteiro
   * disponível (maior posição existente + 1) para manter a ordem de
   * criação — sem reorder ainda (Fase 2).
   */
  async create(
    activityId: string,
    title: string
  ): Promise<{ data: ActivityChecklistItem | null; error: Error | null }> {
    try {
      const sb = supabase;
      if (!sb) return { data: null, error: new Error('Supabase não configurado') };

      const sanitizedActivityId = sanitizeUUID(activityId);
      if (!sanitizedActivityId) {
        return { data: null, error: new Error('activityId inválido') };
      }

      const organizationId = await getCurrentOrganizationId();

      const { data: existing } = await sb
        .from('activity_checklist_items')
        .select('position')
        .eq('activity_id', sanitizedActivityId)
        .order('position', { ascending: false })
        .limit(1);

      const nextPosition = existing && existing.length > 0 ? (existing[0] as any).position + 1 : 0;

      const { data, error } = await sb
        .from('activity_checklist_items')
        .insert({
          activity_id: sanitizedActivityId,
          title,
          position: nextPosition,
          ...(organizationId ? { organization_id: organizationId } : {}),
        })
        .select()
        .single();

      if (error) return { data: null, error };
      return { data: transformChecklistItem(data as DbActivityChecklistItem), error: null };
    } catch (e) {
      return { data: null, error: e as Error };
    }
  },

  /**
   * Alterna `is_done` de um item.
   */
  async toggle(id: string, isDone: boolean): Promise<{ error: Error | null }> {
    try {
      const sb = supabase;
      if (!sb) return { error: new Error('Supabase não configurado') };

      const { error } = await sb
        .from('activity_checklist_items')
        .update({ is_done: isDone })
        .eq('id', id);

      return { error };
    } catch (e) {
      return { error: e as Error };
    }
  },

  /**
   * Renomeia um item de checklist.
   */
  async rename(id: string, title: string): Promise<{ error: Error | null }> {
    try {
      const sb = supabase;
      if (!sb) return { error: new Error('Supabase não configurado') };

      const { error } = await sb.from('activity_checklist_items').update({ title }).eq('id', id);
      return { error };
    } catch (e) {
      return { error: e as Error };
    }
  },

  /**
   * Exclui um item de checklist.
   */
  async delete(id: string): Promise<{ error: Error | null }> {
    try {
      const sb = supabase;
      if (!sb) return { error: new Error('Supabase não configurado') };

      const { error } = await sb.from('activity_checklist_items').delete().eq('id', id);
      return { error };
    } catch (e) {
      return { error: e as Error };
    }
  },
};
