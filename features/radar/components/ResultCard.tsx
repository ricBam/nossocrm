'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import type { RadarResultDTO } from '@/app/api/radar/search/route';

export function ResultCard({
    result,
    selected = false,
    onToggleSelect,
    onOpenDetail,
    onSave,
    onDelete,
    saving = false,
    deleting = false,
}: {
    result: RadarResultDTO;
    /** Marcado para entrar num salvamento em lote. */
    selected?: boolean;
    onToggleSelect: (r: RadarResultDTO, marcado: boolean) => void;
    onOpenDetail: (r: RadarResultDTO) => void;
    onSave: (r: RadarResultDTO) => void;
    onDelete: (r: RadarResultDTO) => void;
    /** Desabilita o botão Salvar enquanto o salvamento DESTE card está em andamento. */
    saving?: boolean;
    /** Desabilita o botão Apagar enquanto a exclusão DESTE card está em andamento. */
    deleting?: boolean;
}) {
    const p = result.place;
    // Apagar soft-deleta o deal E apaga a linha do Radar (a única evidência
    // que o justificou), sem undo na UI — por isso o primeiro clique só arma
    // a confirmação; só o segundo clique dispara `onDelete`. Perder o foco do
    // botão (clicar em outro lugar do card, ou fora dele) desarma de novo.
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
        <Card
            className={cn('cursor-pointer space-y-3 p-4', result.disqualified && 'opacity-70')}
            onClick={() => onOpenDetail(result)}
        >
            <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-2">
                    <Checkbox
                        className="mt-1"
                        checked={selected}
                        onClick={(e) => e.stopPropagation()}
                        onCheckedChange={(v) => onToggleSelect(result, v === true)}
                        aria-label={`Marcar ${p.title} para salvamento em lote`}
                    />
                    <div className="min-w-0">
                        <h3 className="truncate font-semibold">{p.title}</h3>
                        <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                            {p.categoryName ?? 'Sem categoria'}
                            {p.address ? ` · ${p.address}` : ''}
                        </p>
                    </div>
                </div>
                <div className="flex max-w-[50%] shrink-0 flex-wrap items-center justify-end gap-1 md:max-w-none md:flex-nowrap">
                    <Badge variant="secondary" className="tabular-nums">Score {result.score}</Badge>
                    {result.disqualified && <Badge variant="destructive">Desqualificada</Badge>}
                    {result.duplicate.isDuplicate && <Badge variant="secondary">Já está no CRM</Badge>}
                    {result.savedDealId && <Badge>Salva</Badge>}
                </div>
            </div>

            <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs sm:gap-x-4">
                <div className="flex justify-between"><dt className="text-slate-500">Nota</dt><dd className="tabular-nums">{p.totalScore ?? '—'}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">Avaliações</dt><dd className="tabular-nums">{p.reviewsCount ?? '—'}</dd></div>
                <div className="flex min-w-0 justify-between gap-2"><dt className="shrink-0 text-slate-500">Telefone</dt><dd className="min-w-0 truncate">{p.phone ?? '—'}</dd></div>
                <div className="flex min-w-0 justify-between gap-2"><dt className="shrink-0 text-slate-500">Site</dt><dd className="min-w-0 truncate">{p.website ? 'sim' : 'não'}</dd></div>
            </dl>

            <div className="flex flex-wrap items-center gap-2" onClick={(e) => e.stopPropagation()}>
                {p.url && (
                    <Button variant="outline" size="sm" asChild>
                        <a href={p.url} target="_blank" rel="noopener noreferrer">Google Maps ↗</a>
                    </Button>
                )}
                {p.website && (
                    <Button variant="outline" size="sm" asChild>
                        <a href={p.website} target="_blank" rel="noopener noreferrer">Site ↗</a>
                    </Button>
                )}
                <Button size="sm" disabled={saving || !!result.savedDealId} onClick={() => onSave(result)}>
                    {saving ? 'Salvando…' : result.savedDealId ? 'Salva' : 'Salvar no CRM'}
                </Button>
                <Button
                    variant="ghost"
                    size="sm"
                    className="ml-auto text-red-600"
                    disabled={deleting}
                    onClick={handleDeleteClick}
                    onBlur={() => setConfirmando(false)}
                >
                    {confirmando ? 'Confirmar?' : 'Apagar'}
                </Button>
            </div>
        </Card>
    );
}
