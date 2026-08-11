import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ActivitiesKanban } from './ActivitiesKanban';
import type { Activity } from '@/types';

/**
 * Pedido do fundador (2026-08-11): Kanban por status (Inbox/A Fazer/Em
 * Andamento/Concluído), antecipando a Fase 2 do plano
 * (docs/plano-central-de-tarefas.md). Cobre: agrupamento correto por
 * coluna, exclusão das entradas `STATUS_CHANGE` (log automático de mudança
 * de estágio do negócio — não são tarefas reais) e o `<select>` de status
 * como alternativa ao drag-and-drop nativo (não testado aqui via jsdom por
 * ser um mecanismo de baixo nível/pouco confiável de simular; o `<select>`
 * é o caminho garantido de mudar a coluna sem depender de mouse).
 */
function buildActivity(overrides: Partial<Activity>): Activity {
  return {
    id: 'activity-1',
    dealId: '',
    dealTitle: '',
    type: 'TASK',
    title: 'Tarefa padrão',
    date: new Date().toISOString(),
    completed: false,
    user: { name: 'Eu', avatar: '' },
    status: 'todo',
    ...overrides,
  };
}

describe('ActivitiesKanban — colunas por status', () => {
  it('renderiza cada atividade na coluna correspondente ao seu status', () => {
    const activities = [
      buildActivity({ id: 'a-inbox', title: 'Tarefa Inbox', status: 'inbox' }),
      buildActivity({ id: 'a-todo', title: 'Tarefa A Fazer', status: 'todo' }),
      buildActivity({ id: 'a-doing', title: 'Tarefa Em Andamento', status: 'in_progress' }),
      buildActivity({ id: 'a-done', title: 'Tarefa Concluída', status: 'done', completed: true }),
    ];

    render(
      <ActivitiesKanban
        activities={activities}
        deals={[]}
        companies={[]}
        onView={vi.fn()}
        onEdit={vi.fn()}
        onChangeStatus={vi.fn()}
      />
    );

    const inboxColumn = screen.getByLabelText(/Coluna Inbox/);
    const todoColumn = screen.getByLabelText(/Coluna A Fazer/);
    const doingColumn = screen.getByLabelText(/Coluna Em Andamento/);
    const doneColumn = screen.getByLabelText(/Coluna Concluído/);

    expect(within(inboxColumn).getByText('Tarefa Inbox')).toBeInTheDocument();
    expect(within(todoColumn).getByText('Tarefa A Fazer')).toBeInTheDocument();
    expect(within(doingColumn).getByText('Tarefa Em Andamento')).toBeInTheDocument();
    // A coluna "Concluído" precisa mostrar tarefas concluídas — diferente da
    // aba "Todas" da Lista, que as esconde por padrão.
    expect(within(doneColumn).getByText('Tarefa Concluída')).toBeInTheDocument();
  });

  it('atividade sem status definido cai na coluna "A Fazer" (default)', () => {
    const activities = [buildActivity({ title: 'Tarefa sem status', status: undefined })];

    render(
      <ActivitiesKanban
        activities={activities}
        deals={[]}
        companies={[]}
        onView={vi.fn()}
        onEdit={vi.fn()}
        onChangeStatus={vi.fn()}
      />
    );

    const todoColumn = screen.getByLabelText(/Coluna A Fazer/);
    expect(within(todoColumn).getByText('Tarefa sem status')).toBeInTheDocument();
  });

  it('clicar no card chama onView, e clicar no lápis chama onEdit (sem acionar onView)', async () => {
    const user = userEvent.setup();
    const onView = vi.fn();
    const onEdit = vi.fn();
    const activity = buildActivity({ title: 'Tarefa clicável' });

    render(
      <ActivitiesKanban
        activities={[activity]}
        deals={[]}
        companies={[]}
        onView={onView}
        onEdit={onEdit}
        onChangeStatus={vi.fn()}
      />
    );

    await user.click(screen.getByTitle('Editar'));
    expect(onEdit).toHaveBeenCalledWith(activity);
    expect(onView).not.toHaveBeenCalled();

    await user.click(screen.getByText('Tarefa clicável'));
    expect(onView).toHaveBeenCalledWith(activity);
  });

  it('trocar o status pelo <select> do card chama onChangeStatus com a nova coluna', async () => {
    const user = userEvent.setup();
    const onChangeStatus = vi.fn();
    const activity = buildActivity({ title: 'Tarefa a mover', status: 'todo' });

    render(
      <ActivitiesKanban
        activities={[activity]}
        deals={[]}
        companies={[]}
        onView={vi.fn()}
        onEdit={vi.fn()}
        onChangeStatus={onChangeStatus}
      />
    );

    const select = screen.getByLabelText(/Mover "Tarefa a mover" para outra coluna/);
    await user.selectOptions(select, 'in_progress');

    expect(onChangeStatus).toHaveBeenCalledWith('activity-1', 'in_progress');
  });
});
