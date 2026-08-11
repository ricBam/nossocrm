/**
 * TanStack Query hooks para o checklist de uma atividade (Central de
 * Tarefas, Fase 1 — CRUD simples, sem reorder).
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../index';
import { activityChecklistItemsService } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import type { ActivityChecklistItem } from '@/types';

/**
 * Hook para buscar os itens de checklist de uma atividade.
 * Só habilita a query quando `activityId` é um ID real (não temp-*, não vazio).
 */
export const useActivityChecklist = (activityId: string | undefined) => {
  const { user, loading: authLoading } = useAuth();
  const isRealId = !!activityId && !activityId.startsWith('temp-');

  return useQuery({
    queryKey: queryKeys.activityChecklist.byActivity(activityId || ''),
    queryFn: async () => {
      const { data, error } = await activityChecklistItemsService.listByActivity(activityId!);
      if (error) throw error;
      return data || [];
    },
    enabled: !authLoading && !!user && isRealId,
  });
};

export const useCreateChecklistItem = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ activityId, title }: { activityId: string; title: string }) => {
      const { data, error } = await activityChecklistItemsService.create(activityId, title);
      if (error) throw error;
      return data!;
    },
    onSuccess: (data, { activityId }) => {
      queryClient.setQueryData<ActivityChecklistItem[]>(
        queryKeys.activityChecklist.byActivity(activityId),
        (old = []) => [...old, data]
      );
    },
  });
};

export const useToggleChecklistItem = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, isDone }: { id: string; activityId: string; isDone: boolean }) => {
      const { error } = await activityChecklistItemsService.toggle(id, isDone);
      if (error) throw error;
      return { id, isDone };
    },
    onMutate: async ({ id, activityId, isDone }) => {
      const key = queryKeys.activityChecklist.byActivity(activityId);
      const previous = queryClient.getQueryData<ActivityChecklistItem[]>(key);
      queryClient.setQueryData<ActivityChecklistItem[]>(key, (old = []) =>
        old.map(item => (item.id === id ? { ...item, isDone } : item))
      );
      return { previous, activityId };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(
          queryKeys.activityChecklist.byActivity(context.activityId),
          context.previous
        );
      }
    },
  });
};

export const useRenameChecklistItem = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, title }: { id: string; activityId: string; title: string }) => {
      const { error } = await activityChecklistItemsService.rename(id, title);
      if (error) throw error;
      return { id, title };
    },
    onSuccess: (_data, { id, activityId, title }) => {
      queryClient.setQueryData<ActivityChecklistItem[]>(
        queryKeys.activityChecklist.byActivity(activityId),
        (old = []) => old.map(item => (item.id === id ? { ...item, title } : item))
      );
    },
  });
};

export const useDeleteChecklistItem = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id }: { id: string; activityId: string }) => {
      const { error } = await activityChecklistItemsService.delete(id);
      if (error) throw error;
      return id;
    },
    onMutate: async ({ id, activityId }) => {
      const key = queryKeys.activityChecklist.byActivity(activityId);
      const previous = queryClient.getQueryData<ActivityChecklistItem[]>(key);
      queryClient.setQueryData<ActivityChecklistItem[]>(key, (old = []) =>
        old.filter(item => item.id !== id)
      );
      return { previous, activityId };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(
          queryKeys.activityChecklist.byActivity(context.activityId),
          context.previous
        );
      }
    },
  });
};
