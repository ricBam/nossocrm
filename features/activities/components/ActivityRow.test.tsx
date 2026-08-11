import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ActivityRow } from './ActivityRow';
import type { Activity } from '@/types';

/**
 * Pedido do fundador (2026-08-11): clicar numa atividade da lista deve abrir
 * a visualização somente leitura (`onView`), não o formulário de edição
 * (`onEdit`) — editar continua exclusivo do ícone de lápis. Este teste cobre
 * a regra na camada mais baixa (a própria linha), sem depender de montar
 * `ActivitiesPage` inteira.
 */
vi.mock('@/lib/query/hooks/useBoardsQuery', () => ({
  useBoards: () => ({ data: [] }),
}));

const activity: Activity = {
  id: 'activity-1',
  dealId: '',
  dealTitle: '',
  type: 'TASK',
  title: 'Ligar para o cliente',
  date: new Date().toISOString(),
  completed: false,
  user: { name: 'Eu', avatar: '' },
};

function renderRow(overrides: Partial<React.ComponentProps<typeof ActivityRow>> = {}) {
  const onView = vi.fn();
  const onEdit = vi.fn();
  const onToggleComplete = vi.fn();
  const onDelete = vi.fn();
  const onSelect = vi.fn();

  render(
    <ActivityRow
      activity={activity}
      onToggleComplete={onToggleComplete}
      onEdit={onEdit}
      onDelete={onDelete}
      onView={onView}
      onSelect={onSelect}
      isSelected={false}
      {...overrides}
    />
  );

  return { onView, onEdit, onToggleComplete, onDelete, onSelect };
}

describe('ActivityRow — clique na linha abre a view, não o formulário de edição', () => {
  it('clicar na linha chama onView e NÃO chama onEdit', async () => {
    const user = userEvent.setup();
    const { onView, onEdit } = renderRow();

    await user.click(screen.getByText('Ligar para o cliente'));

    expect(onView).toHaveBeenCalledWith(activity);
    expect(onEdit).not.toHaveBeenCalled();
  });

  it('clicar no ícone de lápis chama onEdit e NÃO chama onView (o lápis continua exclusivo para editar)', async () => {
    const user = userEvent.setup();
    const { onView, onEdit } = renderRow();

    await user.click(screen.getByTitle('Editar'));

    expect(onEdit).toHaveBeenCalledWith(activity);
    expect(onView).not.toHaveBeenCalled();
  });

  it('clicar em Excluir chama onDelete e NÃO chama onView', async () => {
    const user = userEvent.setup();
    const { onView, onDelete } = renderRow();

    await user.click(screen.getByTitle('Excluir'));

    expect(onDelete).toHaveBeenCalledWith(activity.id);
    expect(onView).not.toHaveBeenCalled();
  });

  it('clicar no botão de concluir chama onToggleComplete e NÃO chama onView', async () => {
    const user = userEvent.setup();
    const { onView, onToggleComplete } = renderRow();

    await user.click(screen.getByRole('button', { name: 'Concluir atividade' }));

    expect(onToggleComplete).toHaveBeenCalledWith(activity.id);
    expect(onView).not.toHaveBeenCalled();
  });

  it('clicar no checkbox de seleção chama onSelect e NÃO chama onView', async () => {
    const user = userEvent.setup();
    const { onView, onSelect } = renderRow();

    await user.click(screen.getByRole('checkbox'));

    expect(onSelect).toHaveBeenCalledWith(activity.id, true);
    expect(onView).not.toHaveBeenCalled();
  });

  it('pressionar Enter na linha (foco via teclado) também chama onView', async () => {
    const user = userEvent.setup();
    const { onView } = renderRow();

    const row = screen.getByText('Ligar para o cliente').closest('[role="button"]') as HTMLElement;
    row.focus();
    await user.keyboard('{Enter}');

    expect(onView).toHaveBeenCalledWith(activity);
  });
});
