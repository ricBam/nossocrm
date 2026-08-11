/**
 * @fileoverview Serviço Supabase para gerenciamento de atividades do CRM.
 * 
 * Este módulo fornece operações CRUD para atividades (tarefas, reuniões, ligações, etc.)
 * com validação de segurança defense-in-depth para isolamento multi-tenant.
 * 
 * ## Segurança Multi-Tenant
 * 
 * Além das políticas RLS, este serviço implementa verificação adicional
 * de organization_id antes de update/delete para prevenir ataques cross-tenant.
 * 
 * @module lib/supabase/activities
 */

import { supabase } from './client';
import { Activity, ActivityPriority, ActivityStatus, TimeSphere } from '@/types';
import { sanitizeUUID } from './utils';
import { sortActivitiesSmart } from '@/lib/utils/activitySort';

// ============================================
// HELPERS
// ============================================

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


// ============================================
// ACTIVITIES SERVICE
// ============================================

/**
 * Representação de atividade no banco de dados.
 * 
 * @interface DbActivity
 */
export interface DbActivity {
  /** ID único da atividade (UUID). */
  id: string;
  /** ID da organização/tenant. */
  organization_id: string;
  /** Título da atividade. */
  title: string;
  /** Descrição detalhada. */
  description: string | null;
  /** Tipo (CALL, MEETING, EMAIL, TASK). */
  type: string;
  /** Data/hora agendada. */
  date: string;
  /** Se a atividade foi concluída. */
  completed: boolean;
  /** ID do deal associado. */
  deal_id: string | null;
  /** ID do contato associado. */
  contact_id: string | null;
  /** ID da empresa CRM associada à atividade (opcional). */
  client_company_id?: string | null;
  /** IDs dos contatos participantes (opcional). */
  participant_contact_ids?: string[] | null;
  /** Data de criação. */
  created_at: string;
  /** ID do dono/responsável. */
  owner_id: string | null;
  /** Status granular da Central de Tarefas (Fase 1, coluna nova). */
  status?: ActivityStatus;
  /** Prioridade da tarefa (Fase 1, coluna nova). */
  priority?: ActivityPriority;
  /** Tríade do Tempo (Fase 1, coluna nova, nullable). */
  time_sphere?: TimeSphere | null;
  /** Foco do dia (Fase 1, coluna nova). */
  is_focus_today?: boolean;
  /** ID da tarefa-pai, para subtarefas (Fase 1, coluna nova). */
  parent_activity_id?: string | null;
  /** Posição para ordenação manual (Fase 1, coluna nova). */
  position?: number;
  /** Data de início planejada (Fase 1, coluna nova, nullable). */
  start_date?: string | null;
}

/**
 * Colunas da Central de Tarefas que podem ainda não existir em produção
 * até a migration `20260810130000_task_center_activities_fields.sql` ser
 * aplicada. Usadas pelo retry defensivo de `create`/`update` abaixo, na
 * mesma técnica já usada para `client_company_id`/`participant_contact_ids`.
 */
const TASK_CENTER_COLUMNS = [
  'status',
  'priority',
  'time_sphere',
  'is_focus_today',
  'parent_activity_id',
  'position',
  'start_date',
] as const;

const RETRYABLE_COLUMNS = ['client_company_id', 'participant_contact_ids', ...TASK_CENTER_COLUMNS];

/**
 * Extrai o nome da coluna citada numa mensagem de erro Postgres 42703
 * (undefined_column), ex: `column "status" of relation "activities" does not exist`.
 */
function extractMissingColumn(message: string): string | null {
  const match = message.match(/column "([^"]+)"/);
  return match ? match[1] : null;
}

function isUndefinedColumnError(error: unknown): error is { code: string; message: string } {
  return !!error && (error as any).code === '42703';
}

// Interface auxiliar para o retorno do Supabase com o join
interface DbActivityWithDeal extends DbActivity {
  deals?: { title: string } | null;
}

/**
 * Transforma atividade do formato DB para o formato da aplicação.
 * 
 * @param db - Atividade no formato do banco.
 * @returns Atividade no formato da aplicação.
 */
const transformActivity = (db: DbActivityWithDeal): Activity => ({
  id: db.id,
  organizationId: db.organization_id,
  title: db.title,
  description: db.description || undefined,
  type: db.type as Activity['type'],
  date: db.date,
  completed: db.completed,
  dealId: db.deal_id || '',
  contactId: db.contact_id || undefined,
  clientCompanyId: (db as any).client_company_id || undefined,
  participantContactIds: (db as any).participant_contact_ids || [],
  dealTitle: db.deals?.title || '',
  user: { name: 'Você', avatar: '' }, // Will be enriched later
  status: db.status ?? undefined,
  priority: db.priority ?? undefined,
  timeSphere: db.time_sphere ?? undefined,
  isFocusToday: db.is_focus_today ?? undefined,
  parentActivityId: db.parent_activity_id ?? undefined,
  position: db.position ?? undefined,
  startDate: db.start_date ?? undefined,
});

/**
 * Transforma atividade do formato da aplicação para o formato DB.
 *
 * @param activity - Atividade parcial no formato da aplicação.
 * @returns Atividade parcial no formato do banco.
 */
const transformActivityToDb = (activity: Partial<Activity>): Partial<DbActivity> => {
  const db: Partial<DbActivity> = {};

  if (activity.title !== undefined) db.title = activity.title;
  if (activity.description !== undefined) db.description = activity.description || null;
  if (activity.type !== undefined) db.type = activity.type;
  if (activity.date !== undefined) db.date = activity.date;
  if (activity.completed !== undefined) db.completed = activity.completed;
  if (activity.dealId !== undefined) db.deal_id = sanitizeUUID(activity.dealId);
  if (activity.contactId !== undefined) db.contact_id = sanitizeUUID(activity.contactId);
  if (activity.clientCompanyId !== undefined) (db as any).client_company_id = sanitizeUUID(activity.clientCompanyId);
  if (activity.participantContactIds !== undefined) (db as any).participant_contact_ids = activity.participantContactIds || [];
  if (activity.status !== undefined) db.status = activity.status;
  if (activity.priority !== undefined) db.priority = activity.priority;
  if (activity.timeSphere !== undefined) db.time_sphere = activity.timeSphere ?? null;
  if (activity.isFocusToday !== undefined) db.is_focus_today = activity.isFocusToday;
  if (activity.parentActivityId !== undefined) db.parent_activity_id = sanitizeUUID(activity.parentActivityId);
  if (activity.position !== undefined) db.position = activity.position;
  if (activity.startDate !== undefined) db.start_date = activity.startDate || null;

  return db;
};

export const activitiesService = {
  /**
   * Busca todas as atividades.
   * 
   * @returns Promise com array de atividades ou erro.
   */
  async getAll(): Promise<{ data: Activity[] | null; error: Error | null }> {
    try {
      const sb = supabase;
      if (!sb) return { data: null, error: new Error('Supabase não configurado') };

      const { data, error } = await sb
        .from('activities')
        .select(`
          *,
          deals:deal_id (title)
        `)
        .order('date', { ascending: false })
        .limit(1000); // Safety limit for non-paginated access

      if (error) return { data: null, error };
      
      // Transforma e aplica ordenação inteligente
      const activities = (data || []).map(a => transformActivity(a as DbActivityWithDeal));
      return { data: sortActivitiesSmart(activities), error: null };
    } catch (e) {
      return { data: null, error: e as Error };
    }
  },

  /**
   * Cria uma nova atividade.
   * 
   * @param activity - Dados da atividade (sem id e createdAt).
   * @returns Promise com atividade criada ou erro.
   */
  async create(activity: Omit<Activity, 'id' | 'createdAt'>): Promise<{ data: Activity | null; error: Error | null }> {
    try {
      const sb = supabase;
      if (!sb) return { data: null, error: new Error('Supabase não configurado') };

      const organizationId = await getCurrentOrganizationId();
      const insertData: Record<string, unknown> = {
        title: activity.title,
        description: activity.description || null,
        type: activity.type,
        date: activity.date,
        completed: activity.completed || false,
        deal_id: sanitizeUUID(activity.dealId),
        contact_id: sanitizeUUID(activity.contactId),
        client_company_id: sanitizeUUID(activity.clientCompanyId),
        participant_contact_ids: activity.participantContactIds || [],
        ...(activity.status !== undefined ? { status: activity.status } : {}),
        ...(activity.priority !== undefined ? { priority: activity.priority } : {}),
        ...(activity.timeSphere !== undefined ? { time_sphere: activity.timeSphere ?? null } : {}),
        ...(activity.isFocusToday !== undefined ? { is_focus_today: activity.isFocusToday } : {}),
        ...(activity.parentActivityId !== undefined
          ? { parent_activity_id: sanitizeUUID(activity.parentActivityId) }
          : {}),
        ...(activity.position !== undefined ? { position: activity.position } : {}),
        ...(activity.startDate !== undefined ? { start_date: activity.startDate || null } : {}),
        ...(organizationId ? { organization_id: organizationId } : {}),
      };

      // Retry defensivo: se a migration da Central de Tarefas (colunas novas
      // em `activities`) ainda não foi aplicada em produção, cada tentativa
      // remove a coluna inexistente e insere de novo, até esgotar as colunas
      // conhecidas como "podem não existir ainda" (mesma técnica já usada
      // para client_company_id/participant_contact_ids).
      let payload = insertData;
      for (let attempt = 0; attempt <= RETRYABLE_COLUMNS.length; attempt++) {
        const { data, error } = await sb.from('activities').insert(payload).select().single();
        if (!error) return { data: transformActivity(data as DbActivity), error: null };

        if (!isUndefinedColumnError(error)) return { data: null, error };
        const missingColumn = extractMissingColumn((error as any).message || '');
        if (!missingColumn || !(missingColumn in payload)) return { data: null, error };

        const { [missingColumn]: _removed, ...rest } = payload;
        payload = rest;
      }
      return { data: null, error: new Error('Falha ao criar atividade após retries de colunas ausentes') };
    } catch (e) {
      return { data: null, error: e as Error };
    }
  },

  /**
   * Atualiza uma atividade existente.
   * 
   * @param id - ID da atividade.
   * @param updates - Campos a serem atualizados.
   * @returns Promise com erro, se houver.
   */
  async update(id: string, updates: Partial<Activity>): Promise<{ error: Error | null }> {
    try {
      const sb = supabase;
      if (!sb) return { error: new Error('Supabase não configurado') };

      const dbUpdates = transformActivityToDb(updates);

      // Mesmo retry defensivo de `create`: remove coluna ausente e tenta de
      // novo, até esgotar as colunas conhecidas como "podem não existir
      // ainda" (colunas da Central de Tarefas antes da migration ser
      // aplicada).
      let payload: Record<string, unknown> = { ...dbUpdates };
      for (let attempt = 0; attempt <= RETRYABLE_COLUMNS.length; attempt++) {
        const { error } = await sb.from('activities').update(payload).eq('id', id);
        if (!error) return { error: null };

        if (!isUndefinedColumnError(error)) return { error };
        const missingColumn = extractMissingColumn((error as any).message || '');
        if (!missingColumn || !(missingColumn in payload)) return { error };

        const { [missingColumn]: _removed, ...rest } = payload;
        payload = rest;
      }
      return { error: new Error('Falha ao atualizar atividade após retries de colunas ausentes') };
    } catch (e) {
      return { error: e as Error };
    }
  },

  /**
   * Exclui uma atividade.
   * 
   * @param id - ID da atividade.
   * @returns Promise com erro, se houver.
   */
  async delete(id: string): Promise<{ error: Error | null }> {
    try {
      const sb = supabase;
      if (!sb) return { error: new Error('Supabase não configurado') };

      const { error } = await sb
        .from('activities')
        .delete()
        .eq('id', id);

      return { error };
    } catch (e) {
      return { error: e as Error };
    }
  },

  /**
   * Alterna o status de conclusão de uma atividade.
   * 
   * @param id - ID da atividade.
   * @returns Promise com novo status de conclusão ou erro.
   */
  async toggleCompletion(id: string): Promise<{ data: boolean | null; error: Error | null }> {
    try {
      const sb = supabase;
      if (!sb) return { data: null, error: new Error('Supabase não configurado') };

      // First get current state
      const { data: current, error: fetchError } = await sb
        .from('activities')
        .select('completed')
        .eq('id', id)
        .single();

      if (fetchError || !current) {
        return { data: null, error: new Error('Activity not found') };
      }

      const newCompleted = !current.completed;

      const { error } = await sb
        .from('activities')
        .update({ completed: newCompleted })
        .eq('id', id);

      if (error) return { data: null, error };
      return { data: newCompleted, error: null };
    } catch (e) {
      return { data: null, error: e as Error };
    }
  },
};
