import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ActivityDetailModal } from './ActivityDetailModal';
import type { Activity, Deal } from '@/types';

/**
 * Pedido do fundador (2026-08-11): a view somente leitura mostra os dados da
 * atividade (título, status, prioridade, Tríade, data, negócio, checklist)
 * e NÃO é o formulário de edição — não deve existir nenhum campo editável de
 * título/descrição. "Editar" (o botão de lápis do cabeçalho) chama `onEdit`.
 */
const checklistItems = [
  { id: 'item-1', activityId: 'activity-1', title: 'Ligar antes das 10h', isDone: false, position: 1, createdAt: '' },
  { id: 'item-2', activityId: 'activity-1', title: 'Confirmar orçamento', isDone: true, position: 2, createdAt: '' },
];

const toggleSpy = vi.fn();
vi.mock('@/lib/query/hooks/useActivityChecklistQuery', () => ({
  useActivityChecklist: () => ({ data: checklistItems, isLoading: false }),
  useToggleChecklistItem: () => ({ mutate: toggleSpy }),
}));

const activity: Activity = {
  id: 'activity-1',
  dealId: 'deal-1',
  dealTitle: 'Negócio X',
  type: 'CALL',
  title: 'Ligar para o cliente',
  description: 'Confirmar detalhes da proposta.',
  date: new Date('2026-08-20T14:00:00').toISOString(),
  completed: false,
  user: { name: 'Eu', avatar: '' },
  status: 'in_progress',
  priority: 'high',
  timeSphere: 'importante',
};

const deal: Deal = {
  id: 'deal-1',
  title: 'Negócio X',
} as Deal;

describe('ActivityDetailModal — visualização somente leitura', () => {
  it('mostra título, status, prioridade, Tríade, negócio, descrição e checklist', () => {
    render(
      <ActivityDetailModal
        isOpen={true}
        onClose={vi.fn()}
        onEdit={vi.fn()}
        activity={activity}
        deal={deal}
      />
    );

    expect(screen.getByText('Ligar para o cliente')).toBeInTheDocument();
    expect(screen.getByText('Em andamento')).toBeInTheDocument();
    expect(screen.getByText('Alta')).toBeInTheDocument();
    expect(screen.getByText('Importante')).toBeInTheDocument();
    expect(screen.getByText('Negócio X')).toBeInTheDocument();
    expect(screen.getByText('Confirmar detalhes da proposta.')).toBeInTheDocument();
    expect(screen.getByText('Ligar antes das 10h')).toBeInTheDocument();
    expect(screen.getByText('Confirmar orçamento')).toBeInTheDocument();
  });

  it('NÃO renderiza nenhum campo de texto editável (não é o formulário de edição)', () => {
    render(
      <ActivityDetailModal
        isOpen={true}
        onClose={vi.fn()}
        onEdit={vi.fn()}
        activity={activity}
        deal={deal}
      />
    );

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Ex: Ligar para Cliente')).not.toBeInTheDocument();
  });

  it('marcar/desmarcar um item de checklist é permitido direto na view (ação leve, não é editar a atividade)', async () => {
    const user = userEvent.setup();
    render(
      <ActivityDetailModal
        isOpen={true}
        onClose={vi.fn()}
        onEdit={vi.fn()}
        activity={activity}
        deal={deal}
      />
    );

    const checkboxes = screen.getAllByRole('checkbox');
    await user.click(checkboxes[0]);

    expect(toggleSpy).toHaveBeenCalledWith({ id: 'item-1', activityId: 'activity-1', isDone: true });
  });

  it('clicar em "Editar atividade" chama onEdit com a atividade', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    render(
      <ActivityDetailModal
        isOpen={true}
        onClose={vi.fn()}
        onEdit={onEdit}
        activity={activity}
        deal={deal}
      />
    );

    await user.click(screen.getByTitle('Editar atividade'));

    expect(onEdit).toHaveBeenCalledWith(activity);
  });

  it('com título muito longo, o botão de fechar continua presente e clicável (bug do fundador, 2026-08-11)', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const longTitleActivity: Activity = {
      ...activity,
      title:
        'Título de atividade extremamente longo criado só para reproduzir o bug relatado pelo fundador em produção, onde o botão de fechar do modal desaparecia da tela quando o título da atividade era grande demais para caber no cabeçalho'.repeat(1),
    };
    expect(longTitleActivity.title.length).toBeGreaterThan(150);

    render(
      <ActivityDetailModal
        isOpen={true}
        onClose={onClose}
        onEdit={vi.fn()}
        activity={longTitleActivity}
        deal={deal}
      />
    );

    const closeButton = screen.getByTitle('Fechar');
    expect(closeButton).toBeInTheDocument();
    expect(closeButton).toBeVisible();

    await user.click(closeButton);
    expect(onClose).toHaveBeenCalledTimes(1);

    // O título deve truncar (elipse via CSS) em vez de empurrar o botão de
    // fechar para fora do header — garante que a classe/atributo corretos
    // continuam presentes mesmo que jsdom/happy-dom não calcule layout real.
    const heading = screen.getByTitle(longTitleActivity.title);
    expect(heading.className).toContain('truncate');
  });

  it('retorna null quando isOpen é false', () => {
    const { container } = render(
      <ActivityDetailModal
        isOpen={false}
        onClose={vi.fn()}
        onEdit={vi.fn()}
        activity={activity}
        deal={deal}
      />
    );

    expect(container).toBeEmptyDOMElement();
  });
});
