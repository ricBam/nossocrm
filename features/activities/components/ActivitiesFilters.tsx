import React from 'react';
import { Search, Filter, LayoutList, LayoutGrid } from 'lucide-react';
import { Activity } from '@/types';
import type { ListLayout } from './ActivitiesList';

interface ActivitiesFiltersProps {
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  filterType: Activity['type'] | 'ALL';
  setFilterType: (type: Activity['type'] | 'ALL') => void;
  /**
   * Toggle Lista/Blocos (Pedido do fundador, 2026-08-11) — formato de
   * renderização dentro da própria visão Lista, não uma visão nova. `undefined`
   * omite o toggle (ex: quando o componente for usado fora do contexto que
   * suporta os dois formatos).
   */
  listLayout?: ListLayout;
  setListLayout?: (layout: ListLayout) => void;
}

/**
 * Componente React `ActivitiesFilters`.
 *
 * @param {ActivitiesFiltersProps} {
  searchTerm,
  setSearchTerm,
  filterType,
  setFilterType,
} - Parâmetro `{
  searchTerm,
  setSearchTerm,
  filterType,
  setFilterType,
}`.
 * @returns {Element} Retorna um valor do tipo `Element`.
 */
export const ActivitiesFilters: React.FC<ActivitiesFiltersProps> = ({
  searchTerm,
  setSearchTerm,
  filterType,
  setFilterType,
  listLayout,
  setListLayout,
}) => {
  return (
    <div className="flex gap-4 mb-6">
      <div className="flex-1 relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
        <input
          type="text"
          placeholder="Buscar atividades..."
          className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-dark-card border border-slate-200 dark:border-white/10 rounded-xl outline-none focus:ring-2 focus:ring-primary-500 text-slate-900 dark:text-white"
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
        />
      </div>
      <div className="flex items-center gap-2">
        <Filter size={20} className="text-slate-400" />
        <select
          className="bg-white dark:bg-dark-card border border-slate-200 dark:border-white/10 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-primary-500 text-slate-900 dark:text-white"
          value={filterType}
          onChange={e => setFilterType(e.target.value as Activity['type'] | 'ALL')}
        >
          <option value="ALL">Todos os tipos</option>
          <option value="CALL">Ligações</option>
          <option value="MEETING">Reuniões</option>
          <option value="EMAIL">Emails</option>
          <option value="TASK">Tarefas</option>
        </select>
      </div>
      {listLayout && setListLayout && (
        <div className="flex bg-white dark:bg-dark-card p-1 rounded-lg border border-slate-200 dark:border-white/10">
          <button
            type="button"
            onClick={() => setListLayout('rows')}
            title="Lista"
            className={`p-2 rounded-md transition-all ${
              listLayout === 'rows'
                ? 'bg-primary-50 text-primary-600 dark:bg-primary-500/20 dark:text-primary-400'
                : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
            }`}
          >
            <LayoutList size={20} />
          </button>
          <button
            type="button"
            onClick={() => setListLayout('blocks')}
            title="Blocos"
            className={`p-2 rounded-md transition-all ${
              listLayout === 'blocks'
                ? 'bg-primary-50 text-primary-600 dark:bg-primary-500/20 dark:text-primary-400'
                : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
            }`}
          >
            <LayoutGrid size={20} />
          </button>
        </div>
      )}
    </div>
  );
};
