import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { queryKeys } from '@/lib/query/queryKeys';
import { financialService } from '@/lib/supabase/financial';

function useIsFinancialAdmin() {
  const { user, profile, loading: authLoading } = useAuth();
  const isAdmin = profile?.role === 'admin';
  return { enabled: !authLoading && !!user && isAdmin, isAdmin };
}

export const useFinancialLedger = (startISO: string, endISO: string) => {
  const { enabled } = useIsFinancialAdmin();
  return useQuery({
    queryKey: queryKeys.financial.ledger.byPeriod(startISO, endISO),
    queryFn: async () => {
      const { data, error } = await financialService.getLedger(startISO, endISO);
      if (error) throw error;
      return data;
    },
    staleTime: 60 * 1000,
    enabled,
  });
};

export const useCreateFinancialTransaction = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { type: 'receita' | 'despesa'; description: string; amount: number; category: string; date: string }) => {
      const { data, error } = await financialService.createTransaction(input);
      if (error) throw error;
      return data!;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.financial.ledger.all });
    },
  });
};

export const useDeleteFinancialTransaction = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await financialService.deleteTransaction(id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.financial.ledger.all });
    },
  });
};

export const useRecurringExpenses = () => {
  const { enabled } = useIsFinancialAdmin();
  return useQuery({
    queryKey: queryKeys.financial.recurring.lists(),
    queryFn: async () => {
      const { data, error } = await financialService.getRecurringExpenses();
      if (error) throw error;
      return data;
    },
    staleTime: 60 * 1000,
    enabled,
  });
};

export const useCreateRecurringExpense = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; amount: number; category: string; dayOfMonth: number }) => {
      const { data, error } = await financialService.createRecurringExpense(input);
      if (error) throw error;
      return data!;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.financial.recurring.all });
    },
  });
};

export const useUpdateRecurringExpense = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<{ name: string; amount: number; category: string; dayOfMonth: number; active: boolean }> }) => {
      const { error } = await financialService.updateRecurringExpense(id, updates);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.financial.recurring.all });
    },
  });
};

export const useFinancialBuckets = () => {
  const { enabled } = useIsFinancialAdmin();
  return useQuery({
    queryKey: queryKeys.financial.buckets.lists(),
    queryFn: async () => {
      const { data, error } = await financialService.getBucketsWithBalances();
      if (error) throw error;
      return data;
    },
    staleTime: 30 * 1000,
    enabled,
  });
};

export const useCreateFinancialBucket = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; goalAmount?: number; color: string }) => {
      const { data, error } = await financialService.createBucket(input);
      if (error) throw error;
      return data!;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.financial.buckets.all });
    },
  });
};

export const useArchiveFinancialBucket = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await financialService.archiveBucket(id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.financial.buckets.all });
    },
  });
};

export const useCreateBucketMovement = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { bucketId: string; amount: number; note?: string; date: string }) => {
      const { data, error } = await financialService.createBucketMovement(input);
      if (error) throw error;
      return data!;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.financial.buckets.all });
    },
  });
};
