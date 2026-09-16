import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LogOut, Moon, Sun } from 'lucide-react';
import { ActionSheet } from '@/components/ui/ActionSheet';
import { cn } from '@/lib/utils/cn';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { SECONDARY_NAV, filterNavByRole } from './navConfig';

export interface MoreMenuSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

const itemClassName = cn(
  'flex w-full items-center gap-3 rounded-xl border border-slate-200 dark:border-white/10',
  'bg-white dark:bg-dark-card',
  'px-3 py-3 text-sm font-medium',
  'text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-white/5',
  'focus-visible-ring'
);

export function MoreMenuSheet({ isOpen, onClose }: MoreMenuSheetProps) {
  const pathname = usePathname();
  const { profile, signOut } = useAuth();
  const { darkMode, toggleDarkMode } = useTheme();

  return (
    <ActionSheet isOpen={isOpen} onClose={onClose} title="Mais" description="Acesse outras áreas do CRM">
      <div className="space-y-2">
        {filterNavByRole(SECONDARY_NAV, profile?.role).map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link
              key={item.id}
              href={item.href}
              onClick={onClose}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                itemClassName,
                isActive && 'border-primary-300 text-primary-600 dark:border-primary-900/60 dark:text-primary-400'
              )}
            >
              <Icon className={cn('h-5 w-5', isActive ? 'text-primary-500' : 'text-slate-500')} aria-hidden="true" />
              <span className="font-display tracking-wide">{item.label}</span>
            </Link>
          );
        })}

        <div className="my-3 h-px bg-slate-200/60 dark:bg-white/10" />

        <button type="button" onClick={toggleDarkMode} className={itemClassName}>
          {darkMode ? (
            <Sun className="h-5 w-5 text-slate-500" aria-hidden="true" />
          ) : (
            <Moon className="h-5 w-5 text-slate-500" aria-hidden="true" />
          )}
          <span className="font-display tracking-wide">{darkMode ? 'Tema claro' : 'Tema escuro'}</span>
        </button>

        <button
          type="button"
          onClick={() => {
            onClose();
            signOut();
          }}
          className={cn(itemClassName, 'text-red-600 dark:text-red-400')}
        >
          <LogOut className="h-5 w-5" aria-hidden="true" />
          <span className="font-display tracking-wide">Sair da conta</span>
        </button>
      </div>
    </ActionSheet>
  );
}
