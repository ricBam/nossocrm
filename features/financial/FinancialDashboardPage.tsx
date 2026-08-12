'use client';

import React from 'react';
import { useAuth } from '@/context/AuthContext';
import { useFinancialLedger, useFinancialBuckets } from '@/lib/query/hooks/useFinancialQuery';
import { StatCard } from '@/features/dashboard/components/StatCard';
import { PeriodFilterSelect } from '@/components/filters/PeriodFilterSelect';
import { ChartWrapper } from '@/components/charts';
import { PeriodFilter, COMPARISON_LABELS } from '@/features/dashboard/hooks/useDashboardMetrics';
import { periodToDateRange } from '@/lib/utils/periodToDateRange';
import { previousPeriodRange, calculatePercentChange } from '@/lib/utils/financialPeriod';
import { formatBRL } from '@/lib/utils/formatCurrency';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { TrendingUp, TrendingDown, Wallet, PiggyBank, Lock } from 'lucide-react';
import { RevenueExpenseChart } from './components/RevenueExpenseChart';
import { ExpenseByCategoryChart } from './components/ExpenseByCategoryChart';
import type { FinancialLedgerEntry } from '@/types';

function formatChange(value: number): { text: string; isPositive: boolean } {
  const isPositive = value >= 0;
  const sign = isPositive ? '+' : '';
  return { text: `${sign}${value.toFixed(1)}%`, isPositive };
}

function sumByType(entries: FinancialLedgerEntry[], type: 'receita' | 'despesa'): number {
  return entries.filter(e => e.type === type).reduce((acc, e) => acc + e.amount, 0);
}

function groupByMonth(entries: FinancialLedgerEntry[]): { month: string; receita: number; despesa: number }[] {
  const byMonth = new Map<string, { receita: number; despesa: number }>();
  for (const e of entries) {
    const key = e.date.slice(0, 7); // YYYY-MM
    const bucket = byMonth.get(key) ?? { receita: 0, despesa: 0 };
    if (e.type === 'receita') bucket.receita += e.amount;
    else bucket.despesa += e.amount;
    byMonth.set(key, bucket);
  }
  return Array.from(byMonth.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, totals]) => ({ month, ...totals }));
}

function groupExpensesByCategory(entries: FinancialLedgerEntry[]): { category: string; total: number }[] {
  const byCategory = new Map<string, number>();
  for (const e of entries) {
    if (e.type !== 'despesa') continue;
    byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + e.amount);
  }
  return Array.from(byCategory.entries()).map(([category, total]) => ({ category, total }));
}

const FinancialDashboardPage: React.FC = () => {
  const { profile, loading: authLoading } = useAuth();
  const [period, setPeriod] = React.useState<PeriodFilter>('this_month');

  const range = React.useMemo(() => periodToDateRange(period), [period]);
  const previousRange = React.useMemo(() => previousPeriodRange(range), [range]);

  const { data: entries = [], isLoading } = useFinancialLedger(range.start, range.end);
  const { data: previousEntries = [] } = useFinancialLedger(previousRange.start, previousRange.end);
  const { data: buckets = [] } = useFinancialBuckets();

  const monthlyData = React.useMemo(() => groupByMonth(entries), [entries]);
  const categoryData = React.useMemo(() => groupExpensesByCategory(entries), [entries]);
  const latestEntries = React.useMemo(() => entries.slice(0, 5), [entries]);

  if (!authLoading && profile?.role !== 'admin') {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center gap-3">
        <Lock size={32} className="text-slate-400" aria-hidden="true" />
        <h1 className="text-xl font-bold text-slate-900 dark:text-white font-display">Acesso restrito</h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm max-w-sm">
          A área Financeiro é visível apenas para administradores da organização.
        </p>
      </div>
    );
  }

  const receita = sumByType(entries, 'receita');
  const despesa = sumByType(entries, 'despesa');
  const receitaAnterior = sumByType(previousEntries, 'receita');
  const despesaAnterior = sumByType(previousEntries, 'despesa');
  const saldoTotal = receita - despesa;
  const saldoAnterior = receitaAnterior - despesaAnterior;
  const saldoEmCofrinhos = buckets.reduce((acc, b) => acc + b.balance, 0);
  const saldoLivre = saldoTotal - saldoEmCofrinhos;

  const revenueChange = formatChange(calculatePercentChange(receita, receitaAnterior));
  const expenseChange = formatChange(calculatePercentChange(despesa, despesaAnterior));
  const balanceChange = formatChange(calculatePercentChange(saldoTotal, saldoAnterior));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white font-display tracking-tight">Financeiro</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Receita, despesa e saldo da empresa.</p>
        </div>
        <PeriodFilterSelect value={period} onChange={setPeriod} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard title="Receita" value={formatBRL(receita)} subtext={revenueChange.text} subtextPositive={revenueChange.isPositive} icon={TrendingUp} variant="success" comparisonLabel={COMPARISON_LABELS[period]} />
        <StatCard title="Despesa" value={formatBRL(despesa)} subtext={expenseChange.text} subtextPositive={!expenseChange.isPositive} icon={TrendingDown} variant="danger" comparisonLabel={COMPARISON_LABELS[period]} />
        <StatCard title="Saldo total" value={formatBRL(saldoTotal)} subtext={balanceChange.text} subtextPositive={balanceChange.isPositive} icon={Wallet} variant="primary" comparisonLabel={COMPARISON_LABELS[period]} />
        <StatCard title="Saldo livre" value={formatBRL(saldoLivre)} subtext={`${buckets.length} cofrinho(s)`} subtextPositive icon={Wallet} variant="info" comparisonLabel="não alocado em cofrinhos" />
        <StatCard title="Em cofrinhos" value={formatBRL(saldoEmCofrinhos)} subtext={`${buckets.length} cofrinho(s)`} subtextPositive icon={PiggyBank} variant="purple" comparisonLabel="reservado" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 glass p-5 rounded-xl border border-slate-200 dark:border-white/5 shadow-sm flex flex-col h-80">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white font-display mb-2 shrink-0">Receita × Despesa</h2>
          <div className="flex-1 min-h-0">
            <ChartWrapper height="100%">
              <RevenueExpenseChart data={monthlyData} />
            </ChartWrapper>
          </div>
        </div>
        <div className="glass p-5 rounded-xl border border-slate-200 dark:border-white/5 shadow-sm flex flex-col h-80">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white font-display mb-2 shrink-0">Despesas por categoria</h2>
          <div className="flex-1 min-h-0">
            <ChartWrapper height="100%">
              <ExpenseByCategoryChart data={categoryData} />
            </ChartWrapper>
          </div>
        </div>
      </div>

      <div className="glass rounded-xl border border-slate-200 dark:border-white/5 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 dark:border-white/5">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white font-display">Últimos lançamentos</h2>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-white/5">
          {isLoading && <p className="p-5 text-sm text-slate-400">Carregando...</p>}
          {!isLoading && latestEntries.length === 0 && <p className="p-5 text-sm text-slate-400">Nenhum lançamento no período.</p>}
          {latestEntries.map(entry => (
            <div key={`${entry.source}-${entry.sourceId}`} className="flex items-center justify-between px-5 py-3">
              <div>
                <p className="text-sm font-medium text-slate-900 dark:text-white">{entry.description}</p>
                <p className="text-xs text-slate-500">
                  {entry.category} · {formatDistanceToNow(new Date(entry.date), { addSuffix: true, locale: ptBR })}
                </p>
              </div>
              <span className={entry.type === 'receita' ? 'text-success-text font-bold' : 'text-error-text font-bold'}>
                {entry.type === 'receita' ? '+' : '-'}{formatBRL(entry.amount)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default FinancialDashboardPage;
