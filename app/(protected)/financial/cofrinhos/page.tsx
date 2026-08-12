import type { Metadata } from 'next';
import CofrinhosPage from '@/features/financial/CofrinhosPage';

export const metadata: Metadata = { title: 'Cofrinhos | NossoCRM' };

export default function FinancialCofrinhos() {
  return <CofrinhosPage />;
}
