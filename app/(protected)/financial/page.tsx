import type { Metadata } from 'next';
import FinancialDashboardPage from '@/features/financial/FinancialDashboardPage';

export const metadata: Metadata = { title: 'Financeiro | NossoCRM' };

export default function Financial() {
  return <FinancialDashboardPage />;
}
