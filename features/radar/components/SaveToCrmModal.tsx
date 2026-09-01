'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCreateDealWithContact } from '@/lib/query/hooks/useDealsQuery';
import { useDefaultBoard } from '@/lib/query/hooks/useBoardsQuery';
import { dealNotesService } from '@/lib/supabase/dealNotes';
import { useAuth } from '@/context/AuthContext';
import type { RadarResultDTO } from '@/app/api/radar/search/route';

/**
 * Monta a nota que vai para `deal_notes`. Guarda a citação, a data dela e a
 * procedência de cada campo — exigência da constituição.
 */
function montarNota(result: RadarResultDTO, citacao: string, dataCitacao: string): string {
    const p = result.place;
    return [
        '## Sinal do Radar',
        '',
        `> ${citacao.trim()}`,
        '',
        `**Data da avaliação:** ${dataCitacao || 'não informada'}`,
        `**Origem:** google_maps · coletado em ${new Date(p.collectedAt).toLocaleString('pt-BR')}`,
        '',
        '### Dados da busca',
        `- Nota: ${p.totalScore ?? '—'} · Avaliações: ${p.reviewsCount ?? '—'}`,
        `- Categoria: ${p.categoryName ?? '—'}`,
        `- Endereço: ${p.address ?? '—'}`,
        `- Telefone: ${p.phone ?? '—'}`,
        `- Site: ${p.website ?? 'não tem'}`,
        `- Redes: ${p.socials.length > 0 ? p.socials.join(', ') : 'não tem'}`,
        `- Score: ${result.score}`,
        ...result.breakdown.map(b => `  - ${b.label}: ${b.points > 0 ? `+${b.points}` : '0'}`),
        ...(result.disqualifyReasons.length > 0
            ? ['', `**Desqualificações:** ${result.disqualifyReasons.join(' · ')}`]
            : []),
        '',
        `**place_id:** ${p.placeId}`,
    ].join('\n');
}

/**
 * Salvar no CRM.
 *
 * ⚠️ O botão fica desabilitado enquanto a citação estiver vazia. Este é o
 * único caminho da tela que cria deal, e a citação é o portão.
 */
export function SaveToCrmModal({
    result,
    initialQuote = '',
    initialQuoteDate = '',
    onClose,
    onSaved,
}: {
    result: RadarResultDTO;
    initialQuote?: string;
    initialQuoteDate?: string;
    onClose: () => void;
    onSaved: (dealId: string) => void;
}) {
    const { user, profile } = useAuth();
    const { data: board } = useDefaultBoard();
    const createDealWithContact = useCreateDealWithContact();

    const [citacao, setCitacao] = useState(initialQuote);
    const [dataCitacao, setDataCitacao] = useState(initialQuoteDate);
    const [erro, setErro] = useState<string | null>(null);
    const [salvando, setSalvando] = useState(false);

    const p = result.place;
    // Primeiro estágio por ordem. Nunca um nome literal.
    const primeiroEstagio = board?.stages?.[0];
    const temCitacao = citacao.trim().length > 0;
    const podeSalvar = temCitacao && !!board && !!primeiroEstagio && !salvando;

    async function salvar() {
        if (!podeSalvar || !board || !primeiroEstagio) return;
        setSalvando(true);
        setErro(null);
        try {
            const ownerName =
                (profile as { nickname?: string; first_name?: string } | null)?.nickname ||
                (profile as { first_name?: string } | null)?.first_name ||
                (user?.email ?? '').split('@')[0] ||
                'Eu';

            const criado = await createDealWithContact.mutateAsync({
                deal: {
                    title: p.title,
                    companyId: '',
                    contactId: '',
                    boardId: board.id,
                    ownerId: user?.id ?? '',
                    value: 0,
                    items: [],
                    status: primeiroEstagio.id,
                    updatedAt: new Date().toISOString(),
                    probability: 10,
                    priority: 'medium',
                    tags: ['Radar'],
                    owner: { name: ownerName, avatar: '' },
                    customFields: {
                        radar: {
                            place_id: p.placeId,
                            rating: p.totalScore,
                            reviews_count: p.reviewsCount,
                            category: p.categoryName,
                            address: p.address,
                            website: p.website,
                            socials: p.socials,
                            score: result.score,
                            score_breakdown: result.breakdown,
                            disqualified: result.disqualified,
                            disqualify_reasons: result.disqualifyReasons,
                            source: 'google_maps',
                            collected_at: p.collectedAt,
                            quote: citacao.trim(),
                            quote_date: dataCitacao || null,
                        },
                    },
                    isWon: false,
                    isLost: false,
                },
                relatedData: {
                    companyName: p.title,
                    contact: {
                        name: p.title,
                        email: '',
                        phone: p.phone ?? '',
                    },
                },
            });

            await dealNotesService.createNote(criado.id, montarNota(result, citacao, dataCitacao));
            onSaved(criado.id);
            onClose();
        } catch (e) {
            setErro(e instanceof Error ? e.message : 'Falha ao salvar no CRM.');
        } finally {
            setSalvando(false);
        }
    }

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
            <div className="w-full max-w-lg space-y-4 rounded-xl bg-white p-5 shadow-xl dark:bg-slate-900">
                <div>
                    <h2 className="text-lg font-semibold">Salvar no CRM</h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                        {p.title} · vai para o estágio &ldquo;{primeiroEstagio?.label ?? '—'}&rdquo; do board{' '}
                        {board?.name ?? '—'}
                    </p>
                </div>

                <div className="space-y-1">
                    <Label htmlFor="radar-citacao">Citação literal *</Label>
                    <textarea
                        id="radar-citacao"
                        rows={4}
                        className="w-full rounded-md border border-slate-200 bg-transparent p-2 text-sm dark:border-slate-700"
                        value={citacao}
                        onChange={(e) => setCitacao(e.target.value)}
                        placeholder="Cole o trecho da avaliação, ou escreva sua observação à mão."
                    />
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                        Sem citação não há lead. Alvo é dor reclamada publicamente, nunca ausência.
                    </p>
                </div>

                <div className="space-y-1">
                    <Label htmlFor="radar-data-citacao">Data da avaliação</Label>
                    <Input
                        id="radar-data-citacao"
                        type="date"
                        value={dataCitacao}
                        onChange={(e) => setDataCitacao(e.target.value)}
                    />
                </div>

                {erro && <p className="text-sm text-red-600 dark:text-red-400">{erro}</p>}

                <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={onClose} disabled={salvando}>
                        Cancelar
                    </Button>
                    <Button onClick={salvar} disabled={!podeSalvar}>
                        {salvando ? 'Salvando…' : 'Salvar no CRM'}
                    </Button>
                </div>
            </div>
        </div>
    );
}
