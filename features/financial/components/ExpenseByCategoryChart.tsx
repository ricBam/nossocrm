import React from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { formatBRL } from '@/lib/utils/formatCurrency';

interface ExpenseByCategoryChartProps {
  data: { category: string; total: number }[];
}

const CATEGORY_COLORS = ['#F97316', '#8B5CF6', '#EC4899', '#0EA5E9', '#10B981', '#64748B', '#F59E0B', '#EF4444'];

export const ExpenseByCategoryChart: React.FC<ExpenseByCategoryChartProps> = ({ data }) => {
  if (!data || data.length === 0) {
    return <div className="flex items-center justify-center h-full text-slate-400 text-sm">Sem despesas no período</div>;
  }

  return (
    <ResponsiveContainer width="100%" height="100%" debounce={50}>
      <PieChart>
        <Pie
          data={data}
          dataKey="total"
          nameKey="category"
          cx="50%"
          cy="50%"
          outerRadius="70%"
          label={(entry: { category?: string; percent?: number }) => `${entry.category ?? ''} ${((entry.percent ?? 0) * 100).toFixed(0)}%`}
          labelLine={false}
        >
          {data.map((entry, index) => (
            <Cell key={entry.category} fill={CATEGORY_COLORS[index % CATEGORY_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip
          formatter={(value: number) => formatBRL(value)}
          contentStyle={{
            backgroundColor: 'var(--chart-tooltip-bg)',
            border: '1px solid var(--chart-tooltip-border)',
            borderRadius: '8px',
            color: 'var(--chart-tooltip-text)',
            fontSize: '12px',
          }}
        />
        <Legend wrapperStyle={{ fontSize: 12, color: 'var(--chart-text)' }} />
      </PieChart>
    </ResponsiveContainer>
  );
};

export default ExpenseByCategoryChart;
