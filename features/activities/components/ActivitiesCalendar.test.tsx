import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ActivitiesCalendar } from './ActivitiesCalendar';
import type { Activity } from '@/types';

/**
 * Pedido do fundador (2026-08-11): clicar num evento do calendário deve
 * abrir a visualização somente leitura (`onView`) — antes desta mudança o
 * evento não tinha `onClick` nenhum (era só `cursor-pointer` visual, sem
 * comportamento real).
 */
function buildActivityAt(hour: number): Activity {
  const date = new Date();
  date.setHours(hour, 0, 0, 0);
  return {
    id: 'activity-1',
    dealId: '',
    dealTitle: '',
    type: 'CALL',
    title: 'Reunião com o cliente X',
    date: date.toISOString(),
    completed: false,
    user: { name: 'Eu', avatar: '' },
  };
}

describe('ActivitiesCalendar — clique num evento abre a view somente leitura', () => {
  it('chama onView com a atividade ao clicar no card do evento', async () => {
    const user = userEvent.setup();
    const onView = vi.fn();
    const activity = buildActivityAt(10);

    render(
      <ActivitiesCalendar
        activities={[activity]}
        deals={[]}
        currentDate={new Date()}
        setCurrentDate={() => {}}
        onView={onView}
      />
    );

    await user.click(screen.getByText('Reunião com o cliente X'));

    expect(onView).toHaveBeenCalledWith(activity);
  });

  it('pressionar Enter no evento (foco via teclado) também chama onView', async () => {
    const user = userEvent.setup();
    const onView = vi.fn();
    const activity = buildActivityAt(11);

    render(
      <ActivitiesCalendar
        activities={[activity]}
        deals={[]}
        currentDate={new Date()}
        setCurrentDate={() => {}}
        onView={onView}
      />
    );

    const eventCard = screen.getByText('Reunião com o cliente X').closest('[role="button"]') as HTMLElement;
    eventCard.focus();
    await user.keyboard('{Enter}');

    expect(onView).toHaveBeenCalledWith(activity);
  });
});
