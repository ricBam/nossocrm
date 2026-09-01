'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScoreBreakdown } from './ScoreBreakdown';
import type { RadarResultDTO } from '@/app/api/radar/search/route';

/**
 * Detalhe de uma empresa, aberto ao clicar no card. É aqui que mora o
 * destrinchamento do score, os links externos (Maps/site) e as ações — o
 * card na lista fica só com o essencial para não poluir a fila de leitura.
 */
export function ResultDetail({
    result,
    onClose,
    onSave,
    onDelete,
    saving = false,
}: {
    result: RadarResultDTO;
    onClose: () => void;
    onSave: (r: RadarResultDTO) => void;
    onDelete: (r: RadarResultDTO) => void;
    /** Desabilita o botão Salvar enquanto o salvamento DESTE resultado está em andamento. */
    saving?: boolean;
}) {
    const p = result.place;
    // Mesma confirmação em dois cliques do card: apagar não tem undo.
    const [confirmando, setConfirmando] = useState(false);

    function handleDeleteClick() {
        if (confirmando) {
            setConfirmando(false);
            onDelete(result);
        } else {
            setConfirmando(true);
        }
    }

    return (
        <aside className="fixed inset-y-0 right-0 z-[9998] w-full max-w-md overflow-y-auto border-l border-slate-200 bg-white p-4 shadow-xl dark:border-slate-700 dark:bg-slate-900">
            <div className="mb-3 flex items-start justify-between gap-2">
                <div className="min-w-0">
                    <h2 className="font-semibold">{p.title}</h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                        {p.categoryName ?? 'Sem categoria'}
                    </p>
                </div>
                <Button variant="ghost" size="sm" onClick={onClose}>Fechar</Button>
            </div>

            <div className="mb-3 flex flex-wrap gap-1">
                {result.disqualified && <Badge variant="destructive">Desqualificada</Badge>}
                {result.duplicate.isDuplicate && <Badge variant="secondary">Já está no CRM</Badge>}
                {result.savedDealId && <Badge>Salva</Badge>}
            </div>

            <dl className="mb-4 space-y-1 text-sm">
                <div className="flex justify-between gap-2"><dt className="text-slate-500">Endereço</dt><dd className="text-right">{p.address ?? '—'}</dd></div>
                <div className="flex justify-between gap-2"><dt className="text-slate-500">Telefone</dt><dd>{p.phone ?? '—'}</dd></div>
                <div className="flex justify-between gap-2"><dt className="text-slate-500">Nota</dt><dd className="tabular-nums">{p.totalScore ?? '—'}</dd></div>
                <div className="flex justify-between gap-2"><dt className="text-slate-500">Avaliações</dt><dd className="tabular-nums">{p.reviewsCount ?? '—'}</dd></div>
            </dl>

            <div className="mb-4 flex flex-wrap gap-2">
                {p.url && (
                    <Button variant="outline" size="sm" asChild>
                        <a href={p.url} target="_blank" rel="noopener noreferrer">Ver no Google Maps ↗</a>
                    </Button>
                )}
                {p.website && (
                    <Button variant="outline" size="sm" asChild>
                        <a href={p.website} target="_blank" rel="noopener noreferrer">Abrir site ↗</a>
                    </Button>
                )}
            </div>

            <div className="mb-4 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                <ScoreBreakdown
                    score={result.score}
                    breakdown={result.breakdown}
                    disqualifyReasons={result.disqualifyReasons}
                />
            </div>

            <div className="flex gap-2">
                <Button size="sm" disabled={saving || !!result.savedDealId} onClick={() => onSave(result)}>
                    {saving ? 'Salvando…' : result.savedDealId ? 'Salva' : 'Salvar no CRM'}
                </Button>
                <Button
                    variant="ghost"
                    size="sm"
                    className="ml-auto text-red-600"
                    onClick={handleDeleteClick}
                    onBlur={() => setConfirmando(false)}
                >
                    {confirmando ? 'Confirmar?' : 'Apagar'}
                </Button>
            </div>
        </aside>
    );
}
