import React from 'react';
import { CheckCircle2, CalendarClock, X } from 'lucide-react';

interface BulkActionsToolbarProps {
    selectedCount: number;
    onCompleteAll: () => void;
    onSnoozeAll: () => void;
    onClearSelection: () => void;
}

/**
 * Componente React `BulkActionsToolbar`.
 *
 * No celular (< md) a barra fica ancorada acima da BottomNav
 * (`--app-bottom-nav-height` + safe area), ocupa a largura toda com
 * `inset-x-2` e usa rótulos compactos; do `md` para cima mantém o
 * layout flutuante centralizado original.
 *
 * @param {BulkActionsToolbarProps} {
    selectedCount,
    onCompleteAll,
    onSnoozeAll,
    onClearSelection
} - Parâmetro `{
    selectedCount,
    onCompleteAll,
    onSnoozeAll,
    onClearSelection
}`.
 * @returns {Element | null} Retorna um valor do tipo `Element | null`.
 */
export const BulkActionsToolbar: React.FC<BulkActionsToolbarProps> = ({
    selectedCount,
    onCompleteAll,
    onSnoozeAll,
    onClearSelection
}) => {
    if (selectedCount === 0) return null;

    return (
        <div className="fixed inset-x-2 bottom-[calc(var(--app-bottom-nav-height,0px)+var(--app-safe-area-bottom,0px)+0.5rem)] md:inset-x-auto md:bottom-8 md:left-1/2 md:transform md:-translate-x-1/2 z-50 animate-in slide-in-from-bottom-5 duration-300">
            <div className="bg-slate-900 text-white rounded-2xl shadow-2xl border border-white/10 px-3 py-2.5 md:px-6 md:py-4 flex items-center justify-between gap-2 md:justify-start md:gap-6">
                <div className="flex min-w-0 items-center gap-2 md:gap-3">
                    <div className="w-8 h-8 shrink-0 bg-primary-500 rounded-full flex items-center justify-center font-bold text-sm">
                        {selectedCount}
                    </div>
                    <span className="sr-only md:not-sr-only font-medium">
                        {selectedCount === 1 ? '1 atividade selecionada' : `${selectedCount} atividades selecionadas`}
                    </span>
                </div>

                <div className="flex shrink-0 items-center gap-1.5 md:gap-2">
                    <button
                        onClick={onCompleteAll}
                        className="px-3 py-2 md:px-4 bg-green-500 hover:bg-green-600 text-white rounded-lg text-sm md:text-base font-medium flex items-center gap-1.5 md:gap-2 transition-colors"
                    >
                        <CheckCircle2 size={16} aria-hidden="true" />
                        Concluir
                    </button>

                    <button
                        onClick={onSnoozeAll}
                        aria-label="Adiar 1 Dia"
                        className="px-3 py-2 md:px-4 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm md:text-base font-medium flex items-center gap-1.5 md:gap-2 transition-colors"
                    >
                        <CalendarClock size={16} aria-hidden="true" />
                        <span className="md:hidden">Adiar</span>
                        <span className="hidden md:inline">Adiar 1 Dia</span>
                    </button>

                    <button
                        onClick={onClearSelection}
                        aria-label="Limpar seleção"
                        className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                        title="Limpar seleção"
                    >
                        <X size={20} aria-hidden="true" />
                    </button>
                </div>
            </div>
        </div>
    );
};
