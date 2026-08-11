import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * Regressão do Bug 1 (Central de Tarefas, Fase 1 — bug reportado pelo
 * fundador em teste manual no `crm-preview`, 2026-08-10/11): criar uma
 * atividade/tarefa "solta" (sem `dealId`/`contactId`) deve funcionar de
 * ponta a ponta pelo fluxo real de `useActivitiesController.handleSubmit`
 * → `useCreateActivity` → `activitiesService.create`.
 *
 * Investigação: o payload construído em `activitiesService.create` é
 * inteiramente feito de primitivos sanitizados (strings/booleans/arrays de
 * string/null) mesmo com `dealId`/`contactId` vazios — não há como um valor
 * não serializável (ex: evento do DOM, referência a `window`) chegar até o
 * `JSON.stringify(body)` que o `@supabase/postgrest-js` faz internamente no
 * insert (`PostgrestBuilder.ts`). Este teste mocka `@/lib/supabase/client`
 * com um `insert()` que replica esse `JSON.stringify` real, para pegar
 * qualquer regressão futura que introduza um valor não serializável nesse
 * caminho. A causa raiz real do bug relatado era o campo "Negócio
 * Relacionado" estar incorretamente `required` no formulário para
 * atividades novas (corrigido em `ActivityFormModal.tsx` — ver também
 * `ActivityFormModal.test.tsx`), bloqueando esse fluxo antes mesmo de
 * chegar aqui pela UI real.
 */
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ profile: { id: 'user-1' }, organizationId: 'org-1' }),
}));

const toastSpy = vi.fn();
vi.mock('@/context/ToastContext', () => ({
  useToast: () => ({ showToast: toastSpy }),
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

vi.mock('@/lib/supabase/client', () => ({
  supabase: {
    auth: {
      getUser: async () => ({ data: { user: { id: 'user-1' } } }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: { organization_id: 'org-1' } }),
        }),
      }),
      insert: (payload: Record<string, unknown>) => ({
        select: () => ({
          // Replica o `body: JSON.stringify(this.body)` real do postgrest-js
          // (@supabase/postgrest-js/src/PostgrestBuilder.ts) — se algo no
          // payload não for serializável, isto lança aqui, igual em produção.
          single: async () => ({ data: JSON.parse(JSON.stringify(payload)), error: null }),
        }),
      }),
    }),
  },
}));

import { useActivitiesController } from './useActivitiesController';

function Wrapper({ children }: { children: React.ReactNode }) {
  const [queryClient] = React.useState(() => new QueryClient());
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe('useActivitiesController — criar tarefa solta (sem negócio/contato)', () => {
  it('cria com sucesso, sem lançar erro de serialização, quando dealId/contactId ficam vazios', async () => {
    const { result } = renderHook(() => useActivitiesController(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.handleNewActivity();
    });

    act(() => {
      result.current.setFormData({
        ...result.current.formData,
        title: 'Tarefa solta de teste',
        dealId: '',
      });
    });

    await act(async () => {
      result.current.handleSubmit({ preventDefault: () => {} } as unknown as React.FormEvent);
      await new Promise((r) => setTimeout(r, 0));
    });

    await waitFor(() => {
      expect(toastSpy).toHaveBeenCalledWith('Atividade criada com sucesso', 'success');
    });

    const errorToastCall = toastSpy.mock.calls.find((c) => String(c[0]).includes('Erro ao criar'));
    expect(errorToastCall).toBeUndefined();
  });
});
