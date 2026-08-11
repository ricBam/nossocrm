import React, { useMemo, useState } from 'react';
import { Activity, ActivityStatus, Deal, Company } from '@/types';
import { ActivityKanbanCard } from './ActivityKanbanCard';
import { KANBAN_COLUMNS } from '../activityOptions';

interface ActivitiesKanbanProps {
  activities: Activity[];
  deals: Deal[];
  companies: Company[];
  onView: (activity: Activity) => void;
  onEdit: (activity: Activity) => void;
  onChangeStatus: (id: string, status: ActivityStatus) => void;
}

/**
 * Visão Kanban por status (Inbox/A Fazer/Em Andamento/Concluído) — Pedido do
 * fundador em 2026-08-11, antecipando a Fase 2 do plano
 * (`docs/plano-central-de-tarefas.md`, seção 5). Recebe `activities` já sem
 * as entradas `STATUS_CHANGE` (log automático de mudança de estágio do
 * negócio) e sem o filtro de aba/concluídas da Lista — o Kanban precisa
 * mostrar TODAS as tarefas reais, incluindo as concluídas (coluna
 * "Concluído"), então usa uma fonte de dados própria
 * (`kanbanActivities` em `useActivitiesController`) em vez de
 * `filteredActivities`.
 *
 * Drag-and-drop nativo HTML5 (mesmo padrão do Kanban de negócios,
 * `features/boards/components/Kanban/KanbanBoard.tsx`, sem `@dnd-kit`) move
 * a tarefa entre colunas; cada card também tem um `<select>` de status como
 * alternativa mais simples e acessível (dispensa mouse/drag), já que o
 * fundador sinalizou que drag-and-drop é desejável mas não obrigatório
 * nesta rodada se o tempo for curto.
 */
export const ActivitiesKanban: React.FC<ActivitiesKanbanProps> = ({
  activities,
  deals,
  companies,
  onView,
  onEdit,
  onChangeStatus,
}) => {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<ActivityStatus | null>(null);

  const dealById = useMemo(() => new Map(deals.map((d) => [d.id, d])), [deals]);
  const companyById = useMemo(() => new Map(companies.map((c) => [c.id, c])), [companies]);

  const activitiesByStatus = useMemo(() => {
    const map = new Map<ActivityStatus, Activity[]>();
    for (const activity of activities) {
      const status: ActivityStatus = activity.status || 'todo';
      const list = map.get(status);
      if (list) list.push(activity);
      else map.set(status, [activity]);
    }
    return map;
  }, [activities]);

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggingId(id);
    e.dataTransfer.setData('activityId', id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragEnd = () => {
    setDraggingId(null);
    setDragOverColumn(null);
  };

  const handleDrop = (e: React.DragEvent, status: ActivityStatus) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('activityId') || draggingId;
    if (id) onChangeStatus(id, status);
    setDraggingId(null);
    setDragOverColumn(null);
  };

  return (
    <div
      role="list"
      aria-label="Colunas da Central de Tarefas"
      // min-h (não h-full): esta visão vive dentro do container com padding
      // de `ActivitiesPage` (`p-8 max-w-400 mx-auto`), sem altura de viewport
      // reservada como a página de negócios (`PipelineView`, `h-full`) tem —
      // `h-full` aqui colapsaria para 0px sem um ancestral com altura fixa.
      className="flex gap-4 min-h-[70vh] overflow-x-auto pb-2 w-full"
    >
      {KANBAN_COLUMNS.map((column) => {
        const columnActivities = activitiesByStatus.get(column.key) ?? [];
        const isOver = dragOverColumn === column.key && draggingId !== null;

        return (
          <div
            key={column.key}
            role="listitem"
            aria-label={`Coluna ${column.label}: ${columnActivities.length} atividade${columnActivities.length !== 1 ? 's' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              setDragOverColumn(column.key);
            }}
            onDragEnter={() => setDragOverColumn(column.key)}
            onDragLeave={() => setDragOverColumn(null)}
            onDrop={(e) => handleDrop(e, column.key)}
            className={`min-w-[18rem] flex-1 flex flex-col rounded-xl border-2 transition-all duration-200 ${
              isOver
                ? 'border-primary-500 bg-primary-50/20 dark:bg-primary-500/10 scale-[1.01]'
                : 'border-slate-200/50 dark:border-white/10'
            }`}
          >
            <div className="p-3 border-b border-slate-200 dark:border-white/5 bg-slate-50/50 dark:bg-white/5 rounded-t-xl flex justify-between items-center">
              <span className="font-bold text-slate-700 dark:text-slate-200 font-display text-sm tracking-wide uppercase">
                {column.label}
              </span>
              <span className="text-xs font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2 py-0.5 rounded text-slate-600 dark:text-slate-300">
                {columnActivities.length}
              </span>
            </div>

            <div className="flex-1 p-2 overflow-y-auto space-y-2 bg-slate-100/50 dark:bg-black/20 rounded-b-xl min-h-[200px]">
              {columnActivities.length === 0 && !isOver && (
                <p className="text-xs text-slate-400 dark:text-slate-600 text-center py-8">
                  Nenhuma tarefa aqui.
                </p>
              )}
              {columnActivities.map((activity) => (
                <ActivityKanbanCard
                  key={activity.id}
                  activity={activity}
                  deal={activity.dealId ? dealById.get(activity.dealId) : undefined}
                  company={activity.clientCompanyId ? companyById.get(activity.clientCompanyId) : undefined}
                  isDragging={draggingId === activity.id}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                  onView={onView}
                  onEdit={onEdit}
                  onChangeStatus={onChangeStatus}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};
