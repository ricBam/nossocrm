import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils/cn';
import { useUnreadCount } from '@/lib/query/hooks/useConversationsQuery';
import { PRIMARY_NAV } from './navConfig';

export interface BottomNavProps {
  onOpenMore: () => void;
}

export function BottomNav({ onOpenMore }: BottomNavProps) {
  const pathname = usePathname();
  const { data: unreadMessagesCount = 0 } = useUnreadCount();

  return (
    <nav
      aria-label="Navegação principal (mobile)"
      className={cn(
        'fixed inset-x-0 bottom-0 z-50 md:hidden',
        'border-t border-slate-200 dark:border-white/10',
        'bg-white/85 dark:bg-dark-card/85 backdrop-blur',
        'pb-[var(--app-safe-area-bottom,0px)]'
      )}
    >
      <div className="mx-auto flex h-[var(--app-bottom-nav-height,56px)] max-w-screen-sm items-stretch">
        {PRIMARY_NAV.map((item) => {
          const isActive =
            item.href
              ? pathname === item.href || (item.href === '/boards' && pathname === '/pipeline')
              : false;

          const Icon = item.icon;

          if (item.id === 'more') {
            return (
              <button
                key={item.id}
                type="button"
                onClick={onOpenMore}
                className={cn(
                  'flex min-w-0 flex-1 flex-col items-center justify-center gap-1 px-0.5',
                  'text-[11px] font-medium',
                  'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white',
                  'focus-visible-ring'
                )}
              >
                <Icon className="h-5 w-5" aria-hidden="true" />
                <span className="max-w-full truncate font-display">{item.label}</span>
              </button>
            );
          }

          return (
            <Link
              key={item.id}
              href={item.href!}
              className={cn(
                'flex min-w-0 flex-1 flex-col items-center justify-center gap-1 px-0.5',
                'text-[11px] font-medium focus-visible-ring',
                isActive
                  ? 'text-primary-600 dark:text-primary-400'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              )}
              aria-current={isActive ? 'page' : undefined}
            >
              <span className="relative">
                <Icon className={cn('h-5 w-5', isActive ? 'text-primary-500' : '')} aria-hidden="true" />
                {item.id === 'messaging' && unreadMessagesCount > 0 ? (
                  <span
                    className="absolute -top-1.5 -right-2 min-w-[16px] h-[16px] flex items-center justify-center px-0.5 text-[9px] font-bold text-white bg-red-500 rounded-full"
                    aria-label={`${unreadMessagesCount} não lidas`}
                  >
                    {unreadMessagesCount > 99 ? '99+' : unreadMessagesCount}
                  </span>
                ) : null}
              </span>
              <span className="max-w-full truncate font-display">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

