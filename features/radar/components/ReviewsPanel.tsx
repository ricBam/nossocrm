'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useRadarReviews } from '@/lib/query/hooks/useRadarQuery';
import { findAnchorMatches } from '@/lib/radar/anchors';
import { estimateReviewsCost } from '@/lib/radar/pricing';
import type { RadarReview, ScoreBreakdownItem } from '@/lib/radar/types';
import type { RadarResultDTO } from '@/app/api/radar/search/route';

const MAX_REVIEWS = 10;

/** Destaca os termos do âncora dentro do texto da avaliação. */
function Destacado({ review }: { review: RadarReview }) {
    const matches = findAnchorMatches(review);
    if (matches.length === 0) return <>{review.text}</>;

    const pedacos: React.ReactNode[] = [];
    let cursor = 0;
    for (const m of matches) {
        if (m.start < cursor) continue; // termos sobrepostos: fica o primeiro
        pedacos.push(review.text.slice(cursor, m.start));
        pedacos.push(
            <mark key={`${m.term}-${m.start}`} className="rounded bg-amber-200 px-0.5 dark:bg-amber-700/60">
                {review.text.slice(m.start, m.end)}
            </mark>
        );
        cursor = m.end;
    }
    pedacos.push(review.text.slice(cursor));
    return <>{pedacos}</>;
}

/**
 * Painel lateral por empresa. Só chama a rede quando o usuário clica —
 * cada avaliação é cobrada.
 */
export function ReviewsPanel({
    result,
    onClose,
    onUseQuote,
    onScoreResolved,
}: {
    result: RadarResultDTO;
    onClose: () => void;
    onUseQuote: (quote: string, date: string | null) => void;
    /** Chamado com o score e o breakdown recomputados, assim que a busca de avaliações termina. */
    onScoreResolved: (resultId: string, score: number, breakdown: ScoreBreakdownItem[]) => void;
}) {
    const puxar = useRadarReviews();
    const [reviews, setReviews] = useState<RadarReview[] | null>(null);

    useEffect(() => {
        setReviews(null);
    }, [result.id]);

    const custo = estimateReviewsCost({ places: 1, reviewsPerPlace: MAX_REVIEWS });

    return (
        <aside className="fixed inset-y-0 right-0 z-[9998] w-full max-w-md overflow-y-auto border-l border-slate-200 bg-white p-4 shadow-xl dark:border-slate-700 dark:bg-slate-900">
            <div className="mb-3 flex items-start justify-between gap-2">
                <div>
                    <h2 className="font-semibold">{result.place.title}</h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                        Avaliações dos últimos 180 dias, ordenadas pelos termos do âncora que casam
                    </p>
                </div>
                <Button variant="ghost" size="sm" onClick={onClose}>Fechar</Button>
            </div>

            {reviews === null && (
                <div className="space-y-2">
                    <p className="text-sm text-slate-600 dark:text-slate-300">
                        Puxar até {MAX_REVIEWS} avaliações custa cerca de US$ {custo.toFixed(4)}.
                    </p>
                    <Button
                        disabled={puxar.isPending}
                        onClick={async () => {
                            const out = await puxar.mutateAsync({
                                resultId: result.id,
                                maxReviews: MAX_REVIEWS,
                            });
                            setReviews(out.reviews);
                            onScoreResolved(result.id, out.score, out.breakdown);
                        }}
                    >
                        {puxar.isPending ? 'Puxando…' : 'Puxar avaliações'}
                    </Button>
                    {puxar.isError && (
                        <p className="text-sm text-red-600 dark:text-red-400">{puxar.error.message}</p>
                    )}
                </div>
            )}

            {reviews !== null && reviews.length === 0 && (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                    Nenhuma avaliação nos últimos 180 dias. Sem citação, não há lead.
                </p>
            )}

            <ul className="space-y-3">
                {(reviews ?? []).map((r) => {
                    const semTermoDoAncora = findAnchorMatches(r).length === 0;
                    return (
                        <li key={r.reviewId} className="rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-700">
                            <p className="mb-2 whitespace-pre-wrap">
                                <Destacado review={r} />
                            </p>
                            <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                                <span className="flex items-center gap-2">
                                    {r.stars ?? '—'}★ ·{' '}
                                    {r.publishedAt ? new Date(r.publishedAt).toLocaleDateString('pt-BR') : 'sem data'}
                                    {semTermoDoAncora && (
                                        <Badge variant="secondary" className="font-normal">
                                            sem termo do âncora
                                        </Badge>
                                    )}
                                </span>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => onUseQuote(r.text, r.publishedAt ? r.publishedAt.slice(0, 10) : null)}
                                >
                                    Usar como citação
                                </Button>
                            </div>
                        </li>
                    );
                })}
            </ul>
        </aside>
    );
}
