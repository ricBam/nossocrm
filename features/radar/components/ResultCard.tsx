'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { ScoreBreakdown } from './ScoreBreakdown';
import type { RadarResultDTO } from '@/app/api/radar/search/route';

export function ResultCard({
    result,
    onOpenReviews,
    onSave,
}: {
    result: RadarResultDTO;
    onOpenReviews: (r: RadarResultDTO) => void;
    onSave: (r: RadarResultDTO) => void;
}) {
    const p = result.place;

    return (
        <Card className={cn('p-4 space-y-3', result.disqualified && 'opacity-70')}>
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <h3 className="truncate font-semibold">{p.title}</h3>
                    <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                        {p.categoryName ?? 'Sem categoria'}
                        {p.address ? ` · ${p.address}` : ''}
                    </p>
                </div>
                <div className="flex shrink-0 gap-1">
                    {result.disqualified && <Badge variant="destructive">Desqualificada</Badge>}
                    {result.duplicate.isDuplicate && <Badge variant="secondary">Já está no CRM</Badge>}
                    {result.savedDealId && <Badge>Salva</Badge>}
                </div>
            </div>

            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <div className="flex justify-between"><dt className="text-slate-500">Nota</dt><dd className="tabular-nums">{p.totalScore ?? '—'}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">Avaliações</dt><dd className="tabular-nums">{p.reviewsCount ?? '—'}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">Telefone</dt><dd className="truncate">{p.phone ?? '—'}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">Site</dt><dd className="truncate">{p.website ? 'sim' : 'não'}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">Redes</dt><dd className="truncate">{p.socials.length > 0 ? p.socials.length : 'não'}</dd></div>
            </dl>

            <ScoreBreakdown
                score={result.score}
                breakdown={result.breakdown}
                disqualifyReasons={result.disqualifyReasons}
            />

            <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => onOpenReviews(result)}>
                    Ler avaliações
                </Button>
                <Button size="sm" onClick={() => onSave(result)}>
                    Salvar no CRM
                </Button>
            </div>
        </Card>
    );
}
