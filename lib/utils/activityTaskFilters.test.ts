import { describe, it, expect } from 'vitest';
import { matchesTaskTab } from './activityTaskFilters';
import type { Activity } from '@/types';

const NOW = new Date('2026-08-10T12:00:00.000Z');

function makeActivity(overrides: Partial<Activity> = {}): Activity {
  return {
    id: 'act-1',
    dealId: '',
    dealTitle: '',
    type: 'TASK',
    title: 'Tarefa de teste',
    date: NOW.toISOString(),
    completed: false,
    user: { name: 'Você', avatar: '' },
    ...overrides,
  };
}

describe('matchesTaskTab', () => {
  describe('aba "Todas"', () => {
    it('inclui atividades pendentes', () => {
      const activity = makeActivity({ completed: false });
      expect(matchesTaskTab(activity, { taskTab: 'all', showCompleted: false, now: NOW })).toBe(true);
    });

    it('exclui concluídas quando showCompleted é false', () => {
      const activity = makeActivity({ completed: true });
      expect(matchesTaskTab(activity, { taskTab: 'all', showCompleted: false, now: NOW })).toBe(false);
    });

    it('inclui concluídas quando showCompleted é true', () => {
      const activity = makeActivity({ completed: true });
      expect(matchesTaskTab(activity, { taskTab: 'all', showCompleted: true, now: NOW })).toBe(true);
    });
  });

  describe('aba "Hoje"', () => {
    it('inclui atividade com due date igual a hoje', () => {
      const activity = makeActivity({ date: '2026-08-10T08:00:00.000Z', completed: false });
      expect(matchesTaskTab(activity, { taskTab: 'today', showCompleted: false, now: NOW })).toBe(true);
    });

    it('inclui atividade marcada como foco do dia mesmo com due date futuro', () => {
      const activity = makeActivity({
        date: '2026-08-20T08:00:00.000Z',
        isFocusToday: true,
        completed: false,
      });
      expect(matchesTaskTab(activity, { taskTab: 'today', showCompleted: false, now: NOW })).toBe(true);
    });

    it('exclui atividade com due date futuro e sem foco do dia', () => {
      const activity = makeActivity({ date: '2026-08-20T08:00:00.000Z', completed: false });
      expect(matchesTaskTab(activity, { taskTab: 'today', showCompleted: false, now: NOW })).toBe(false);
    });

    it('exclui atividade concluída mesmo se due hoje ou marcada como foco', () => {
      const activity = makeActivity({
        date: '2026-08-10T08:00:00.000Z',
        isFocusToday: true,
        completed: true,
      });
      expect(matchesTaskTab(activity, { taskTab: 'today', showCompleted: false, now: NOW })).toBe(false);
    });

    it('exclui atividade de dia anterior sem foco do dia (atrasada não é "hoje")', () => {
      const activity = makeActivity({ date: '2026-08-09T08:00:00.000Z', completed: false });
      expect(matchesTaskTab(activity, { taskTab: 'today', showCompleted: false, now: NOW })).toBe(false);
    });
  });

  describe('aba "Inbox"', () => {
    it('inclui só atividades com status inbox', () => {
      const inInbox = makeActivity({ status: 'inbox' });
      const notInInbox = makeActivity({ status: 'todo' });
      const withoutStatus = makeActivity({ status: undefined });

      expect(matchesTaskTab(inInbox, { taskTab: 'inbox', showCompleted: false, now: NOW })).toBe(true);
      expect(matchesTaskTab(notInInbox, { taskTab: 'inbox', showCompleted: false, now: NOW })).toBe(false);
      expect(matchesTaskTab(withoutStatus, { taskTab: 'inbox', showCompleted: false, now: NOW })).toBe(false);
    });

    it('ignora completed/showCompleted (inbox é sobre status, não conclusão)', () => {
      const activity = makeActivity({ status: 'inbox', completed: true });
      expect(matchesTaskTab(activity, { taskTab: 'inbox', showCompleted: false, now: NOW })).toBe(true);
    });
  });
});
