'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCreateDealWithContact, useDeleteDeal } from '@/lib/query/hooks/useDealsQuery';
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

/**
 * Extrai uma mensagem legível de um erro do Supabase (PostgrestError) ou de
 * um Error nativo, sem depender de um tipo específico.
 */
function mensagemDeErro(erro: unknown): string {
    if (erro && typeof erro === 'object' && 'message' in erro) {
        return String((erro as { message?: unknown }).message);
    }
    return 'Erro desconhecido.';
}

/**
 * Monta a nota que vai para `deal_notes`. Guarda a citação, a data dela e a
 * procedência de cada campo — exigência da constituição.
 */
function montarNota(result: RadarResultDTO, citacao: string, dataCitacao: string): string {
    const p = result.place;
    // A citação pode ter várias linhas (avaliação real colada do Google) —
    // cada linha precisa do seu próprio `> ` para continuar dentro do blockquote.
    const citacaoEmBlockquote = citacao
        .trim()
        .split('\n')
        .map(linha => `> ${linha}`)
        .join('\n');
    return [
        '## Sinal do Radar',
        '',
        citacaoEmBlockquote,
        '',
        `**Data da avaliação:** ${dataCitacao || 'não informada'}`,
        `**Origem:** google_maps · coletado em ${new Date(p.collectedAt).toLocaleString('pt-BR')}`,
        '',
        '### Dados da busca',
        `- Nota: ${p.totalScore ?? '—'} · Avaliações: ${p.reviewsCount ?? '—'}`,
        `- Categoria: ${colapsarEspacos(p.categoryName)}`,
        `- Endereço: ${colapsarEspacos(p.address)}`,
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
    const deleteDeal = useDeleteDeal();

    const [citacao, setCitacao] = useState(initialQuote);
    const [dataCitacao, setDataCitacao] = useState(initialQuoteDate);
    const [erro, setErro] = useState<string | null>(null);
    const [salvando, setSalvando] = useState(false);
    // Cancelar desfazendo o deal órfão é uma operação de rede à parte de
    // `salvando` — os dois nunca ficam true ao mesmo tempo, mas cada botão
    // trava no seu próprio estado para não reagir ao spinner errado.
    const [cancelando, setCancelando] = useState(false);
    // Preenchido assim que o deal é criado. A partir daí, o botão nunca mais
    // pode chamar createDealWithContact de novo — só retentar a nota.
    const [dealIdCriado, setDealIdCriado] = useState<string | null>(null);

    const p = result.place;
    // Primeiro estágio por ordem. Nunca um nome literal.
    const primeiroEstagio = board?.stages?.[0];
    const temCitacao = citacao.trim().length > 0;
    const podeSalvar = temCitacao && !!board && !!primeiroEstagio && !salvando;
    // O deal já existe, só falta a nota de auditoria pegar.
    const aguardandoRetentativaDeNota = dealIdCriado !== null;

    /**
     * Cria a nota de auditoria, com uma retentativa automática (falha
     * transiente não deve incomodar o usuário). Retorna o erro final, se
     * as duas tentativas falharem.
     */
    async function criarNotaComRetryAutomatico(dealId: string): Promise<unknown> {
        const conteudo = montarNota(result, citacao, dataCitacao);
        const primeira = await dealNotesService.createNote(dealId, conteudo);
        if (!primeira.error) return null;
        const segunda = await dealNotesService.createNote(dealId, conteudo);
        return segunda.error ?? null;
    }

    /**
     * Retentativa manual, disparada pelo usuário quando as duas tentativas
     * automáticas já falharam. NUNCA cria um novo deal — só regrava a nota
     * no deal que já existe, para não duplicar o negócio.
     */
    async function retentarNota() {
        if (!dealIdCriado || salvando) return;
        setSalvando(true);
        setErro(null);
        try {
            const conteudo = montarNota(result, citacao, dataCitacao);
            const { error } = await dealNotesService.createNote(dealIdCriado, conteudo);
            if (error) {
                setErro(
                    `O negócio já foi salvo, mas a nota de auditoria continua sem gravar: ${mensagemDeErro(error)}. Tente novamente.`
                );
                return;
            }
            onSaved(dealIdCriado);
            onClose();
        } catch (e) {
            setErro(e instanceof Error ? e.message : 'Falha ao gravar a nota de auditoria.');
        } finally {
            setSalvando(false);
        }
    }

    /**
     * Cancelar. Enquanto nenhum deal existe, é só fechar. Depois que o deal
     * foi criado e a nota ainda não pegou, cancelar sem desfazer o deal
     * deixaria exatamente o buraco que este modal existe para fechar: negócio
     * no CRM sem a citação que o justifica. Por isso o cancelamento aqui
     * primeiro apaga o deal órfão, e só fecha se a remoção der certo — a
     * empresa continua na lista do Radar, pronta para salvar de novo.
     */
    async function cancelar() {
        if (cancelando || salvando) return;
        if (!dealIdCriado) {
            onClose();
            return;
        }
        setCancelando(true);
        setErro(null);
        try {
            await deleteDeal.mutateAsync(dealIdCriado);
            onClose();
        } catch (e) {
            setErro(
                `Não foi possível desfazer o negócio criado sem a nota de auditoria: ${mensagemDeErro(e)}. O negócio continua no CRM sem a nota — tente cancelar de novo.`
            );
        } finally {
            setCancelando(false);
        }
    }

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

            setDealIdCriado(criado.id);

            const erroNota = await criarNotaComRetryAutomatico(criado.id);
            if (erroNota) {
                // O negócio já existe — manter o modal aberto e trocar a ação
                // principal para retentar só a nota, nunca criar outro deal.
                setErro(
                    `O negócio foi salvo, mas a nota de auditoria não foi gravada: ${mensagemDeErro(erroNota)}. Tente novamente.`
                );
                return;
            }

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
                        className="w-full rounded-md border border-slate-200 bg-transparent p-2 text-sm disabled:cursor-not-allowed disabled:bg-slate-100 disabled:opacity-70 dark:border-slate-700 dark:disabled:bg-slate-800"
                        value={citacao}
                        onChange={(e) => setCitacao(e.target.value)}
                        placeholder="Cole o trecho da avaliação, ou escreva sua observação à mão."
                        disabled={aguardandoRetentativaDeNota}
                    />
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                        {aguardandoRetentativaDeNota
                            ? 'Citação travada: o negócio já foi criado com este texto. A nota tem de sair igual a ele.'
                            : 'Sem citação não há lead. Alvo é dor reclamada publicamente, nunca ausência.'}
                    </p>
                </div>

                <div className="space-y-1">
                    <Label htmlFor="radar-data-citacao">Data da avaliação</Label>
                    <Input
                        id="radar-data-citacao"
                        type="date"
                        value={dataCitacao}
                        onChange={(e) => setDataCitacao(e.target.value)}
                        disabled={aguardandoRetentativaDeNota}
                    />
                    {aguardandoRetentativaDeNota && (
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                            Data travada junto com a citação.
                        </p>
                    )}
                </div>

                {erro && <p className="text-sm text-red-600 dark:text-red-400">{erro}</p>}

                <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={cancelar} disabled={salvando || cancelando}>
                        {cancelando ? 'Cancelando…' : 'Cancelar'}
                    </Button>
                    <Button
                        onClick={aguardandoRetentativaDeNota ? retentarNota : salvar}
                        disabled={aguardandoRetentativaDeNota ? salvando : !podeSalvar}
                    >
                        {salvando
                            ? 'Salvando…'
                            : aguardandoRetentativaDeNota
                                ? 'Tentar gravar a nota novamente'
                                : 'Salvar no CRM'}
                    </Button>
                </div>
            </div>
        </div>
    );
}
