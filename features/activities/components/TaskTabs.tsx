import React from 'react';
import { LayoutList, Sun, Inbox } from 'lucide-react';
import type { TaskTab } from '../hooks/useActivitiesController';

interface TaskTabsProps {
  taskTab: TaskTab;
  setTaskTab: (tab: TaskTab) => void;
  showCompleted: boolean;
  setShowCompleted: (value: boolean) => void;
}

const TABS: { key: TaskTab; label: string; icon: React.ComponentType<{ size?: number }> }[] = [
  { key: 'all', label: 'Todas', icon: LayoutList },
  { key: 'today', label: 'Hoje', icon: Sun },
  { key: 'inbox', label: 'Inbox', icon: Inbox },
];

/**
 * Sub-abas da Central de Tarefas dentro de `/activities` (Fase 1: Todas /
 * Hoje / Inbox). Kanban, Próximos 7 dias, Tríade do Tempo e Dashboard ficam
 * para as Fases 2/3 (ver docs/plano-central-de-tarefas.md).
 */
export const TaskTabs: React.FC<TaskTabsProps> = ({
  taskTab,
  setTaskTab,
  showCompleted,
  setShowCompleted,
}) => {
  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex bg-white dark:bg-dark-card p-1 rounded-lg border border-slate-200 dark:border-white/10">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTaskTab(key)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-all ${
              taskTab === key
                ? 'bg-primary-50 text-primary-600 dark:bg-primary-500/20 dark:text-primary-400'
                : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </div>

      {taskTab === 'all' && (
        <label className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 cursor-pointer">
          <input
            type="checkbox"
            checked={showCompleted}
            onChange={(e) => setShowCompleted(e.target.checked)}
            className="w-4 h-4 text-primary-600 bg-gray-100 border-gray-300 rounded focus:ring-primary-500 dark:focus:ring-primary-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
          />
          Mostrar concluídas
        </label>
      )}
    </div>
  );
};
