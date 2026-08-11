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
import type { ListLayout } from '../components/ActivitiesList';

export type { TaskTab };

/** Visões de topo da Central de Tarefas dentro de `/activities`. */
export type ViewMode = 'list' | 'calendar' | 'kanban';

/** Valores válidos de `ActivityStatus` — usado para validar `defaultStatus` em `handleNewActivity`. */
const ACTIVITY_STATUS_VALUES: ActivityStatus[] = ['inbox', 'todo', 'in_progress', 'done'];

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

  const [viewMode, setViewModeState] = useState<ViewMode>('list');
  const [taskTab, setTaskTabState] = useState<TaskTab>('all');
  const [listLayout, setListLayout] = useState<ListLayout>('rows');
  const [showCompleted, setShowCompleted] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<Activity['type'] | 'ALL'>('ALL');
  const [dateFilter, setDateFilter] = useState<'ALL' | 'overdue' | 'today' | 'upcoming'>('ALL');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingActivity, setEditingActivity] = useState<Activity | null>(null);
  const [viewingActivity, setViewingActivity] = useState<Activity | null>(null);

  // Permite deep-link do Inbox (o módulo de mensageria, não a aba "Inbox"
  // da Central de Tarefas): /activities?filter=overdue|today|upcoming
  useEffect(() => {
    const filter = (searchParams.get('filter') || '').toLowerCase();

    if (filter === 'overdue' || filter === 'today' || filter === 'upcoming') {
      setDateFilter(filter);
      setViewModeState('list');
      return;
    }

    // Qualquer outro valor (inclui vazio) cai no padrão.
    setDateFilter('ALL');
  }, [searchParams]);

  /**
   * Deep-link combinado de visão de topo + aba da Central de Tarefas, tudo
   * sob o mesmo parâmetro `view` (Pedido do fundador, 2026-08-11: Kanban
   * entra "no mesmo padrão dos outros `?view=` já usados"). As duas
   * dimensões não são ortogonais na prática — a aba (Todas/Hoje/Inbox) só
   * existe dentro da visão Lista — então cabem no mesmo parâmetro sem
   * ambiguidade: `hoje`/`inbox` implicam viewMode `list`; `calendario`/
   * `kanban` implicam taskTab `all` (a aba não é exibida fora da Lista).
   */
  useEffect(() => {
    const view = (searchParams.get('view') || '').toLowerCase();
    switch (view) {
      case 'calendario':
        setViewModeState('calendar');
        setTaskTabState('all');
        break;
      case 'kanban':
        setViewModeState('kanban');
        setTaskTabState('all');
        break;
      case 'hoje':
        setViewModeState('list');
        setTaskTabState('today');
        break;
      case 'inbox':
        setViewModeState('list');
        setTaskTabState('inbox');
        break;
      default:
        setViewModeState('list');
        setTaskTabState('all');
    }
  }, [searchParams]);

  /**
   * Troca de visão de topo refletindo no query string (`?view=`), sem
   * navegação/scroll. Também limpa `?filter=`/`dateFilter` (bug real
   * reportado pelo fundador, 2026-08-11): `dateFilter` é um mecanismo
   * separado e mais antigo, usado só para deep-link vindo do módulo de
   * Inbox (`/activities?filter=overdue|today|upcoming`, ver efeito acima).
   * Antes desta correção, trocar de visão só mexia em `?view=`, deixando
   * `?filter=` intacto na URL — o efeito que lê `filter` reaplicava o
   * mesmo `dateFilter` de novo a cada render, prendendo o usuário no
   * filtro antigo mesmo depois de trocar de aba/visão. Ao trocar de visão
   * deliberadamente, o usuário está saindo do contexto do deep-link.
   */
  const setViewMode = useCallback(
    (mode: ViewMode) => {
      const params = new URLSearchParams(searchParams.toString());
      if (mode === 'calendar') params.set('view', 'calendario');
      else if (mode === 'kanban') params.set('view', 'kanban');
      else params.delete('view'); // volta pra Lista/Todas
      params.delete('filter');
      router.replace(params.toString() ? `?${params.toString()}` : '?', { scroll: false });
      setViewModeState(mode);
      setTaskTabState('all');
      setDateFilter('ALL');
    },
    [router, searchParams]
  );

  /**
   * Troca de aba refletindo no query string, sem navegação/scroll. Também
   * limpa `?filter=`/`dateFilter` pelo mesmo motivo documentado acima em
   * `setViewMode` — trocar de aba (Todas/Hoje/Inbox) precisa mostrar
   * exatamente o que a aba escolhida promete, sem um filtro de data mais
   * antigo grudado por baixo.
   */
  const setTaskTab = useCallback(
    (tab: TaskTab) => {
      const params = new URLSearchParams(searchParams.toString());
      if (tab === 'all') params.delete('view');
      else params.set('view', tab === 'today' ? 'hoje' : 'inbox');
      params.delete('filter');
      router.replace(params.toString() ? `?${params.toString()}` : '?', { scroll: false });
      setTaskTabState(tab);
      setViewModeState('list');
      setDateFilter('ALL');
    },
    [router, searchParams]
  );

  /**
   * Limpa explicitamente o `dateFilter` vindo do deep-link `?filter=`
   * (botão "x" no badge "Filtro: ..." do header) sem mexer em
   * `viewMode`/`taskTab` — para o caso do usuário querer só remover o
   * filtro de data e continuar na mesma visão/aba em que já estava.
   */
  const clearDateFilter = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('filter');
    router.replace(params.toString() ? `?${params.toString()}` : '?', { scroll: false });
    setDateFilter('ALL');
  }, [router, searchParams]);

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

  /**
   * Filtro comum (busca + tipo + `dateFilter`), sem o filtro de aba
   * (Todas/Hoje/Inbox). Extraído de `filteredActivities` para que o Kanban
   * (`kanbanActivities` abaixo) reuse a mesma base sem herdar o
   * `matchesTaskTab` — o Kanban precisa mostrar TODAS as tarefas reais,
   * incluindo concluídas na coluna "Concluído", o que a aba "Todas" (com
   * `showCompleted=false` por padrão) excluiria.
   */
  const baseFilteredActivities = useMemo(() => {
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

        return matchesSearch && matchesType && matchesDateFilter;
      })
      // Performance: sort by numeric timestamp (avoid `new Date(...)` in comparator).
      .sort((a, b) => a.ts - b.ts)
      .map(({ activity }) => activity);
  }, [activities, dateBoundaries, searchTerm, filterType, dateFilter]);

  const filteredActivities = useMemo(
    () => baseFilteredActivities.filter((activity) => matchesTaskTab(activity, { taskTab, showCompleted })),
    [baseFilteredActivities, taskTab, showCompleted]
  );

  /**
   * Dados do Kanban (Pedido do fundador, 2026-08-11): mesma base de
   * busca/tipo/data, mas sem o filtro de aba (mostra concluídas também, na
   * coluna "Concluído") e sem as entradas automáticas `STATUS_CHANGE`
   * ("Moveu para X", "Negócio Criado") — são log de auditoria da mudança de
   * estágio do negócio (`useMoveDeal.ts`), não tarefas reais, e poluiriam a
   * coluna "A Fazer" (cairiam lá pelo default de coluna `status='todo'`).
   */
  const kanbanActivities = useMemo(
    () => baseFilteredActivities.filter((activity) => activity.type !== 'STATUS_CHANGE'),
    [baseFilteredActivities]
  );

  const handleNewActivity = (defaultStatus?: ActivityStatus) => {
    // Defensivo (causa raiz real do bug "Converting circular structure to
    // JSON ... constructor 'Window'", 2026-08-11): esta função é usada
    // diretamente como handler de `onClick` em mais de um lugar (botão
    // "Nova Atividade" do header, botão do empty state). Quando isso
    // acontece sem envolver a chamada numa arrow function, o clique passa
    // o SyntheticEvent do React como `defaultStatus` (React sempre invoca
    // um `onClick` de elemento nativo com o evento, independente do que o
    // tipo TypeScript do prop declara). Esse evento acabava salvo em
    // `formData.status` e quebrava o insert no Supabase — `event.view` é
    // uma referência direta a `window`, e `window.window === window` é
    // exatamente o ciclo que o erro relatado descreve. Só aceitar valores
    // realmente pertencentes ao enum protege este ponto mesmo que um
    // call site futuro repita o mesmo erro de wiring.
    const safeDefaultStatus = ACTIVITY_STATUS_VALUES.includes(defaultStatus as ActivityStatus)
      ? (defaultStatus as ActivityStatus)
      : undefined;
    setEditingActivity(null);
    setFormData({
      title: '',
      type: 'CALL',
      date: new Date().toISOString().split('T')[0],
      time: '09:00',
      description: '',
      dealId: '',
      status: safeDefaultStatus || (taskTab === 'inbox' ? 'inbox' : 'todo'),
      priority: 'none',
      timeSphere: undefined,
    });
    setIsModalOpen(true);
  };

  const handleEditActivity = (activity: Activity) => {
    // Fecha a view somente leitura, se estiver aberta (o botão "Editar" de
    // dentro dela chama este handler) — nunca os dois modais abertos juntos.
    setViewingActivity(null);
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

  /**
   * Abre a visualização somente leitura (Pedido do fundador, 2026-08-11).
   * Clicar numa atividade (lista, blocos, calendário ou Kanban) chama isto,
   * nunca `handleEditActivity` diretamente — editar é exclusivo do ícone de
   * lápis (que existe na linha da lista e dentro desta própria view).
   */
  const handleViewActivity = useCallback((activity: Activity) => {
    setViewingActivity(activity);
  }, []);

  const handleCloseDetail = useCallback(() => {
    setViewingActivity(null);
  }, []);

  /** Muda o status de uma tarefa a partir do Kanban (drag-and-drop ou o `<select>` do card). */
  const handleChangeActivityStatus = useCallback(
    (id: string, status: ActivityStatus) => {
      updateActivityMutation.mutate(
        { id, updates: { status } },
        {
          onError: (error: Error) => {
            showToast(`Erro ao mover atividade: ${error.message}`, 'error');
          },
        }
      );
    },
    [updateActivityMutation, showToast]
  );

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
    listLayout,
    setListLayout,
    showCompleted,
    setShowCompleted,
    searchTerm,
    setSearchTerm,
    filterType,
    setFilterType,
    dateFilter,
    setDateFilter,
    clearDateFilter,
    currentDate,
    setCurrentDate,
    isModalOpen,
    setIsModalOpen,
    editingActivity,
    viewingActivity,
    formData,
    setFormData,
    filteredActivities,
    kanbanActivities,
    deals,
    contacts,
    companies,
    isLoading,
    handleNewActivity,
    handleEditActivity,
    handleViewActivity,
    handleCloseDetail,
    handleChangeActivityStatus,
    handleDeleteActivity,
    handleToggleComplete,
    handleSnoozeSelected,
    handleSubmit,
  };
};
