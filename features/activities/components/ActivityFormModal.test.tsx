import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ActivityFormModal } from './ActivityFormModal';
import type { ActivityPriority, ActivityStatus, TimeSphere } from '@/types';

/**
 * Regressão do Bug 1 (Central de Tarefas, Fase 1): "tarefa solta" (sem
 * negócio/contato vinculado) é um caso de uso central deste módulo
 * (ver docs/plano-central-de-tarefas.md, seção 1.1 — `deal_id`/`contact_id`
 * já são nullable no banco). O select "Negócio Relacionado" NUNCA deve ser
 * `required` ao criar uma atividade nova, senão o navegador bloqueia o
 * submit e o caso de uso fica inacessível pela UI.
 *
 * `ActivityChecklistSection` (renderizado só ao editar) depende de
 * `useAuth`/TanStack Query — mockados aqui porque não é o que este teste
 * está verificando.
 */
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ profile: { id: 'user-1' }, organizationId: 'org-1' }),
}));

function baseFormData() {
  return {
    title: '',
    type: 'CALL' as const,
    date: '2026-08-10',
    time: '09:00',
    description: '',
    dealId: '',
    status: 'todo' as ActivityStatus,
    priority: 'none' as ActivityPriority,
    timeSphere: undefined as TimeSphere | undefined,
  };
}

/** O select não tem `htmlFor`/`id` ligando-o ao `<label>` — busca pelo texto do label. */
function getDealSelect(): HTMLSelectElement {
  const label = screen.getByText('Negócio Relacionado');
  const select = label.parentElement?.querySelector('select');
  if (!select) throw new Error('Select "Negócio Relacionado" não encontrado');
  return select as HTMLSelectElement;
}

function renderWithQueryClient(node: React.ReactElement) {
  const queryClient = new QueryClient();
  return render(<QueryClientProvider client={queryClient}>{node}</QueryClientProvider>);
}

describe('ActivityFormModal — campo "Negócio Relacionado"', () => {
  it('não é required ao criar uma atividade nova (permite "tarefa solta")', () => {
    renderWithQueryClient(
      <ActivityFormModal
        isOpen
        onClose={() => {}}
        onSubmit={() => {}}
        formData={baseFormData()}
        setFormData={() => {}}
        editingActivity={null}
        deals={[]}
      />
    );

    expect(getDealSelect()).not.toBeRequired();
  });

  it('continua não sendo required ao editar (nunca era, comportamento preservado)', () => {
    renderWithQueryClient(
      <ActivityFormModal
        isOpen
        onClose={() => {}}
        onSubmit={() => {}}
        formData={baseFormData()}
        setFormData={() => {}}
        editingActivity={{ id: 'act-1' } as never}
        deals={[]}
      />
    );

    expect(getDealSelect()).not.toBeRequired();
  });
});
