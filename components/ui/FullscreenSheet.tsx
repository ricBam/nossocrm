/**
 * FullscreenSheet
 *
 * Mobile-first fullscreen sheet layout with:
 * - sticky header
 * - scrollable body
 * - optional footer
 */
import React from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { Sheet } from './Sheet';

export interface FullscreenSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}

export function FullscreenSheet({ isOpen, onClose, title, children, footer, className }: FullscreenSheetProps) {
  return (
    <Sheet
      isOpen={isOpen}
      onClose={onClose}
      ariaLabel={title}
      className={cn('h-[100dvh] rounded-none pb-0', className)}
    >
      <div className="flex h-full flex-col">
        <div className="shrink-0 border-b border-slate-200 dark:border-white/10 bg-white dark:bg-dark-card pt-[var(--app-safe-area-top,0px)]">
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0 text-sm font-semibold text-slate-900 dark:text-white truncate">{title}</div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 transition-colors focus-visible-ring"
              aria-label="Fechar"
            >
              <X size={18} className="text-slate-500" />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto overscroll-contain px-4 py-4">{children}</div>

        {footer ? (
          <div className="shrink-0 border-t border-slate-200 dark:border-white/10 bg-white dark:bg-dark-card px-4 pt-3 pb-[calc(0.75rem+var(--app-safe-area-bottom,0px))]">
            {footer}
          </div>
        ) : null}
      </div>
    </Sheet>
  );
}
