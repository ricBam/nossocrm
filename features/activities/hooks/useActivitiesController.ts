import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useToast } from '@/context/ToastContext';
import { useAuth } from '@/context/AuthContext';
import { Activity, ActivityPriority, ActivityStatus, TimeSphere } from '@/types';
import {
  useActivities,
  useCreateActivity,
  useUpdateActivity,
  useDeleteActivity,
} from '@/lib/query/hooks/useActivitiesQuery';
import { useDeals } from '@/lib/query/hooks/useDealsQuery';
import { useContacts, useCompanies } from '@/lib/query/hooks/useContactsQuery';
import { useRealtimeSync } from '@/lib/realtime/useRealtimeSync';
import { matchesTaskTab, type TaskTab } from '@/lib/utils/activityTaskFilters';

export type { TaskTab };

/**
 * Hook React `useActivitiesController` que encapsula uma lógica reutilizável.
 */
export const useActivitiesController = () => {
  const searchParams = useSearchParams();
  const router = useRouter();

  // Auth for tenant organization_id
  const { profile, organizationId } = useAuth();

  // TanStack Query hooks
  const { data: activities = [], isLoading: activitiesLoading } = useActivities();
  const { data: deals = [], isLoading: dealsLoading } = useDeals();
  const { data: contacts = [], isLoading: contactsLoading } = useContacts();
  const { data: companies = [], isLoading: companiesLoading } = useCompanies();
  const createActivityMutation = useCreateActivity();
  const updateActivityMutation = useUpdateActivity();
  const deleteActivityMutation = useDeleteActivity();

  // Enable realtime sync
  useRealtimeSync('activities');

  const { showToast } = useToast();

  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
  const [taskTab, setTaskTabState] = useState<TaskTab>('all');
  const [showCompleted, setShowCompleted] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<Activity['type'] | 'ALL'>('ALL');
  const [dateFilter, setDateFilter] = useState<'ALL' | 'overdue' | 'today' | 'upcoming'>('ALL');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingActivity, setEditingActivity] = useState<Activity | null>(null);

  // Permite deep-link do Inbox (o módulo de mensageria, não a aba "Inbox"
  // da Central de Tarefas): /activities?filter=overdue|today|upcoming
  useEffect(() => {
    const filter = (searchParams.get('filter') || '').toLowerCase();

    if (filter === 'overdue' || filter === 'today' || filter === 'upcoming') {
      setDateFilter(filter);
      setViewMode('list');
      return;
    }

    // Qualquer outro valor (inclui vazio) cai no padrão.
    setDateFilter('ALL');
  }, [searchParams]);

  // Deep-link da aba da Central de Tarefas: /activities?view=todas|hoje|inbox
  useEffect(() => {
    const view = (searchParams.get('view') || '').toLowerCase();
    if (view === 'hoje') setTaskTabState('today');
    else if (view === 'inbox') setTaskTabState('inbox');
    else setTaskTabState('all');
  }, [searchParams]);

  /** Troca de aba refletindo no query string, sem navegação/scroll. */
  const setTaskTab = useCallback(
    (tab: TaskTab) => {
      const params = new URLSearchParams(searchParams.toString());
      if (tab === 'all') params.delete('view');
      else params.set('view', tab === 'today' ? 'hoje' : 'inbox');
      router.replace(params.toString() ? `?${params.toString()}` : '?', { scroll: false });
      setTaskTabState(tab);
    },
    [router, searchParams]
  );

  const [formData, setFormData] = useState({
    title: '',
    type: 'CALL' as Activity['type'],
    date: new Date().toISOString().split('T')[0],
    time: '09:00',
    description: '',
    dealId: '',
    status: 'todo' as ActivityStatus,
    priority: 'none' as ActivityPriority,
    timeSphere: undefined as TimeSphere | undefined,
  });

  const isLoading = activitiesLoading || dealsLoading || contactsLoading || companiesLoading;

  // Performance: build lookups once (avoid `.find(...)` in handlers).
  const activitiesById = useMemo(() => new Map(activities.map((a) => [a.id, a])), [activities]);
  const dealsById = useMemo(() => new Map(deals.map((d) => [d.id, d])), [deals]);
  const contactsById = useMemo(() => new Map(contacts.map((c) => [c.id, c])), [contacts]);

  // Performance: compute date boundaries once per render (used inside memoized filters).
  const dateBoundaries = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return { todayTs: today.getTime(), tomorrowTs: tomorrow.getTime() };
  }, []);

  const filteredActivities = useMemo(() => {
    const { todayTs, tomorrowTs } = dateBoundaries;
    const q = searchTerm.toLowerCase();

    return activities
      .map((activity) => ({ activity, ts: Date.parse(activity.date) }))
      .filter(({ activity, ts }) => {
        const matchesSearch = (activity.title || '').toLowerCase().includes(q);
        const matchesType = filterType === 'ALL' || activity.type === filterType;
        const isPending = !activity.completed;

        const matchesDateFilter =
          dateFilter === 'ALL'
            ? true
            : dateFilter === 'overdue'
              ? isPending && ts < todayTs
              : dateFilter === 'today'
                ? isPending && ts >= todayTs && ts < tomorrowTs
                : isPending && ts >= tomorrowTs;

        const belongsToTaskTab = matchesTaskTab(activity, { taskTab, showCompleted });

        return matchesSearch && matchesType && matchesDateFilter && belongsToTaskTab;
      })
      // Performance: sort by numeric timestamp (avoid `new Date(...)` in comparator).
      .sort((a, b) => a.ts - b.ts)
      .map(({ activity }) => activity);
  }, [activities, dateBoundaries, searchTerm, filterType, dateFilter, taskTab, showCompleted]);

  const handleNewActivity = (defaultStatus?: ActivityStatus) => {
    setEditingActivity(null);
    setFormData({
      title: '',
      type: 'CALL',
      date: new Date().toISOString().split('T')[0],
      time: '09:00',
      description: '',
      dealId: '',
      status: defaultStatus || (taskTab === 'inbox' ? 'inbox' : 'todo'),
      priority: 'none',
      timeSphere: undefined,
    });
    setIsModalOpen(true);
  };

  const handleEditActivity = (activity: Activity) => {
    setEditingActivity(activity);
    const date = new Date(activity.date);
    setFormData({
      title: activity.title,
      type: activity.type,
      date: date.toISOString().split('T')[0],
      time: date.toTimeString().slice(0, 5),
      description: activity.description || '',
      dealId: activity.dealId,
      status: activity.status || 'todo',
      priority: activity.priority || 'none',
      timeSphere: activity.timeSphere,
    });
    setIsModalOpen(true);
  };

  const handleDeleteActivity = (id: string) => {
    if (window.confirm('Tem certeza que deseja excluir esta atividade?')) {
      deleteActivityMutation.mutate(id, {
        onSuccess: () => {
          showToast('Atividade excluída com sucesso', 'success');
        },
      });
    }
  };

  const handleToggleComplete = useCallback(
    (id: string) => {
      const activity = activitiesById.get(id);
      if (!activity) return;

      updateActivityMutation.mutate(
        {
          id,
          updates: { completed: !activity.completed },
        },
        {
          onSuccess: () => {
            showToast(activity.completed ? 'Atividade reaberta' : 'Atividade concluída', 'success');
          },
        }
      );
    },
    [activitiesById, showToast, updateActivityMutation]
  );

  /**
   * Adia as atividades selecionadas em 1 dia (mesma data/hora, só o dia
   * avança). Usado pelo "Adiar 1 Dia" do BulkActionsToolbar — antes desta
   * Fase 1, esse botão era um stub que só mostrava toast sem persistir nada.
   */
  const handleSnoozeSelected = useCallback(
    (ids: string[]) => {
      let successCount = 0;
      let errorCount = 0;

      ids.forEach((id) => {
        const activity = activitiesById.get(id);
        if (!activity) return;

        const newDate = new Date(activity.date);
        newDate.setDate(newDate.getDate() + 1);

        updateActivityMutation.mutate(
          { id, updates: { date: newDate.toISOString() } },
          {
            onSuccess: () => {
              successCount += 1;
            },
            onError: () => {
              errorCount += 1;
            },
            onSettled: () => {
              if (successCount + errorCount === ids.length) {
                if (errorCount === 0) {
                  showToast(
                    successCount === 1
                      ? '1 atividade adiada para o dia seguinte'
                      : `${successCount} atividades adiadas para o dia seguinte`,
                    'success'
                  );
                } else {
                  showToast(
                    `${successCount} adiada(s), ${errorCount} falharam ao adiar`,
                    successCount > 0 ? 'success' : 'error'
                  );
                }
              }
            },
          }
        );
      });
    },
    [activitiesById, updateActivityMutation, showToast]
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const date = new Date(`${formData.date}T${formData.time}`);
    const selectedDeal = formData.dealId ? dealsById.get(formData.dealId) : undefined;
    const selectedContact = selectedDeal?.contactId ? contactsById.get(selectedDeal.contactId) : undefined;
    const clientCompanyId = selectedDeal?.clientCompanyId || selectedContact?.clientCompanyId || undefined;
    const participantContactIds = selectedContact?.id ? [selectedContact.id] : [];

    if (editingActivity) {
      updateActivityMutation.mutate(
        {
          id: editingActivity.id,
          updates: {
            title: formData.title,
            type: formData.type,
            description: formData.description,
            date: date.toISOString(),
            dealId: formData.dealId || '',
            contactId: selectedContact?.id || '',
            clientCompanyId,
            participantContactIds,
            status: formData.status,
            priority: formData.priority,
            timeSphere: formData.timeSphere,
          },
        },
        {
          onSuccess: () => {
            showToast('Atividade atualizada com sucesso', 'success');
            setIsModalOpen(false);
          },
          onError: (error: Error) => {
            showToast(`Erro ao atualizar atividade: ${error.message}`, 'error');
          },
        }
      );
    } else {
      createActivityMutation.mutate(
        {
          activity: {
            title: formData.title,
            type: formData.type,
            description: formData.description,
            date: date.toISOString(),
            dealId: formData.dealId || '',
            contactId: selectedContact?.id || '',
            clientCompanyId,
            participantContactIds,
            dealTitle: selectedDeal?.title || '',
            completed: false,
            user: { name: 'Eu', avatar: '' },
            status: formData.status,
            priority: formData.priority,
            timeSphere: formData.timeSphere,
          },
        },
        {
          onSuccess: () => {
            showToast('Atividade criada com sucesso', 'success');
            setIsModalOpen(false);
          },
          onError: (error: Error) => {
            showToast(`Erro ao criar atividade: ${error.message}`, 'error');
          },
        }
      );
    }
  };

  return {
    viewMode,
    setViewMode,
    taskTab,
    setTaskTab,
    showCompleted,
    setShowCompleted,
    searchTerm,
    setSearchTerm,
    filterType,
    setFilterType,
    dateFilter,
    setDateFilter,
    currentDate,
    setCurrentDate,
    isModalOpen,
    setIsModalOpen,
    editingActivity,
    formData,
    setFormData,
    filteredActivities,
    deals,
    contacts,
    companies,
    isLoading,
    handleNewActivity,
    handleEditActivity,
    handleDeleteActivity,
    handleToggleComplete,
    handleSnoozeSelected,
    handleSubmit,
  };
};
