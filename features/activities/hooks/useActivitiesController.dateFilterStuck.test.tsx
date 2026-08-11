import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * Bug reportado pelo fundador em produção (2026-08-11): chegar em
 * `/activities?filter=today` (deep-link do módulo de Inbox, ver
 * `features/inbox/InboxPage.tsx`/`InboxSection.tsx`) mostra o badge
 * "Filtro: Hoje" no header — mas trocar de aba (Todas/Inbox) ou de visão
 * (Calendário/Kanban) não removia o `dateFilter` por baixo, então a lista
 * continuava restrita a "hoje" mesmo depois do usuário sair da aba/visão
 * que deveria mostrar tudo.
 *
 * Causa raiz: `setViewMode`/`setTaskTab` só geriam o parâmetro `?view=` na
 * URL, nunca `?filter=` — o `dateFilter` (mecanismo mais antigo, separado
 * das abas Todas/Hoje/Inbox da Fase 1) ficava "grudado" porque o efeito
 * que o aplica lê `searchParams.get('filter')` a cada render e o parâmetro
 * nunca era removido.
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

const todayIso = new Date().toISOString();
const yesterdayIso = (() => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString();
})();

const activitiesFixture = [
  {
    id: 'today-1',
    dealId: '',
    dealTitle: '',
    type: 'TASK',
    title: 'Tarefa de hoje',
    date: todayIso,
    completed: false,
    user: { name: 'Eu', avatar: '' },
    status: 'todo',
  },
  {
    id: 'overdue-1',
    dealId: '',
    dealTitle: '',
    type: 'TASK',
    title: 'Tarefa atrasada de ontem',
    date: yesterdayIso,
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

describe('useActivitiesController — dateFilter (?filter=) não deve ficar preso ao trocar de aba/visão', () => {
  beforeEach(() => {
    replaceSpy = vi.fn();
    currentSearchParams = new URLSearchParams('filter=today');
  });

  it('chegando com ?filter=today, a atividade atrasada fica de fora (comportamento do deep-link)', async () => {
    const { result } = renderHook(() => useActivitiesController(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.dateFilter).toBe('today');
    const titles = result.current.filteredActivities.map((a) => a.title);
    expect(titles).toContain('Tarefa de hoje');
    expect(titles).not.toContain('Tarefa atrasada de ontem');
  });

  it('trocar para a aba "Todas" (setTaskTab) limpa o dateFilter e volta a mostrar a atrasada', async () => {
    const { result } = renderHook(() => useActivitiesController(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.dateFilter).toBe('today');

    act(() => {
      result.current.setTaskTab('all');
    });

    expect(result.current.dateFilter).toBe('ALL');
    // Nenhum resquício de `filter=` deve sobrar na URL escrita.
    const writtenUrl = replaceSpy.mock.calls[replaceSpy.mock.calls.length - 1][0] as string;
    expect(writtenUrl).not.toContain('filter=');

    const titles = result.current.filteredActivities.map((a) => a.title);
    expect(titles).toContain('Tarefa de hoje');
    expect(titles).toContain('Tarefa atrasada de ontem');
  });

  it('trocar de visão (setViewMode calendar) também limpa o dateFilter', async () => {
    const { result } = renderHook(() => useActivitiesController(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.dateFilter).toBe('today');

    act(() => {
      result.current.setViewMode('calendar');
    });

    expect(result.current.dateFilter).toBe('ALL');
    const writtenUrl = replaceSpy.mock.calls[replaceSpy.mock.calls.length - 1][0] as string;
    expect(writtenUrl).not.toContain('filter=');
    expect(writtenUrl).toContain('view=calendario');

    const titles = result.current.filteredActivities.map((a) => a.title);
    expect(titles).toContain('Tarefa atrasada de ontem');
  });

  it('clearDateFilter (botão "x" do badge) limpa o filtro sem mexer em viewMode/taskTab', async () => {
    const { result } = renderHook(() => useActivitiesController(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.clearDateFilter();
    });

    expect(result.current.dateFilter).toBe('ALL');
    expect(result.current.viewMode).toBe('list');
    expect(result.current.taskTab).toBe('all');
    const writtenUrl = replaceSpy.mock.calls[replaceSpy.mock.calls.length - 1][0] as string;
    expect(writtenUrl).not.toContain('filter=');

    const titles = result.current.filteredActivities.map((a) => a.title);
    expect(titles).toContain('Tarefa atrasada de ontem');
  });
});
