import type { Activity } from '@/types';

/** Abas da Central de Tarefas dentro de `/activities` (Fase 1). */
export type TaskTab = 'all' | 'today' | 'inbox';

export interface TaskTabFilterOptions {
  taskTab: TaskTab;
  /** Só relevante para a aba "Todas": inclui atividades concluídas ou não. */
  showCompleted: boolean;
  /** Injetável para testes; default `new Date()`. */
  now?: Date;
}

/**
 * Decide se uma atividade pertence à aba ativa da Central de Tarefas
 * (ver docs/plano-central-de-tarefas.md, seção 3):
 * - "Todas": tudo, exceto concluídas — a menos que `showCompleted` seja true.
 * - "Hoje": due date = hoje OU marcada como foco do dia (`isFocusToday`),
 *   sempre excluindo concluídas.
 * - "Inbox": `status === 'inbox'`.
 */
export function matchesTaskTab(activity: Activity, options: TaskTabFilterOptions): boolean {
  const { taskTab, showCompleted, now = new Date() } = options;

  if (taskTab === 'inbox') {
    return activity.status === 'inbox';
  }

  const isPending = !activity.completed;

  if (taskTab === 'all') {
    return showCompleted || isPending;
  }

  // taskTab === 'today'
  if (!isPending) return false;

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const ts = Date.parse(activity.date);
  const isDueToday = ts >= today.getTime() && ts < tomorrow.getTime();

  return isDueToday || !!activity.isFocusToday;
}
