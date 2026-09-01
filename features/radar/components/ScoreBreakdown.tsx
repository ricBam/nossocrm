'use client';

import { cn } from '@/lib/utils';
import type { ScoreBreakdownItem } from '@/lib/radar/types';

/**
 * Mostra de onde veio cada ponto. O score nunca aparece sozinho — um número
 * opaco não é auditável, e a qualificação final é de quem lê.
 */
export function ScoreBreakdown({
    score,
    breakdown,
    disqualifyReasons,
}: {
    score: number;
    breakdown: ScoreBreakdownItem[];
    disqualifyReasons: string[];
}) {
    return (
        <div className="space-y-1 text-xs">
            <div className="font-semibold text-slate-700 dark:text-slate-200">
                Score {score}
            </div>
            <ul className="space-y-0.5">
                {breakdown.map((item) => (
                    <li
                        key={item.label}
                        className={cn(
                            'flex items-baseline justify-between gap-2',
                            item.matched ? 'text-slate-700 dark:text-slate-200' : 'text-slate-400 dark:text-slate-500'
                        )}
                    >
                        <span>
                            {item.label}
                            {item.pending && (
                                <span className="ml-1 italic">— pendente, puxe as avaliações</span>
                            )}
                        </span>
                        <span className="tabular-nums font-medium">
                            {item.points > 0 ? `+${item.points}` : '0'}
                        </span>
                    </li>
                ))}
            </ul>
            {disqualifyReasons.length > 0 && (
                <ul className="mt-2 space-y-0.5 text-red-600 dark:text-red-400">
                    {disqualifyReasons.map((r) => (
                        <li key={r}>Desqualifica: {r}</li>
                    ))}
                </ul>
            )}
        </div>
    );
}
