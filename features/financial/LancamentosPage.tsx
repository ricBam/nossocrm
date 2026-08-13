'use client';

import React from 'react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import {
  useFinancialLedger,
  useCreateFinancialTransaction,
  useDeleteFinancialTransaction,
  useRecurringExpenses,
  useCreateRecurringExpense,
  useUpdateRecurringExpense,
  useDeleteRecurringExpense,
} from '@/lib/query/hooks/useFinancialQuery';
import { StatCard } from '@/features/dashboard/components/StatCard';
import { PeriodFilterSelect } from '@/components/filters/PeriodFilterSelect';
import { PeriodFilter } from '@/features/dashboard/hooks/useDashboardMetrics';
import { periodToDateRange } from '@/lib/utils/periodToDateRange';
import { formatBRL, formatDateBR } from '@/lib/utils/formatCurrency';
import { Plus, Trash2, Lock, TrendingUp, TrendingDown, Wallet } from 'lucide-react';
import { TransactionModal } from './components/TransactionModal';
import { RecurringExpenseModal } from './components/RecurringExpenseModal';
import { FinancialSubNav } from './components/FinancialSubNav';

const ALL_CATEGORIES_VALUE = '__all__';

const LancamentosPage: React.FC = () => {
  const { profile, loading: authLoading } = useAuth();
  const { addToast } = useToast();
  const [period, setPeriod] = React.useState<PeriodFilter>('this_month');
  const [categoryFilter, setCategoryFilter] = React.useState(ALL_CATEGORIES_VALUE);
  const [isTransactionModalOpen, setIsTransactionModalOpen] = React.useState(false);
  const [isRecurringModalOpen, setIsRecurringModalOpen] = React.useState(false);

  const range = React.useMemo(() => periodToDateRange(period), [period]);
  const { data: entries = [], isLoading } = useFinancialLedger(range.start, range.end);
  const { data: recurring = [] } = useRecurringExpenses();

  const createTransaction = useCreateFinancialTransaction();
  const deleteTransaction = useDeleteFinancialTransaction();
  const createRecurring = useCreateRecurringExpense();
  const updateRecurring = useUpdateRecurringExpense();
  const deleteRecurring = useDeleteRecurringExpense();

  const availableCategories = React.useMemo(
    () => Array.from(new Set(entries.map(e => e.category))).sort(),
    [entries]
  );

  const filteredEntries = React.useMemo(
    () => (categoryFilter === ALL_CATEGORIES_VALUE ? entries : entries.filter(e => e.category === categoryFilter)),
    [entries, categoryFilter]
  );

  const receita = React.useMemo(() => entries.filter(e => e.type === 'receita').reduce((acc, e) => acc + e.amount, 0), [entries]);
  const despesa = React.useMemo(() => entries.filter(e => e.type === 'despesa').reduce((acc, e) => acc + e.amount, 0), [entries]);
  const saldo = receita - despesa;

  React.useEffect(() => {
    if (categoryFilter !== ALL_CATEGORIES_VALUE && !availableCategories.includes(categoryFilter)) {
      setCategoryFilter(ALL_CATEGORIES_VALUE);
    }
  }, [availableCategories, categoryFilter]);

  if (!authLoading && profile?.role !== 'admin') {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center gap-3">
        <Lock size={32} className="text-slate-400" aria-hidden="true" />
        <h1 className="text-xl font-bold text-slate-900 dark:text-white font-display">Acesso restrito</h1>
      </div>
    );
  }

  const handleCreateTransaction = (data: Parameters<typeof createTransaction.mutate>[0]) => {
    createTransaction.mutate(data, {
      onSuccess: () => {
        addToast('Lançamento criado', 'success');
        setIsTransactionModalOpen(false);
      },
      onError: () => addToast('Erro ao criar lançamento', 'error'),
    });
  };

  const handleDeleteTransaction = (sourceId: string, source: string) => {
    if (source === 'deal') return; // linhas vindas de deals não são editáveis aqui
    if (!window.confirm('Excluir este lançamento?')) return;
    deleteTransaction.mutate(sourceId, {
      onSuccess: () => addToast('Lançamento excluído', 'success'),
      onError: () => addToast('Erro ao excluir lançamento', 'error'),
    });
  };

  const handleCreateRecurring = (data: Parameters<typeof createRecurring.mutate>[0]) => {
    createRecurring.mutate(data, {
      onSuccess: () => {
        addToast('Despesa recorrente criada', 'success');
        setIsRecurringModalOpen(false);
      },
      onError: () => addToast('Erro ao criar despesa recorrente', 'error'),
    });
  };

  const handleToggleRecurring = (id: string, active: boolean) => {
    updateRecurring.mutate({ id, updates: { active: !active } }, {
      onError: () => addToast('Erro ao atualizar despesa recorrente', 'error'),
    });
  };

  const handleDeleteRecurring = (id: string, name: string) => {
    if (!window.confirm(`Excluir a despesa recorrente "${name}"? Ocorrências já lançadas no histórico não são apagadas.`)) return;
    deleteRecurring.mutate(id, {
      onSuccess: () => addToast('Despesa recorrente excluída', 'success'),
      onError: () => addToast('Erro ao excluir despesa recorrente', 'error'),
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white font-display tracking-tight">Lançamentos</h1>
        <div className="flex items-center gap-3">
          <PeriodFilterSelect value={period} onChange={setPeriod} />
          <button
            onClick={() => setIsTransactionModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white text-sm font-bold rounded-lg"
          >
            <Plus size={16} /> Novo lançamento
          </button>
        </div>
      </div>

      <FinancialSubNav />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard title="Receita" value={formatBRL(receita)} subtext={`${entries.filter(e => e.type === 'receita').length} lançamento(s)`} subtextPositive icon={TrendingUp} variant="success" comparisonLabel="no período" />
        <StatCard title="Despesa" value={formatBRL(despesa)} subtext={`${entries.filter(e => e.type === 'despesa').length} lançamento(s)`} subtextPositive icon={TrendingDown} variant="danger" comparisonLabel="no período" />
        <StatCard title="Saldo" value={formatBRL(saldo)} subtext={`${entries.length} total`} subtextPositive={saldo >= 0} icon={Wallet} variant="primary" comparisonLabel="no período" />
      </div>

      <div className="glass rounded-xl border border-slate-200 dark:border-white/5 shadow-sm overflow-hidden">
        <div className="p-3 border-b border-slate-100 dark:border-white/5 flex justify-end">
          <select
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}
            aria-label="Filtrar por categoria"
            className="px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value={ALL_CATEGORIES_VALUE}>Todas as categorias</option>
            {availableCategories.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-white/5 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-5 py-3">Data</th>
              <th className="px-5 py-3">Descrição</th>
              <th className="px-5 py-3">Categoria</th>
              <th className="px-5 py-3 text-right">Valor</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-white/5">
            {isLoading && <tr><td colSpan={5} className="px-5 py-4 text-slate-400">Carregando...</td></tr>}
            {!isLoading && filteredEntries.length === 0 && <tr><td colSpan={5} className="px-5 py-4 text-slate-400">Nenhum lançamento no período.</td></tr>}
            {filteredEntries.map(entry => (
              <tr key={`${entry.source}-${entry.sourceId}`}>
                <td className="px-5 py-3">{formatDateBR(entry.date)}</td>
                <td className="px-5 py-3">{entry.description}</td>
                <td className="px-5 py-3">{entry.category}</td>
                <td className={`px-5 py-3 text-right font-bold ${entry.type === 'receita' ? 'text-success-text' : 'text-error-text'}`}>
                  {entry.type === 'receita' ? '+' : '-'}{formatBRL(entry.amount)}
                </td>
                <td className="px-5 py-3 text-right">
                  {entry.source !== 'deal' && (
                    <button onClick={() => handleDeleteTransaction(entry.sourceId, entry.source)} className="text-slate-400 hover:text-error-text" aria-label="Excluir lançamento">
                      <Trash2 size={16} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="glass rounded-xl border border-slate-200 dark:border-white/5 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 dark:border-white/5 flex justify-between items-center">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white font-display">Despesas recorrentes</h2>
          <button onClick={() => setIsRecurringModalOpen(true)} className="flex items-center gap-2 px-3 py-1.5 text-sm font-bold text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-lg">
            <Plus size={14} /> Nova
          </button>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-white/5">
          {recurring.length === 0 && <p className="p-5 text-sm text-slate-400">Nenhuma despesa recorrente cadastrada.</p>}
          {recurring.map(r => (
            <div key={r.id} className="flex items-center justify-between px-5 py-3">
              <div>
                <p className="text-sm font-medium text-slate-900 dark:text-white">{r.name}</p>
                <p className="text-xs text-slate-500">{r.category} · todo dia {r.dayOfMonth} · {formatBRL(r.amount)}</p>
              </div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={r.active} onChange={() => handleToggleRecurring(r.id, r.active)} />
                  Ativa
                </label>
                <button onClick={() => handleDeleteRecurring(r.id, r.name)} className="text-slate-400 hover:text-error-text" aria-label={`Excluir despesa recorrente ${r.name}`}>
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <TransactionModal
        isOpen={isTransactionModalOpen}
        onClose={() => setIsTransactionModalOpen(false)}
        onSubmit={handleCreateTransaction}
        isSubmitting={createTransaction.isPending}
      />
      <RecurringExpenseModal
        isOpen={isRecurringModalOpen}
        onClose={() => setIsRecurringModalOpen(false)}
        onSubmit={handleCreateRecurring}
        isSubmitting={createRecurring.isPending}
      />
    </div>
  );
};

export default LancamentosPage;
