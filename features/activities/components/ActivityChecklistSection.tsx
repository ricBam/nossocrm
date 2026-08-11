import React, { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import {
  useActivityChecklist,
  useCreateChecklistItem,
  useToggleChecklistItem,
  useDeleteChecklistItem,
} from '@/lib/query/hooks/useActivityChecklistQuery';

interface ActivityChecklistSectionProps {
  activityId: string;
}

/**
 * Checklist simples de uma atividade (Central de Tarefas, Fase 1 — CRUD
 * sem reorder ainda, ver docs/plano-central-de-tarefas.md seção 5).
 * Só é renderizado quando a atividade já existe (tem um ID real salvo no
 * banco) — para atividade nova ainda não salva, o item de checklist não
 * teria a quem se referir via `activity_id`.
 */
export const ActivityChecklistSection: React.FC<ActivityChecklistSectionProps> = ({
  activityId,
}) => {
  const { data: items = [], isLoading } = useActivityChecklist(activityId);
  const createItem = useCreateChecklistItem();
  const toggleItem = useToggleChecklistItem();
  const deleteItem = useDeleteChecklistItem();

  const [newTitle, setNewTitle] = useState('');

  const submitNewItem = () => {
    const title = newTitle.trim();
    if (!title) return;
    createItem.mutate({ activityId, title });
    setNewTitle('');
  };

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    submitNewItem();
  };

  return (
    <div>
      <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Checklist</label>

      {isLoading ? (
        <p className="text-xs text-slate-400">Carregando checklist...</p>
      ) : (
        <ul className="space-y-1.5 mb-2">
          {items.map(item => (
            <li key={item.id} className="flex items-center gap-2 group">
              <input
                type="checkbox"
                checked={item.isDone}
                onChange={e => toggleItem.mutate({ id: item.id, activityId, isDone: e.target.checked })}
                className="w-4 h-4 text-primary-600 bg-gray-100 border-gray-300 rounded focus:ring-primary-500 dark:focus:ring-primary-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
              />
              <span
                className={`flex-1 text-sm ${
                  item.isDone ? 'line-through text-slate-400' : 'text-slate-700 dark:text-slate-200'
                }`}
              >
                {item.title}
              </span>
              <button
                type="button"
                onClick={() => deleteItem.mutate({ id: item.id, activityId })}
                className="p-1 text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                title="Remover item"
              >
                <Trash2 size={14} />
              </button>
            </li>
          ))}
          {items.length === 0 && (
            <li className="text-xs text-slate-400">Nenhum item ainda.</li>
          )}
        </ul>
      )}

      <div className="flex gap-2">
        <input
          type="text"
          placeholder="Adicionar item..."
          value={newTitle}
          onChange={e => setNewTitle(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault();
              submitNewItem();
            }
          }}
          className="flex-1 bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-primary-500"
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={!newTitle.trim()}
          className="px-3 py-2 bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300 rounded-lg hover:bg-slate-200 dark:hover:bg-white/20 disabled:opacity-50 transition-colors"
          title="Adicionar item"
        >
          <Plus size={16} />
        </button>
      </div>
    </div>
  );
};
