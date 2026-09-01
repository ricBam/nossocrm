'use client';

import { useCreateDealWithContact } from '@/lib/query/hooks/useDealsQuery';
import { useDefaultBoard } from '@/lib/query/hooks/useBoardsQuery';
import { dealNotesService } from '@/lib/supabase/dealNotes';
import { useAuth } from '@/context/AuthContext';
import type { RadarResultDTO } from '@/app/api/radar/search/route';

/**
 * Colapsa quebras de linha e espaços repetidos em um campo vindo do Google
 * Maps, para que não quebre a estrutura de uma lista markdown.
 */
function colapsarEspacos(valor: string | null | undefined, fallback = '—'): string {
    if (!valor) return fallback;
    const limpo = valor.replace(/\s+/g, ' ').trim();
    return limpo.length > 0 ? limpo : fallback;
}

/** Monta a nota que vai para `deal_notes`, com os dados que o Radar já coletou. */
function montarNota(result: RadarResultDTO): string {
    const p = result.place;
    return [
        '## Lead do Radar',
        '',
        `**Origem:** google_maps · coletado em ${new Date(p.collectedAt).toLocaleString('pt-BR')}`,
        '',
        `- Nota: ${p.totalScore ?? '—'} · Avaliações: ${p.reviewsCount ?? '—'}`,
        `- Categoria: ${colapsarEspacos(p.categoryName)}`,
        `- Endereço: ${colapsarEspacos(p.address)}`,
        `- Telefone: ${p.phone ?? '—'}`,
        `- Site: ${p.website ?? 'não tem'}`,
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
 * Salvar no CRM em um clique só.
 *
 * A nota de auditoria (com os dados que o Radar coletou) é melhor-esforço: uma
 * retentativa automática, e se ainda assim falhar só vai pro console — o deal
 * já está salvo de qualquer jeito, e não há mais um portão de citação que
 * exija desfazer o deal quando a nota falha.
 */
export function useSaveToCrm() {
    const { user, profile } = useAuth();
    const { data: board } = useDefaultBoard();
    const createDealWithContact = useCreateDealWithContact();

    async function gravarSavedDealId(resultId: string, dealId: string) {
        try {
            const res = await fetch(`/api/radar/results/${resultId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ dealId }),
            });
            if (!res.ok) {
                console.error(`Radar: falha ao gravar saved_deal_id (resultado ${resultId}, deal ${dealId}): HTTP ${res.status}`);
            }
        } catch (e) {
            console.error(`Radar: falha ao gravar saved_deal_id (resultado ${resultId}, deal ${dealId}):`, e);
        }
    }

    async function salvar(result: RadarResultDTO): Promise<string> {
        const primeiroEstagio = board?.stages?.[0];
        if (!board || !primeiroEstagio) throw new Error('Board padrão não encontrado.');

        const p = result.place;
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
                        score: result.score,
                        score_breakdown: result.breakdown,
                        disqualified: result.disqualified,
                        disqualify_reasons: result.disqualifyReasons,
                        source: 'google_maps',
                        collected_at: p.collectedAt,
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

        const conteudo = montarNota(result);
        const primeira = await dealNotesService.createNote(criado.id, conteudo);
        if (primeira.error) {
            const segunda = await dealNotesService.createNote(criado.id, conteudo);
            if (segunda.error) {
                console.error(`Radar: falha ao gravar a nota de auditoria do deal ${criado.id}`, segunda.error);
            }
        }

        await gravarSavedDealId(result.id, criado.id);
        return criado.id;
    }

    return { salvar, isSaving: createDealWithContact.isPending };
}
