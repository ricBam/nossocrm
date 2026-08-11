import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ActivitiesList } from './ActivitiesList';
import type { Activity } from '@/types';

/**
 * Pedido do fundador (2026-08-11): "Blocos" não é uma visão nova — é um
 * formato de renderização dentro da própria Lista, com os MESMOS dados já
 * filtrados (não agrupa por status, ao contrário do Kanban). Este teste
 * garante que os dois formatos (`rows`/`blocks`) mostram o mesmo conjunto de
 * atividades, só trocando a apresentação (linhas vs. grade de cards).
 */
vi.mock('@/lib/query/hooks/useBoardsQuery', () => ({
  useBoards: () => ({ data: [] }),
}));

const activities: Activity[] = [
  {
    id: 'activity-1',
    dealId: '',
    dealTitle: '',
    type: 'TASK',
    title: 'Tarefa A',
    date: new Date().toISOString(),
    completed: false,
    user: { name: 'Eu', avatar: '' },
  },
  {
    id: 'activity-2',
    dealId: '',
    dealTitle: '',
    type: 'CALL',
    title: 'Tarefa B',
    date: new Date().toISOString(),
    completed: false,
    user: { name: 'Eu', avatar: '' },
  },
];

function renderList(layout: 'rows' | 'blocks') {
  const onView = vi.fn();
  render(
    <ActivitiesList
      activities={activities}
      deals={[]}
      contacts={[]}
      companies={[]}
      layout={layout}
      onToggleComplete={vi.fn()}
      onEdit={vi.fn()}
      onDelete={vi.fn()}
      onView={onView}
    />
  );
  return { onView };
}

describe('ActivitiesList — toggle Lista (linhas) / Blocos (grade) preserva os mesmos dados filtrados', () => {
  it('layout "rows" (default) mostra as mesmas atividades que "blocks"', () => {
    const { unmount } = render(
      <ActivitiesList
        activities={activities}
        deals={[]}
        contacts={[]}
        companies={[]}
        onToggleComplete={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onView={vi.fn()}
      />
    );
    expect(screen.getByText('Tarefa A')).toBeInTheDocument();
    expect(screen.getByText('Tarefa B')).toBeInTheDocument();
    unmount();

    renderList('blocks');
    expect(screen.getByText('Tarefa A')).toBeInTheDocument();
    expect(screen.getByText('Tarefa B')).toBeInTheDocument();
  });

  it('em "rows", clicar na atividade chama onView (via ActivityRow)', async () => {
    const { onView } = renderList('rows');
    // A própria linha é clicável (role="button") — clicar no título já cobre.
    screen.getByText('Tarefa A').click();
    expect(onView).toHaveBeenCalledWith(activities[0]);
  });

  it('em "blocks", clicar no card chama onView (via ActivityCard)', async () => {
    const { onView } = renderList('blocks');
    screen.getByText('Tarefa B').click();
    expect(onView).toHaveBeenCalledWith(activities[1]);
  });

  it('lista vazia mostra o mesmo EmptyState em ambos os layouts', () => {
    const { unmount } = render(
      <ActivitiesList
        activities={[]}
        deals={[]}
        contacts={[]}
        companies={[]}
        layout="rows"
        onToggleComplete={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onView={vi.fn()}
      />
    );
    expect(screen.getByText('Nenhuma atividade encontrada')).toBeInTheDocument();
    unmount();

    render(
      <ActivitiesList
        activities={[]}
        deals={[]}
        contacts={[]}
        companies={[]}
        layout="blocks"
        onToggleComplete={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onView={vi.fn()}
      />
    );
    expect(screen.getByText('Nenhuma atividade encontrada')).toBeInTheDocument();
  });
});
