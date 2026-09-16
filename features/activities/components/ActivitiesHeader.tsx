import React from 'react';
import { Plus, LayoutList, Calendar as CalendarIcon, Kanban, X } from 'lucide-react';
import type { ViewMode } from '../hooks/useActivitiesController';

interface ActivitiesHeaderProps {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  onNewActivity: () => void;
  dateFilter?: 'ALL' | 'overdue' | 'today' | 'upcoming';
  /**
   * Limpa o `dateFilter` (deep-link `?filter=` vindo do módulo de Inbox).
   * Opcional só por compatibilidade com testes existentes que não passam
   * a prop — quando ausente, o badge não mostra o botão de fechar.
   */
  onClearDateFilter?: () => void;
}

/**
 * Componente React `ActivitiesHeader`.
 *
 * @param {ActivitiesHeaderProps} {
  viewMode,
  setViewMode,
  onNewActivity,
  dateFilter = 'ALL',
} - Parâmetro `{
  viewMode,
  setViewMode,
  onNewActivity,
  dateFilter = 'ALL',
}`.
 * @returns {Element} Retorna um valor do tipo `Element`.
 */
export const ActivitiesHeader: React.FC<ActivitiesHeaderProps> = ({
  viewMode,
  setViewMode,
  onNewActivity,
  dateFilter = 'ALL',
  onClearDateFilter,
}) => {
  const filterLabel =
    dateFilter === 'overdue'
      ? 'Atrasados'
      : dateFilter === 'today'
        ? 'Hoje'
        : dateFilter === 'upcoming'
          ? 'Próximos'
          : null;

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-center mb-4 md:mb-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white font-display">
          Atividades
        </h1>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <p className="text-sm sm:text-base text-slate-500 dark:text-slate-400">Gerencie suas tarefas e compromissos</p>
          {filterLabel && (
            <span className="inline-flex items-center gap-1 text-xs font-medium pl-2 pr-1 py-0.5 rounded-full bg-primary-100 text-primary-700 dark:bg-primary-500/20 dark:text-primary-300">
              Filtro: {filterLabel}
              {onClearDateFilter && (
                <button
                  type="button"
                  onClick={onClearDateFilter}
                  aria-label="Limpar filtro"
                  title="Limpar filtro"
                  className="rounded-full p-1.5 -m-1 sm:p-0.5 sm:m-0 hover:bg-primary-200 dark:hover:bg-primary-500/40 transition-colors"
                >
                  <X size={12} />
                </button>
              )}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 sm:justify-start">
        <div className="flex bg-white dark:bg-dark-card p-1 rounded-lg border border-slate-200 dark:border-white/10">
          <button
            onClick={() => setViewMode('list')}
            title="Lista"
            aria-label="Visualizar em lista"
            aria-pressed={viewMode === 'list'}
            className={`p-2 rounded-md transition-all ${
              viewMode === 'list'
                ? 'bg-primary-50 text-primary-600 dark:bg-primary-500/20 dark:text-primary-400'
                : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
            }`}
          >
            <LayoutList size={20} />
          </button>
          <button
            onClick={() => setViewMode('calendar')}
            title="Calendário"
            aria-label="Visualizar calendário"
            aria-pressed={viewMode === 'calendar'}
            className={`p-2 rounded-md transition-all ${
              viewMode === 'calendar'
                ? 'bg-primary-50 text-primary-600 dark:bg-primary-500/20 dark:text-primary-400'
                : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
            }`}
          >
            <CalendarIcon size={20} />
          </button>
          <button
            onClick={() => setViewMode('kanban')}
            aria-label="Visualizar kanban"
            aria-pressed={viewMode === 'kanban'}
            title="Kanban"
            className={`p-2 rounded-md transition-all ${
              viewMode === 'kanban'
                ? 'bg-primary-50 text-primary-600 dark:bg-primary-500/20 dark:text-primary-400'
                : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
            }`}
          >
            <Kanban size={20} />
          </button>
        </div>
        <button
          onClick={onNewActivity}
          className="flex items-center gap-2 whitespace-nowrap bg-primary-600 hover:bg-primary-500 text-white px-3 sm:px-4 py-2.5 rounded-lg text-sm sm:text-base font-medium transition-colors shadow-lg shadow-primary-600/20"
        >
          <Plus size={20} />
          Nova Atividade
        </button>
      </div>
    </div>
  );
};
