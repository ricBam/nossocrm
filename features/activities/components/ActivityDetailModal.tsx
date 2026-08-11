import React from 'react';
import Link from 'next/link';
import { X, Edit2, Phone, Users, Mail, CheckSquare, Circle, Building2, Calendar } from 'lucide-react';
import { Activity, Contact, Deal, Company } from '@/types';
import {
  useActivityChecklist,
  useToggleChecklistItem,
} from '@/lib/query/hooks/useActivityChecklistQuery';
import { getStatusLabel, getPriorityLabel, getTimeSphereLabel } from '../activityOptions';

interface ActivityDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  onEdit: (activity: Activity) => void;
  activity: Activity | null;
  deal?: Deal;
  contact?: Contact;
  company?: Company;
}

const TYPE_LABELS: Record<Activity['type'], string> = {
  CALL: 'Ligação',
  MEETING: 'Reunião',
  EMAIL: 'Email',
  TASK: 'Tarefa',
  NOTE: 'Nota',
  STATUS_CHANGE: 'Mudança de status',
};

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

/**
 * Checklist só de leitura + toggle (Pedido do fundador, 2026-08-11): marcar
 * um item como feito/pendente direto na visualização não é considerado
 * "editar a atividade" (é ação leve equivalente ao que já existia). Não
 * expõe adicionar/remover/renomear item — isso continua exclusivo do
 * formulário de edição (`ActivityChecklistSection`), acessível pelo lápis.
 */
const ReadOnlyChecklist: React.FC<{ activityId: string }> = ({ activityId }) => {
  const { data: items = [], isLoading } = useActivityChecklist(activityId);
  const toggleItem = useToggleChecklistItem();

  if (isLoading) {
    return <p className="text-xs text-slate-400">Carregando checklist...</p>;
  }

  if (items.length === 0) {
    return <p className="text-xs text-slate-400">Nenhum item de checklist.</p>;
  }

  return (
    <ul className="space-y-1.5">
      {items.map((item) => (
        <li key={item.id} className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={item.isDone}
            onChange={(e) =>
              toggleItem.mutate({ id: item.id, activityId, isDone: e.target.checked })
            }
            className="w-4 h-4 text-primary-600 bg-gray-100 border-gray-300 rounded focus:ring-primary-500 dark:focus:ring-primary-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
          />
          <span
            className={`flex-1 text-sm ${
              item.isDone ? 'line-through text-slate-400' : 'text-slate-700 dark:text-slate-200'
            }`}
          >
            {item.title}
          </span>
        </li>
      ))}
    </ul>
  );
};

/**
 * Visualização somente leitura de uma atividade (Pedido do fundador,
 * 2026-08-11, antes do merge da Central de Tarefas). Clicar numa atividade
 * (lista, blocos, calendário ou Kanban) abre esta view — editar continua
 * exclusivo do ícone de lápis, que chama `onEdit` e fecha esta view.
 * Reaproveita boa parte do layout/estilo visual do `ActivityFormModal`
 * (mesmo overlay/painel) para não introduzir um segundo padrão de modal.
 */
export const ActivityDetailModal: React.FC<ActivityDetailModalProps> = ({
  isOpen,
  onClose,
  onEdit,
  activity,
  deal,
  contact,
  company,
}) => {
  React.useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape, { passive: true });
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen || !activity) return null;

  const date = new Date(activity.date);

  return (
    <div
      className="fixed inset-0 md:left-[var(--app-sidebar-width,0px)] z-[9999] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="bg-white dark:bg-dark-card border border-slate-200 dark:border-white/10 rounded-2xl shadow-2xl w-full max-w-md animate-in zoom-in-95 duration-200 max-h-[calc(100dvh-2rem)] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 border-b border-slate-200 dark:border-white/10 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <span className="p-1.5 bg-slate-100 dark:bg-white/5 rounded-lg">
              {getActivityIcon(activity.type)}
            </span>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white font-display truncate">
              {activity.title}
            </h2>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => onEdit(activity)}
              className="p-2 text-slate-400 hover:text-primary-500 hover:bg-primary-50 dark:hover:bg-primary-500/10 rounded-lg transition-colors"
              title="Editar atividade"
            >
              <Edit2 size={18} />
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-white"
              title="Fechar"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="p-5 space-y-4 overflow-auto pb-[calc(1.25rem+var(--app-safe-area-bottom,0px))]">
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="px-2 py-1 rounded-full bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300 font-medium">
              {TYPE_LABELS[activity.type]}
            </span>
            <span className="px-2 py-1 rounded-full bg-primary-50 dark:bg-primary-500/20 text-primary-700 dark:text-primary-300 font-bold">
              {getStatusLabel(activity.status)}
            </span>
            {activity.priority && activity.priority !== 'none' && (
              <span className="px-2 py-1 rounded-full bg-amber-50 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 font-bold">
                {getPriorityLabel(activity.priority)}
              </span>
            )}
            {getTimeSphereLabel(activity.timeSphere) && (
              <span className="px-2 py-1 rounded-full bg-indigo-50 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 font-bold">
                {getTimeSphereLabel(activity.timeSphere)}
              </span>
            )}
            {activity.completed && (
              <span className="px-2 py-1 rounded-full bg-green-50 dark:bg-green-500/20 text-green-700 dark:text-green-300 font-bold">
                Concluída
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400">
            <Calendar size={14} />
            {date.toLocaleDateString('pt-BR')} às{' '}
            {date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          </div>

          {(deal || contact || company) && (
            <div className="flex flex-col gap-1.5 text-sm">
              {deal && (
                <span className="flex items-center gap-1.5 text-primary-600 dark:text-primary-400 font-medium">
                  <Circle size={8} fill="currentColor" />
                  {deal.title}
                </span>
              )}
              {!deal && contact && (
                <Link
                  href={`/contacts?contactId=${contact.id}`}
                  className="flex items-center gap-1.5 text-primary-600 dark:text-primary-400 font-medium hover:underline"
                >
                  <Users size={14} />
                  {contact.name}
                </Link>
              )}
              {!deal && !contact && company && (
                <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
                  <Building2 size={14} />
                  {company.name}
                </span>
              )}
            </div>
          )}

          {activity.description && (
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                Descrição
              </label>
              <p className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap">
                {activity.description}
              </p>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
              Checklist
            </label>
            <ReadOnlyChecklist activityId={activity.id} />
          </div>
        </div>
      </div>
    </div>
  );
};
