import React, { useMemo, useState } from 'react';
import { Wallet, Plus, Trash2 } from 'lucide-react';
import { useToast } from '@/context/ToastContext';
import {
  useFinancialCategories,
  useCreateFinancialCategory,
  useDeleteFinancialCategory,
} from '@/lib/query/hooks/useFinancialQuery';
import type { FinancialCategory } from '@/types';

const DEFAULT_COLOR = '#6366F1';

function CategoryColumn({
  title,
  categories,
  onDelete,
  isDeleting,
}: {
  title: string;
  categories: FinancialCategory[];
  onDelete: (category: FinancialCategory) => void;
  isDeleting: boolean;
}) {
  return (
    <div>
      <h4 className="text-xs font-bold uppercase text-slate-500 dark:text-slate-400 mb-2">{title}</h4>
      {categories.length === 0 ? (
        <p className="text-sm text-slate-400 py-2">Nenhuma categoria ainda.</p>
      ) : (
        <div className="space-y-1.5">
          {categories.map(c => (
            <div
              key={c.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50/60 dark:bg-white/3 px-3 py-2"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: c.color }} aria-hidden="true" />
                <span className="text-sm text-slate-900 dark:text-white truncate">{c.name}</span>
              </div>
              <button
                type="button"
                onClick={() => onDelete(c)}
                disabled={isDeleting}
                className="px-1.5 py-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50"
                title="Excluir"
                aria-label={`Excluir categoria ${c.name}`}
              >
                <Trash2 className="h-3.5 w-3.5 text-red-500" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export const FinancialCategoriesManager: React.FC = () => {
  const { addToast } = useToast();
  const { data: categories = [], isLoading } = useFinancialCategories();
  const createCategory = useCreateFinancialCategory();
  const deleteCategory = useDeleteFinancialCategory();

  const [name, setName] = useState('');
  const [type, setType] = useState<'receita' | 'despesa'>('despesa');
  const [color, setColor] = useState(DEFAULT_COLOR);

  const despesaCategories = useMemo(() => categories.filter(c => c.type === 'despesa'), [categories]);
  const receitaCategories = useMemo(() => categories.filter(c => c.type === 'receita'), [categories]);

  const canCreate = name.trim().length > 1;

  const handleCreate = () => {
    if (!canCreate) return;
    createCategory.mutate(
      { name: name.trim(), type, color },
      {
        onSuccess: () => {
          addToast('Categoria criada', 'success');
          setName('');
          setColor(DEFAULT_COLOR);
        },
        onError: () => addToast('Erro ao criar categoria (talvez já exista uma com esse nome)', 'error'),
      }
    );
  };

  const handleDelete = (category: FinancialCategory) => {
    const ok = window.confirm(`Excluir a categoria "${category.name}"? Lançamentos que já usam esse nome não são afetados.`);
    if (!ok) return;
    deleteCategory.mutate(category.id, {
      onSuccess: () => addToast('Categoria excluída', 'success'),
      onError: () => addToast('Erro ao excluir categoria', 'error'),
    });
  };

  return (
    <div className="mb-12">
      <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl p-6">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-1 flex items-center gap-2">
          <Wallet className="h-5 w-5" /> Categorias Financeiras
        </h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
          Lista de categorias sugeridas nos lançamentos e despesas recorrentes do Financeiro.
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-end">
          <div className="lg:col-span-4">
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Nome</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Ex: Hospedagem"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-black/20 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/40"
            />
          </div>
          <div className="lg:col-span-3">
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Tipo</label>
            <select
              value={type}
              onChange={e => setType(e.target.value as 'receita' | 'despesa')}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-black/20 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/40"
            >
              <option value="despesa">Despesa</option>
              <option value="receita">Receita</option>
            </select>
          </div>
          <div className="lg:col-span-2">
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Cor</label>
            <input
              type="color"
              value={color}
              onChange={e => setColor(e.target.value)}
              className="w-full h-[38px] px-1 py-1 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-black/20"
            />
          </div>
          <div className="lg:col-span-3">
            <button
              type="button"
              onClick={handleCreate}
              disabled={createCategory.isPending || !canCreate}
              className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-primary-600 text-white text-sm font-bold hover:bg-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus className="h-4 w-4" />
              Criar categoria
            </button>
          </div>
        </div>

        {isLoading ? (
          <p className="text-sm text-slate-400 mt-6">Carregando...</p>
        ) : (
          <div className="mt-6 border-t border-slate-200 dark:border-white/10 pt-4 grid grid-cols-1 sm:grid-cols-2 gap-6">
            <CategoryColumn title="Despesas" categories={despesaCategories} onDelete={handleDelete} isDeleting={deleteCategory.isPending} />
            <CategoryColumn title="Receitas" categories={receitaCategories} onDelete={handleDelete} isDeleting={deleteCategory.isPending} />
          </div>
        )}
      </div>
    </div>
  );
};

export default FinancialCategoriesManager;
