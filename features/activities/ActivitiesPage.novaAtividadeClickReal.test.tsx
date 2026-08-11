import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * Regressão da causa raiz REAL do bug relatado pelo fundador em 2026-08-11
 * ("Erro ao criar atividade: Converting circular structure to JSON -->
 * starting at object with constructor 'Window' --- property 'window' closes
 * the circle"), que o commit `c0f3788` (fix do `required` no select "Negócio
 * Relacionado") NÃO corrigiu — só corrigiu um bug de validação que coexistia.
 *
 * Causa raiz real: `handleNewActivity` (em `useActivitiesController.ts`) era
 * passada DIRETAMENTE como `onClick` de dois botões nativos ("Nova
 * Atividade" no header e no empty state), sem uma arrow function
 * intermediária. React sempre invoca um `onClick` de elemento nativo com o
 * `SyntheticEvent` do clique, independente do que o tipo TypeScript do prop
 * declara (`() => void` não protege em runtime) — então
 * `handleNewActivity(syntheticEvent)` era chamada de verdade, e o evento
 * caía no parâmetro opcional `defaultStatus`, sendo salvo como
 * `formData.status`. Ao submeter, esse evento ia inteiro pro payload do
 * insert no Supabase; `syntheticEvent.view` é uma referência direta a
 * `window` (React copia `nativeEvent.view` para eventos de UI/mouse), e
 * `window.window === window` fecha exatamente o ciclo que a mensagem de
 * erro descreve. `activitiesService.create()` em si sempre foi seguro
 * (só primitivos sanitizados) — o valor não serializável entrava ANTES, na
 * camada de wiring do clique, não na camada de serviço. Por isso o teste
 * anterior (`useActivitiesController.taskLivre.test.tsx`, que chama
 * `handleNewActivity()` e `handleSubmit(fakeEvent)` diretamente, pulando o
 * clique real no botão) nunca pegou esse bug.
 *
 * Este teste renderiza `ActivitiesPage` de verdade e clica de verdade no
 * botão "Nova Atividade" do header (via `userEvent`, sem chamar nenhum
 * handler diretamente) — só mocka a camada mais baixa (`@/lib/supabase/client`,
 * `next/navigation`, `AuthContext`, hooks de deals/contacts/companies,
 * Realtime), reproduzindo o cenário real de wiring de evento pedido.
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
  useToast: () => ({ showToast: toastSpy, addToast: toastSpy }),
}));

vi.mock('@/lib/realtime/useRealtimeSync', () => ({
  useRealtimeSync: () => ({}),
}));

const dealsFixture = [
  { id: 'deal-1', title: 'Negócio de teste', contactId: undefined, clientCompanyId: undefined },
];
vi.mock('@/lib/query/hooks/useDealsQuery', () => ({
  useDeals: () => ({ data: dealsFixture, isLoading: false }),
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
        order: () => ({
          limit: async () => ({ data: [], error: null }),
        }),
      }),
      insert: (payload: Record<string, unknown>) => ({
        select: () => ({
          // Replica o `body: JSON.stringify(this.body)` real do
          // postgrest-js (@supabase/postgrest-js/src/PostgrestBuilder.ts):
          // se algo no payload não for serializável (ex: um SyntheticEvent
          // vazado por um wiring de onClick errado), isto lança aqui, igual
          // em produção.
          single: async () => ({ data: JSON.parse(JSON.stringify(payload)), error: null }),
        }),
      }),
    }),
  },
}));

import { ActivitiesPage } from './ActivitiesPage';

function renderPage() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <ActivitiesPage />
    </QueryClientProvider>
  );
}

describe('ActivitiesPage — clique real em "Nova Atividade" (sem chamar handlers direto)', () => {
  // Lista de atividades fica vazia neste teste (getAll mockado retorna []),
  // então existem DOIS botões "Nova Atividade" na tela: o do header e o do
  // empty state de `ActivitiesList`. Ambos tinham o mesmo bug de wiring
  // (`onClick={handleNewActivity}` direto), então o teste cobre os dois
  // pontos de entrada em vez de assumir que só existe um botão com esse nome.

  it('cria a tarefa com sucesso ao clicar no botão "Nova Atividade" do header', async () => {
    const user = userEvent.setup();
    renderPage();

    const [headerButton] = await screen.findAllByRole('button', { name: /Nova Atividade/i });

    // Clique real no botão — é aqui que o SyntheticEvent do React entrava
    // como `defaultStatus` antes da correção.
    await user.click(headerButton);

    const titleInput = await screen.findByPlaceholderText('Ex: Ligar para Cliente');
    await user.type(titleInput, 'Tarefa solta via clique real (header)');

    await user.click(screen.getByRole('button', { name: /Criar Atividade/i }));

    await waitFor(() => {
      expect(toastSpy).toHaveBeenCalledWith('Atividade criada com sucesso', 'success');
    });

    const errorToastCall = toastSpy.mock.calls.find((c) => String(c[0]).includes('Erro ao criar'));
    expect(errorToastCall).toBeUndefined();
  });

  it('cria a tarefa com sucesso ao clicar no botão "Nova Atividade" do empty state (mesmo wiring, outro ponto de entrada)', async () => {
    const user = userEvent.setup();
    renderPage();

    const buttons = await screen.findAllByRole('button', { name: /Nova Atividade/i });
    expect(buttons).toHaveLength(2);
    const emptyStateButton = buttons[1];

    await user.click(emptyStateButton);

    const titleInput = await screen.findByPlaceholderText('Ex: Ligar para Cliente');
    await user.type(titleInput, 'Tarefa solta via empty state');
    await user.click(screen.getByRole('button', { name: /Criar Atividade/i }));

    await waitFor(() => {
      expect(toastSpy).toHaveBeenCalledWith('Atividade criada com sucesso', 'success');
    });

    const errorToastCall = toastSpy.mock.calls.find((c) => String(c[0]).includes('Erro ao criar'));
    expect(errorToastCall).toBeUndefined();
  });

  it('cria a tarefa com sucesso também COM negócio selecionado — a corrupção acontecia no clique do botão, antes de o modal abrir, então independe de selecionar um negócio depois', async () => {
    const user = userEvent.setup();
    renderPage();

    const [headerButton] = await screen.findAllByRole('button', { name: /Nova Atividade/i });
    await user.click(headerButton);

    const titleInput = await screen.findByPlaceholderText('Ex: Ligar para Cliente');
    await user.type(titleInput, 'Tarefa com negócio via clique real');

    const dealLabel = screen.getByText('Negócio Relacionado');
    const dealSelect = dealLabel.parentElement?.querySelector('select') as HTMLSelectElement;
    await user.selectOptions(dealSelect, 'deal-1');

    await user.click(screen.getByRole('button', { name: /Criar Atividade/i }));

    await waitFor(() => {
      expect(toastSpy).toHaveBeenCalledWith('Atividade criada com sucesso', 'success');
    });

    const errorToastCall = toastSpy.mock.calls.find((c) => String(c[0]).includes('Erro ao criar'));
    expect(errorToastCall).toBeUndefined();
  });
});
