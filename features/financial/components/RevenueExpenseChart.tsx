import React from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
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
      <AreaChart data={data} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
        <defs>
          <linearGradient id="colorReceitaFin" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--color-success-text)" stopOpacity={0.35} />
            <stop offset="95%" stopColor="var(--color-success-text)" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="colorDespesaFin" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--color-error-text)" stopOpacity={0.35} />
            <stop offset="95%" stopColor="var(--color-error-text)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
        <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: 'var(--chart-text)', fontSize: 12 }} dy={8} />
        <YAxis
          axisLine={false}
          tickLine={false}
          tick={{ fill: 'var(--chart-text)', fontSize: 12 }}
          tickFormatter={value => formatBRL(value)}
          width={90}
        />
        <Tooltip
          formatter={(value: number) => formatBRL(value)}
          cursor={{ stroke: 'var(--chart-grid)', strokeWidth: 1 }}
          contentStyle={{
            backgroundColor: 'var(--chart-tooltip-bg)',
            border: '1px solid var(--chart-tooltip-border)',
            borderRadius: '8px',
            color: 'var(--chart-tooltip-text)',
            fontSize: '12px',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
          }}
        />
        <Legend wrapperStyle={{ fontSize: 12, color: 'var(--chart-text)' }} />
        <Area type="monotone" dataKey="receita" name="Receita" stroke="var(--color-success-text)" strokeWidth={2} fillOpacity={1} fill="url(#colorReceitaFin)" />
        <Area type="monotone" dataKey="despesa" name="Despesa" stroke="var(--color-error-text)" strokeWidth={2} fillOpacity={1} fill="url(#colorDespesaFin)" />
      </AreaChart>
    </ResponsiveContainer>
  );
};

export default RevenueExpenseChart;
