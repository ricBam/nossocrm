import React from 'react';
import { Phone, Users, Mail, CheckSquare, Clock, Trash2, Edit2, CheckCircle2, Building2, Circle } from 'lucide-react';
import { Activity, Deal, Contact, Company } from '@/types';
import { getPriorityLabel, getStatusLabel } from '../activityOptions';

interface ActivityCardProps {
  activity: Activity;
  deal?: Deal;
  contact?: Contact;
  company?: Company;
  onToggleComplete: (id: string) => void;
  onEdit: (activity: Activity) => void;
  onDelete: (id: string) => void;
  onView: (activity: Activity) => void;
}

const getActivityIcon = (type: Activity['type']) => {
  switch (type) {
    case 'CALL':
      return <Phone size={16} className="text-blue-500" />;
    case 'MEETING':
      return <Users size={16} className="text-purple-500" />;
    case 'EMAIL':
      return <Mail size={16} className="text-green-500" />;
    default:
      return <CheckSquare size={16} className="text-orange-500" />;
  }
};

const formatRelativeTime = (dateString: string) => {
  const date = new Date(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) return 'agora mesmo';
  if (diffInSeconds < 3600) return `há ${Math.floor(diffInSeconds / 60)} min`;
  if (diffInSeconds < 86400) return `há ${Math.floor(diffInSeconds / 3600)} h`;
  if (diffInSeconds < 172800) return 'ontem';
  return date.toLocaleDateString('pt-BR');
};

/**
 * Card de atividade usada pelo formato "Blocos" da visão Lista (Pedido do
 * fundador, 2026-08-11) — mesmo dado/filtro de `ActivityRow`, só em grade em
 * vez de linhas. Não é uma visão nova: é um formato dentro da própria Lista
 * (não agrupa por status, ao contrário do Kanban).
 */
const ActivityCardComponent: React.FC<ActivityCardProps> = ({
  activity,
  deal,
  contact,
  company,
  onToggleComplete,
  onEdit,
  onDelete,
  onView,
}) => {
  const isOverdue = new Date(activity.date) < new Date() && !activity.completed;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onView(activity)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onView(activity);
        }
      }}
      className={`group flex flex-col gap-3 p-4 bg-white dark:bg-dark-card border border-slate-200 dark:border-white/5 rounded-xl hover:border-primary-500/50 dark:hover:border-primary-500/50 transition-all cursor-pointer ${activity.completed ? 'opacity-60' : ''}`}
    >
      <div className="flex items-center justify-between">
        <span className="p-1.5 bg-slate-100 dark:bg-white/5 rounded-lg">
          {getActivityIcon(activity.type)}
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleComplete(activity.id);
          }}
          className={`flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${activity.completed
            ? 'bg-green-500 border-green-500 text-white'
            : 'border-slate-300 dark:border-slate-600 hover:border-green-500 text-transparent hover:text-green-500'
            }`}
        >
          <CheckCircle2 size={14} fill="currentColor" />
        </button>
      </div>

      <h3
        className={`font-medium text-slate-900 dark:text-white line-clamp-2 ${activity.completed ? 'line-through text-slate-500' : ''}`}
      >
        {activity.title}
      </h3>

      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className="px-2 py-0.5 rounded-full bg-primary-50 dark:bg-primary-500/20 text-primary-700 dark:text-primary-300 font-bold">
          {getStatusLabel(activity.status)}
        </span>
        {activity.priority && activity.priority !== 'none' && (
          <span className="px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 font-bold">
            {getPriorityLabel(activity.priority)}
          </span>
        )}
        {isOverdue && (
          <span className="px-2 py-0.5 bg-red-100 text-red-600 dark:bg-red-500/20 dark:text-red-400 rounded-full font-bold">
            ATRASADO
          </span>
        )}
      </div>

      <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 min-h-[20px]">
        {deal && (
          <span className="flex items-center gap-1.5 text-primary-600 dark:text-primary-400 font-medium truncate">
            <Circle size={8} fill="currentColor" className="flex-shrink-0" />
            <span className="truncate">{deal.title}</span>
          </span>
        )}
        {!deal && company && (
          <span className="flex items-center gap-1.5 truncate">
            <Building2 size={14} className="flex-shrink-0" />
            <span className="truncate">{company.name}</span>
          </span>
        )}
      </div>

      <div className="flex items-center justify-between mt-1 pt-3 border-t border-slate-100 dark:border-white/5">
        <span className="flex items-center gap-1.5 text-xs text-slate-400">
          <Clock size={12} />
          {formatRelativeTime(activity.date)}
        </span>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEdit(activity);
            }}
            className="p-1.5 text-slate-400 hover:text-primary-500 hover:bg-primary-50 dark:hover:bg-primary-500/10 rounded-lg transition-colors"
            title="Editar"
          >
            <Edit2 size={14} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(activity.id);
            }}
            className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors"
            title="Excluir"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </div>
  );
};

export const ActivityCard = React.memo(ActivityCardComponent);
