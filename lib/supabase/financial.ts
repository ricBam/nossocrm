import { supabase } from './client';
import { sanitizeUUID } from './utils';
import type {
  FinancialLedgerEntry,
  FinancialTransaction,
  FinancialRecurringExpense,
  FinancialBucket,
  FinancialBucketMovement,
  FinancialCategory,
} from '@/types';

let cachedOrgId: string | null = null;
let cachedOrgUserId: string | null = null;

async function getCurrentOrganizationId(): Promise<string | null> {
  if (!supabase) return null;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  if (cachedOrgUserId === user.id && cachedOrgId) return cachedOrgId;

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', user.id)
    .maybeSingle();

  if (error) return null;
  const orgId = sanitizeUUID((profile as any)?.organization_id);
  cachedOrgUserId = user.id;
  cachedOrgId = orgId;
  return orgId;
}

function transformLedgerEntry(db: any): FinancialLedgerEntry {
  return {
    organizationId: db.organization_id,
    type: db.type,
    description: db.description,
    amount: Number(db.amount ?? 0),
    category: db.category,
    date: db.date,
    source: db.source,
    sourceId: db.source_id,
  };
}

function transformTransaction(db: any): FinancialTransaction {
  return {
    id: db.id,
    organizationId: db.organization_id,
    type: db.type,
    description: db.description,
    amount: Number(db.amount ?? 0),
    category: db.category,
    date: db.date,
    source: db.source,
    recurringId: db.recurring_id || undefined,
    createdAt: db.created_at,
  };
}

function transformRecurringExpense(db: any): FinancialRecurringExpense {
  return {
    id: db.id,
    organizationId: db.organization_id,
    name: db.name,
    amount: Number(db.amount ?? 0),
    category: db.category,
    dayOfMonth: db.day_of_month,
    active: db.active,
    createdAt: db.created_at,
  };
}

function transformBucket(db: any, balance: number): FinancialBucket {
  return {
    id: db.id,
    organizationId: db.organization_id,
    name: db.name,
    goalAmount: db.goal_amount != null ? Number(db.goal_amount) : undefined,
    color: db.color,
    archivedAt: db.archived_at || undefined,
    balance,
    createdAt: db.created_at,
  };
}

function transformCategory(db: any): FinancialCategory {
  return {
    id: db.id,
    organizationId: db.organization_id,
    name: db.name,
    type: db.type,
    color: db.color,
    createdAt: db.created_at,
  };
}

export const financialService = {
  async getLedger(startISO: string, endISO: string): Promise<{ data: FinancialLedgerEntry[]; error: Error | null }> {
    try {
      if (!supabase) return { data: [], error: new Error('Supabase não configurado') };
      const { data, error } = await supabase
        .from('financial_ledger')
        .select('organization_id, type, description, amount, category, date, source, source_id')
        .gte('date', startISO.slice(0, 10))
        .lte('date', endISO.slice(0, 10))
        .order('date', { ascending: false });
      if (error) return { data: [], error };
      return { data: (data || []).map(transformLedgerEntry), error: null };
    } catch (e) {
      return { data: [], error: e as Error };
    }
  },

  async createTransaction(input: {
    type: 'receita' | 'despesa';
    description: string;
    amount: number;
    category: string;
    date: string;
  }): Promise<{ data: FinancialTransaction | null; error: Error | null }> {
    try {
      if (!supabase) return { data: null, error: new Error('Supabase não configurado') };
      const { data: { user } } = await supabase.auth.getUser();
      const organizationId = await getCurrentOrganizationId();
      const { data, error } = await supabase
        .from('financial_transactions')
        .insert({
          type: input.type,
          description: input.description,
          amount: input.amount,
          category: input.category,
          date: input.date,
          source: 'manual',
          created_by: sanitizeUUID(user?.id),
          organization_id: organizationId,
        })
        .select('id, organization_id, type, description, amount, category, date, source, recurring_id, created_at')
        .single();
      if (error) return { data: null, error };
      return { data: transformTransaction(data), error: null };
    } catch (e) {
      return { data: null, error: e as Error };
    }
  },

  async deleteTransaction(id: string): Promise<{ error: Error | null }> {
    try {
      if (!supabase) return { error: new Error('Supabase não configurado') };
      const { error } = await supabase.from('financial_transactions').delete().eq('id', id);
      return { error: error ?? null };
    } catch (e) {
      return { error: e as Error };
    }
  },

  async getRecurringExpenses(): Promise<{ data: FinancialRecurringExpense[]; error: Error | null }> {
    try {
      if (!supabase) return { data: [], error: new Error('Supabase não configurado') };
      const { data, error } = await supabase
        .from('financial_recurring_expenses')
        .select('id, organization_id, name, amount, category, day_of_month, active, created_at')
        .order('name', { ascending: true });
      if (error) return { data: [], error };
      return { data: (data || []).map(transformRecurringExpense), error: null };
    } catch (e) {
      return { data: [], error: e as Error };
    }
  },

  async createRecurringExpense(input: {
    name: string;
    amount: number;
    category: string;
    dayOfMonth: number;
  }): Promise<{ data: FinancialRecurringExpense | null; error: Error | null }> {
    try {
      if (!supabase) return { data: null, error: new Error('Supabase não configurado') };
      const { data: { user } } = await supabase.auth.getUser();
      const organizationId = await getCurrentOrganizationId();
      const { data, error } = await supabase
        .from('financial_recurring_expenses')
        .insert({
          name: input.name,
          amount: input.amount,
          category: input.category,
          day_of_month: input.dayOfMonth,
          active: true,
          created_by: sanitizeUUID(user?.id),
          organization_id: organizationId,
        })
        .select('id, organization_id, name, amount, category, day_of_month, active, created_at')
        .single();
      if (error) return { data: null, error };
      return { data: transformRecurringExpense(data), error: null };
    } catch (e) {
      return { data: null, error: e as Error };
    }
  },

  async updateRecurringExpense(
    id: string,
    updates: Partial<{ name: string; amount: number; category: string; dayOfMonth: number; active: boolean }>
  ): Promise<{ error: Error | null }> {
    try {
      if (!supabase) return { error: new Error('Supabase não configurado') };
      const payload: Record<string, unknown> = {};
      if (updates.name !== undefined) payload.name = updates.name;
      if (updates.amount !== undefined) payload.amount = updates.amount;
      if (updates.category !== undefined) payload.category = updates.category;
      if (updates.dayOfMonth !== undefined) payload.day_of_month = updates.dayOfMonth;
      if (updates.active !== undefined) payload.active = updates.active;
      const { error } = await supabase.from('financial_recurring_expenses').update(payload).eq('id', id);
      return { error: error ?? null };
    } catch (e) {
      return { error: e as Error };
    }
  },

  async deleteRecurringExpense(id: string): Promise<{ error: Error | null }> {
    try {
      if (!supabase) return { error: new Error('Supabase não configurado') };
      const { error } = await supabase.from('financial_recurring_expenses').delete().eq('id', id);
      return { error: error ?? null };
    } catch (e) {
      return { error: e as Error };
    }
  },

  async getBucketsWithBalances(): Promise<{ data: FinancialBucket[]; error: Error | null }> {
    try {
      if (!supabase) return { data: [], error: new Error('Supabase não configurado') };
      const { data: buckets, error: bucketsError } = await supabase
        .from('financial_buckets')
        .select('id, organization_id, name, goal_amount, color, archived_at, created_at')
        .is('archived_at', null)
        .order('created_at', { ascending: true });
      if (bucketsError) return { data: [], error: bucketsError };

      const { data: movements, error: movementsError } = await supabase
        .from('financial_bucket_movements')
        .select('bucket_id, amount');
      if (movementsError) return { data: [], error: movementsError };

      const balanceByBucket = new Map<string, number>();
      for (const m of movements || []) {
        balanceByBucket.set(m.bucket_id, (balanceByBucket.get(m.bucket_id) ?? 0) + Number(m.amount));
      }

      return {
        data: (buckets || []).map(b => transformBucket(b, balanceByBucket.get(b.id) ?? 0)),
        error: null,
      };
    } catch (e) {
      return { data: [], error: e as Error };
    }
  },

  async createBucket(input: { name: string; goalAmount?: number; color: string }): Promise<{ data: FinancialBucket | null; error: Error | null }> {
    try {
      if (!supabase) return { data: null, error: new Error('Supabase não configurado') };
      const { data: { user } } = await supabase.auth.getUser();
      const organizationId = await getCurrentOrganizationId();
      const { data, error } = await supabase
        .from('financial_buckets')
        .insert({
          name: input.name,
          goal_amount: input.goalAmount ?? null,
          color: input.color,
          created_by: sanitizeUUID(user?.id),
          organization_id: organizationId,
        })
        .select('id, organization_id, name, goal_amount, color, archived_at, created_at')
        .single();
      if (error) return { data: null, error };
      return { data: transformBucket(data, 0), error: null };
    } catch (e) {
      return { data: null, error: e as Error };
    }
  },

  async archiveBucket(id: string): Promise<{ error: Error | null }> {
    try {
      if (!supabase) return { error: new Error('Supabase não configurado') };
      const { error } = await supabase
        .from('financial_buckets')
        .update({ archived_at: new Date().toISOString() })
        .eq('id', id);
      return { error: error ?? null };
    } catch (e) {
      return { error: e as Error };
    }
  },

  async createBucketMovement(input: {
    bucketId: string;
    amount: number;
    note?: string;
    date: string;
  }): Promise<{ data: FinancialBucketMovement | null; error: Error | null }> {
    try {
      if (!supabase) return { data: null, error: new Error('Supabase não configurado') };
      const { data: { user } } = await supabase.auth.getUser();
      const organizationId = await getCurrentOrganizationId();
      const { data, error } = await supabase
        .from('financial_bucket_movements')
        .insert({
          bucket_id: input.bucketId,
          amount: input.amount,
          note: input.note || null,
          date: input.date,
          created_by: sanitizeUUID(user?.id),
          organization_id: organizationId,
        })
        .select('id, bucket_id, organization_id, amount, note, date, created_at')
        .single();
      if (error) return { data: null, error };
      return {
        data: {
          id: data.id,
          bucketId: data.bucket_id,
          organizationId: data.organization_id,
          amount: Number(data.amount),
          note: data.note || undefined,
          date: data.date,
          createdAt: data.created_at,
        },
        error: null,
      };
    } catch (e) {
      return { data: null, error: e as Error };
    }
  },

  async getCategories(): Promise<{ data: FinancialCategory[]; error: Error | null }> {
    try {
      if (!supabase) return { data: [], error: new Error('Supabase não configurado') };
      const { data, error } = await supabase
        .from('financial_categories')
        .select('id, organization_id, name, type, color, created_at')
        .order('name', { ascending: true });
      if (error) return { data: [], error };
      return { data: (data || []).map(transformCategory), error: null };
    } catch (e) {
      return { data: [], error: e as Error };
    }
  },

  async createCategory(input: { name: string; type: 'receita' | 'despesa'; color: string }): Promise<{ data: FinancialCategory | null; error: Error | null }> {
    try {
      if (!supabase) return { data: null, error: new Error('Supabase não configurado') };
      const { data: { user } } = await supabase.auth.getUser();
      const organizationId = await getCurrentOrganizationId();
      const { data, error } = await supabase
        .from('financial_categories')
        .insert({
          name: input.name,
          type: input.type,
          color: input.color,
          created_by: sanitizeUUID(user?.id),
          organization_id: organizationId,
        })
        .select('id, organization_id, name, type, color, created_at')
        .single();
      if (error) return { data: null, error };
      return { data: transformCategory(data), error: null };
    } catch (e) {
      return { data: null, error: e as Error };
    }
  },

  async updateCategory(id: string, updates: Partial<{ name: string; type: 'receita' | 'despesa'; color: string }>): Promise<{ error: Error | null }> {
    try {
      if (!supabase) return { error: new Error('Supabase não configurado') };
      const payload: Record<string, unknown> = {};
      if (updates.name !== undefined) payload.name = updates.name;
      if (updates.type !== undefined) payload.type = updates.type;
      if (updates.color !== undefined) payload.color = updates.color;
      const { error } = await supabase.from('financial_categories').update(payload).eq('id', id);
      return { error: error ?? null };
    } catch (e) {
      return { error: e as Error };
    }
  },

  async deleteCategory(id: string): Promise<{ error: Error | null }> {
    try {
      if (!supabase) return { error: new Error('Supabase não configurado') };
      const { error } = await supabase.from('financial_categories').delete().eq('id', id);
      return { error: error ?? null };
    } catch (e) {
      return { error: e as Error };
    }
  },
};
