import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * Pedido do fundador (2026-08-11): Kanban por status como nova visão de
 * topo, usando o mesmo parâmetro `view` já usado por `hoje`/`inbox`
 * (`?view=kanban`, "no mesmo padrão dos outros `?view=` já usados").
 *
 * Cobre dois pontos que não dependem de renderizar a UI:
 * 1. `kanbanActivities` precisa incluir tarefas concluídas (a coluna
 *    "Concluído" existe) e excluir entradas `STATUS_CHANGE` (log automático
 *    de mudança de estágio do negócio, não são tarefas reais) — diferente
 *    de `filteredActivities`, que na aba "Todas" (default) exclui
 *    concluídas e não filtra por tipo.
 * 2. `setViewMode`/`setTaskTab` escrevem no mesmo parâmetro `view` sem se
 *    atropelarem (viewMode kanban/calendario reseta a aba para "Todas";
 *    escolher uma aba força viewMode de volta pra "list").
 */
let replaceSpy = vi.fn();
let currentSearchParams = new URLSearchParams('');

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceSpy }),
  useSearchParams: () => currentSearchParams,
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ profile: { id: 'user-1' }, organizationId: 'org-1' }),
}));

vi.mock('@/context/ToastContext', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

vi.mock('@/lib/realtime/useRealtimeSync', () => ({
  useRealtimeSync: () => ({}),
}));

vi.mock('@/lib/query/hooks/useDealsQuery', () => ({
  useDeals: () => ({ data: [], isLoading: false }),
}));
vi.mock('@/lib/query/hooks/useContactsQuery', () => ({
  useContacts: () => ({ data: [], isLoading: false }),
  useCompanies: () => ({ data: [], isLoading: false }),
}));

const activitiesFixture = [
  {
    id: 'todo-1',
    dealId: '',
    dealTitle: '',
    type: 'TASK',
    title: 'Tarefa pendente',
    date: new Date().toISOString(),
    completed: false,
    user: { name: 'Eu', avatar: '' },
    status: 'todo',
  },
  {
    id: 'done-1',
    dealId: '',
    dealTitle: '',
    type: 'TASK',
    title: 'Tarefa concluída',
    date: new Date().toISOString(),
    completed: true,
    user: { name: 'Eu', avatar: '' },
    status: 'done',
  },
  {
    id: 'status-change-1',
    dealId: 'deal-1',
    dealTitle: 'Negócio X',
    type: 'STATUS_CHANGE',
    title: 'Moveu para Proposta',
    date: new Date().toISOString(),
    completed: false,
    user: { name: 'Eu', avatar: '' },
    status: 'todo',
  },
];

vi.mock('@/lib/query/hooks/useActivitiesQuery', () => ({
  useActivities: () => ({ data: activitiesFixture, isLoading: false }),
  useCreateActivity: () => ({ mutate: vi.fn() }),
  useUpdateActivity: () => ({ mutate: vi.fn() }),
  useDeleteActivity: () => ({ mutate: vi.fn() }),
}));

import { useActivitiesController } from './useActivitiesController';

function Wrapper({ children }: { children: React.ReactNode }) {
  const [queryClient] = React.useState(() => new QueryClient());
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe('useActivitiesController — kanbanActivities e parâmetro `view` combinado', () => {
  beforeEach(() => {
    replaceSpy = vi.fn();
    currentSearchParams = new URLSearchParams('');
  });

  it('kanbanActivities inclui a tarefa concluída e exclui a entrada STATUS_CHANGE', async () => {
    const { result } = renderHook(() => useActivitiesController(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const kanbanTitles = result.current.kanbanActivities.map((a) => a.title);
    expect(kanbanTitles).toContain('Tarefa pendente');
    expect(kanbanTitles).toContain('Tarefa concluída');
    expect(kanbanTitles).not.toContain('Moveu para Proposta');
  });

  it('filteredActivities (aba "Todas", default) exclui a concluída — diferença real com kanbanActivities', async () => {
    const { result } = renderHook(() => useActivitiesController(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const listTitles = result.current.filteredActivities.map((a) => a.title);
    expect(listTitles).toContain('Tarefa pendente');
    expect(listTitles).not.toContain('Tarefa concluída');
  });

  it('setViewMode("kanban") escreve ?view=kanban na URL', async () => {
    const { result } = renderHook(() => useActivitiesController(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.setViewMode('kanban');
    });

    expect(replaceSpy).toHaveBeenCalledWith('?view=kanban', { scroll: false });
    expect(result.current.viewMode).toBe('kanban');
  });

  it('setTaskTab("today") escreve ?view=hoje e mantém/força viewMode "list"', async () => {
    const { result } = renderHook(() => useActivitiesController(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.setTaskTab('today');
    });

    expect(replaceSpy).toHaveBeenCalledWith('?view=hoje', { scroll: false });
    expect(result.current.viewMode).toBe('list');
    expect(result.current.taskTab).toBe('today');
  });

  it('lendo a URL diretamente com ?view=kanban, o hook já inicializa em viewMode "kanban"', async () => {
    currentSearchParams = new URLSearchParams('view=kanban');
    const { result } = renderHook(() => useActivitiesController(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.viewMode).toBe('kanban');
  });
});
