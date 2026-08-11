import React from 'react';
import { Phone, Users, Mail, CheckSquare, Edit2, Building2, Circle } from 'lucide-react';
import { Activity, ActivityStatus, Deal, Company } from '@/types';
import { STATUS_OPTIONS, getPriorityLabel } from '../activityOptions';

interface ActivityKanbanCardProps {
  activity: Activity;
  deal?: Deal;
  company?: Company;
  isDragging: boolean;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onDragEnd: () => void;
  onView: (activity: Activity) => void;
  onEdit: (activity: Activity) => void;
  onChangeStatus: (id: string, status: ActivityStatus) => void;
}

const getActivityIcon = (type: Activity['type']) => {
  switch (type) {
    case 'CALL':
      return <Phone size={14} className="text-blue-500" />;
    case 'MEETING':
      return <Users size={14} className="text-purple-500" />;
    case 'EMAIL':
      return <Mail size={14} className="text-green-500" />;
    default:
      return <CheckSquare size={14} className="text-orange-500" />;
  }
};

/**
 * Card do Kanban de tarefas (Central de Tarefas, Fase 2 antecipada a pedido
 * do fundador em 2026-08-11). Drag-and-drop nativo HTML5 (mesmo padrão do
 * Kanban de negócios, `features/boards/components/Kanban`) move a tarefa
 * entre colunas; o `<select>` de status é a alternativa acessível/sem mouse
 * (mesmo raciocínio do `MoveToStageModal` do Kanban de negócios, só que como
 * um select inline em vez de um modal separado — mais simples e suficiente
 * para esta rodada).
 */
const ActivityKanbanCardComponent: React.FC<ActivityKanbanCardProps> = ({
  activity,
  deal,
  company,
  isDragging,
  onDragStart,
  onDragEnd,
  onView,
  onEdit,
  onChangeStatus,
}) => {
  const isOverdue = new Date(activity.date) < new Date() && !activity.completed;

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, activity.id)}
      onDragEnd={onDragEnd}
      role="button"
      tabIndex={0}
      onClick={() => onView(activity)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onView(activity);
        }
      }}
      className={`group flex flex-col gap-2 p-3 bg-white dark:bg-dark-card border border-slate-200 dark:border-white/10 rounded-xl shadow-sm hover:shadow-md hover:border-primary-500/50 transition-all cursor-pointer ${isDragging ? 'opacity-40' : ''}`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {getActivityIcon(activity.type)}
          {isOverdue && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 bg-red-100 text-red-600 dark:bg-red-500/20 dark:text-red-400 rounded-full">
              ATRASADO
            </span>
          )}
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onEdit(activity);
          }}
          className="p-1 text-slate-400 hover:text-primary-500 hover:bg-primary-50 dark:hover:bg-primary-500/10 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
          title="Editar"
        >
          <Edit2 size={13} />
        </button>
      </div>

      <p className="text-sm font-medium text-slate-900 dark:text-white line-clamp-2">
        {activity.title}
      </p>

      {activity.priority && activity.priority !== 'none' && (
        <span className="self-start px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 font-bold text-[10px]">
          {getPriorityLabel(activity.priority)}
        </span>
      )}

      {(deal || company) && (
        <span className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 truncate">
          {deal ? (
            <>
              <Circle size={7} fill="currentColor" className="flex-shrink-0 text-primary-500" />
              <span className="truncate">{deal.title}</span>
            </>
          ) : (
            <>
              <Building2 size={12} className="flex-shrink-0" />
              <span className="truncate">{company?.name}</span>
            </>
          )}
        </span>
      )}

      <select
        value={activity.status || 'todo'}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => onChangeStatus(activity.id, e.target.value as ActivityStatus)}
        className="mt-1 w-full text-xs bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 text-slate-600 dark:text-slate-300 outline-none focus:ring-2 focus:ring-primary-500"
        aria-label={`Mover "${activity.title}" para outra coluna`}
      >
        {STATUS_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
};

export const ActivityKanbanCard = React.memo(ActivityKanbanCardComponent);
