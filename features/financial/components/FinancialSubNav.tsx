'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const TABS = [
  { href: '/financial', label: 'Visão Geral' },
  { href: '/financial/lancamentos', label: 'Lançamentos' },
  { href: '/financial/cofrinhos', label: 'Cofrinhos' },
] as const;

export const FinancialSubNav: React.FC = () => {
  const pathname = usePathname();

  return (
    <nav className="flex gap-1 border-b border-slate-200 dark:border-white/5" aria-label="Navegação do Financeiro">
      {TABS.map(tab => {
        const isActive = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              'px-4 py-2 text-sm font-bold border-b-2 -mb-px transition-colors',
              isActive
                ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            )}
            aria-current={isActive ? 'page' : undefined}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
};

export default FinancialSubNav;
