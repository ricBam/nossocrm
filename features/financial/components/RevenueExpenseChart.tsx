import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { formatBRL } from '@/lib/utils/formatCurrency';

interface RevenueExpenseChartProps {
  data: { month: string; receita: number; despesa: number }[];
}

export const RevenueExpenseChart: React.FC<RevenueExpenseChartProps> = ({ data }) => {
  if (!data || data.length === 0) {
    return <div className="flex items-center justify-center h-full text-slate-400 text-sm">Sem dados no período</div>;
  }

  return (
    <ResponsiveContainer width="100%" height="100%" debounce={50}>
      <BarChart data={data} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
        <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: 'var(--chart-text)', fontSize: 12 }} />
        <YAxis
          axisLine={false}
          tickLine={false}
          tick={{ fill: 'var(--chart-text)', fontSize: 12 }}
          tickFormatter={value => formatBRL(value)}
          width={90}
        />
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
        <Bar dataKey="receita" name="Receita" fill="var(--color-success-text)" radius={[4, 4, 0, 0]} />
        <Bar dataKey="despesa" name="Despesa" fill="var(--color-error-text)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
};

export default RevenueExpenseChart;
