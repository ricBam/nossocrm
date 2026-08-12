import type { Metadata } from 'next';
import LancamentosPage from '@/features/financial/LancamentosPage';

export const metadata: Metadata = { title: 'Lançamentos | NossoCRM' };

export default function FinancialLancamentos() {
  return <LancamentosPage />;
}
