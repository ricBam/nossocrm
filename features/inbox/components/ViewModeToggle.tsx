import React from 'react';
import { LayoutDashboard, List, Target } from 'lucide-react';
import { ViewMode } from '../hooks/useInboxController';

interface ViewModeToggleProps {
  mode: ViewMode;
  onChange: (mode: ViewMode) => void;
}

/**
 * Componente React `ViewModeToggle`.
 *
 * @param {ViewModeToggleProps} { mode, onChange } - Parâmetro `{ mode, onChange }`.
 * @returns {Element} Retorna um valor do tipo `Element`.
 */
export const ViewModeToggle: React.FC<ViewModeToggleProps> = ({ mode, onChange }) => {
  return (
    <div className="flex w-full sm:w-auto sm:inline-flex items-center bg-slate-100 dark:bg-white/5 rounded-lg p-1 border border-slate-200 dark:border-white/10" role="group" aria-label="Modo de visualização">
      <button
        onClick={() => onChange('overview')}
        aria-label="Visão Geral"
        title="Visão Geral"
        aria-pressed={mode === 'overview'}
        className={`flex flex-1 sm:flex-none justify-center items-center gap-2 px-3 py-2 sm:py-1.5 rounded-md text-sm font-medium transition-all ${mode === 'overview'
            ? 'bg-white dark:bg-dark-card text-slate-900 dark:text-white shadow-sm'
            : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
          }`}
      >
        <LayoutDashboard size={16} aria-hidden="true" />
        <span className="hidden sm:inline">Visão Geral</span>
      </button>
      <button
        onClick={() => onChange('list')}
        aria-label="Lista"
        title="Lista"
        aria-pressed={mode === 'list'}
        className={`flex flex-1 sm:flex-none justify-center items-center gap-2 px-3 py-2 sm:py-1.5 rounded-md text-sm font-medium transition-all ${mode === 'list'
            ? 'bg-white dark:bg-dark-card text-slate-900 dark:text-white shadow-sm'
            : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
          }`}
      >
        <List size={16} aria-hidden="true" />
        <span className="hidden sm:inline">Lista</span>
      </button>
      <button
        onClick={() => onChange('focus')}
        aria-label="Foco"
        title="Foco"
        aria-pressed={mode === 'focus'}
        className={`flex flex-1 sm:flex-none justify-center items-center gap-2 px-3 py-2 sm:py-1.5 rounded-md text-sm font-medium transition-all ${mode === 'focus'
            ? 'bg-white dark:bg-dark-card text-slate-900 dark:text-white shadow-sm'
            : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
          }`}
      >
        <Target size={16} aria-hidden="true" />
        <span className="hidden sm:inline">Foco</span>
      </button>
    </div>
  );
};
