'use client';

import { useMemo, useState } from 'react';
import { Radar as RadarIcon } from 'lucide-react';
import { useRadarBudget, useRadarSearch } from '@/lib/query/hooks/useRadarQuery';
import { EmptyState } from '@/components/ui/EmptyState';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SearchForm, type SearchFilters } from './components/SearchForm';
import { ResultCard } from './components/ResultCard';
import { ResultDetail } from './components/ResultDetail';
import { useSaveToCrm } from './hooks/useSaveToCrm';
import type { RadarResultDTO } from '@/app/api/radar/search/route';
import type { RadarSearchVars } from '@/lib/query/hooks/useRadarQuery';

const FILTROS_INICIAIS: SearchFilters = {
    semSite: false,
    semRedeSocial: false,
    notaMin: null,
    notaMax: null,
    minAvaliacoes: null,
    ordenarPor: 'score',
};

/**
 * Aplica os filtros de descoberta e a ordenação.
 *
 * ⚠️ Isto NUNCA remove empresa desqualificada da lista: ela aparece marcada,
 * porque sumir com ela esconderia o motivo. `semSite`/`semRedeSocial`/notas
 * SÃO qualificação de verdade — removem da lista quem não bate.
 */
function aplicarFiltros(results: RadarResultDTO[], f: SearchFilters): RadarResultDTO[] {
    const filtrados = results.filter((r) => {
        const p = r.place;
        if (f.semSite && p.website) return false;
        if (f.semRedeSocial && p.socials.length > 0) return false;
        if (f.notaMin !== null && (p.totalScore ?? 0) < f.notaMin) return false;
        if (f.notaMax !== null && (p.totalScore ?? 0) > f.notaMax) return false;
        if (f.minAvaliacoes !== null && (p.reviewsCount ?? 0) < f.minAvaliacoes) return false;
        return true;
    });

    return [...filtrados].sort((a, b) => {
        if (f.ordenarPor === 'nota') return (b.place.totalScore ?? 0) - (a.place.totalScore ?? 0);
        if (f.ordenarPor === 'avaliacoes') return (b.place.reviewsCount ?? 0) - (a.place.reviewsCount ?? 0);
        return b.score - a.score;
    });
}

export function RadarPage() {
    const { data: budget, isLoading: isBudgetLoading, isError: isBudgetError } = useRadarBudget();
    const search = useRadarSearch();
    const { salvar: salvarNoCrm } = useSaveToCrm();
    const [filters, setFilters] = useState<SearchFilters>(FILTROS_INICIAIS);
    const [verDetalhe, setVerDetalhe] = useState<RadarResultDTO | null>(null);
    // Id do resultado sendo apagado/salvo agora, não um boolean global — senão
    // a ação de um card desabilitaria o botão dos outros.
    const [apagandoId, setApagandoId] = useState<string | null>(null);
    const [erroAoApagar, setErroAoApagar] = useState<string | null>(null);
    const [salvandoId, setSalvandoId] = useState<string | null>(null);
    const [erroAoSalvar, setErroAoSalvar] = useState<string | null>(null);
    const [ultimaBusca, setUltimaBusca] = useState<RadarSearchVars | null>(null);
    // Ids já apagados no servidor. A lista vem de `search.data`, que é imutável
    // aqui, então é este conjunto que tira o card da tela quando não dá para
    // recarregar de graça.
    const [apagados, setApagados] = useState<string[]>([]);
    // Deal id de cada resultado salvo agora mesmo, por id. `search.data` é
    // imutável aqui, então esta é a forma de o card virar "Salva" sem refazer
    // a busca.
    const [salvos, setSalvos] = useState<Record<string, string>>({});
    // Ids marcados para salvamento em lote.
    const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
    const [salvandoLote, setSalvandoLote] = useState(false);

    const results = useMemo(
        () =>
            (search.data?.results ?? [])
                .filter((r) => !apagados.includes(r.id))
                .map((r) => (salvos[r.id] ? { ...r, savedDealId: salvos[r.id] } : r)),
        [search.data, apagados, salvos]
    );
    const visiveis = useMemo(() => aplicarFiltros(results, filters), [results, filters]);

    // O card sai da tela SEMPRE por estado local. O recarregamento por cima
    // disso é opcional e só acontece quando é comprovadamente grátis.
    //
    // ⚠️ `refresh: false` só é grátis quando existe linha cacheável para esta
    // busca, e o cache exige `partial = false`. Depois de uma busca parcial
    // (timeout do run ou falha de gravação) não há linha cacheável, então esse
    // "recarregar" viraria um run novo do Apify — até US$ 0,40 disparados por
    // um botão escrito Apagar. Nesse caso não se recarrega nada.
    //
    // ResultCard/ResultDetail chamam isto sem `await`/`.catch` (é um `onClick`),
    // então o catch precisa estar AQUI — senão uma falha vira unhandled
    // rejection e o usuário não fica sabendo que o apagar não aconteceu.
    async function apagar(r: RadarResultDTO) {
        setApagandoId(r.id);
        setErroAoApagar(null);
        try {
            const res = await fetch(`/api/radar/results/${r.id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Falha ao apagar.');
            setApagados((atuais) => (atuais.includes(r.id) ? atuais : [...atuais, r.id]));
            setSelecionados((atuais) => {
                if (!atuais.has(r.id)) return atuais;
                const novo = new Set(atuais);
                novo.delete(r.id);
                return novo;
            });
            if (ultimaBusca && search.data && !search.data.partial) {
                await search.mutateAsync({ ...ultimaBusca, refresh: false });
            }
        } catch (err) {
            setErroAoApagar(err instanceof Error ? err.message : 'Falha ao apagar.');
        } finally {
            setApagandoId(null);
        }
    }

    // Um clique salva — sem modal, sem exigir citação. ResultCard/ResultDetail
    // chamam isto sem `await`/`.catch` (é um `onClick`), então o catch precisa
    // estar AQUI, senão uma falha vira unhandled rejection.
    async function salvar(r: RadarResultDTO) {
        setSalvandoId(r.id);
        setErroAoSalvar(null);
        try {
            const dealId = await salvarNoCrm(r);
            setSalvos((atuais) => ({ ...atuais, [r.id]: dealId }));
        } catch (err) {
            setErroAoSalvar(err instanceof Error ? err.message : 'Falha ao salvar no CRM.');
        } finally {
            setSalvandoId(null);
        }
    }

    function alternarSelecao(r: RadarResultDTO, marcado: boolean) {
        setSelecionados((atuais) => {
            const novo = new Set(atuais);
            if (marcado) novo.add(r.id);
            else novo.delete(r.id);
            return novo;
        });
    }

    // Salva um por vez (nunca em paralelo — cada um cria deal+contato+empresa
    // própria, e criações em paralelo arriscam corrida no board padrão). Uma
    // falha num não trava os outros; as falhas se acumulam numa mensagem só.
    async function salvarSelecionados() {
        const alvos = visiveis.filter((r) => selecionados.has(r.id) && !r.savedDealId);
        if (alvos.length === 0) return;
        setSalvandoLote(true);
        setErroAoSalvar(null);
        const falhas: string[] = [];
        for (const r of alvos) {
            setSalvandoId(r.id);
            try {
                const dealId = await salvarNoCrm(r);
                setSalvos((atuais) => ({ ...atuais, [r.id]: dealId }));
            } catch (err) {
                falhas.push(`${r.place.title}: ${err instanceof Error ? err.message : 'falha desconhecida'}`);
            }
        }
        setSalvandoId(null);
        setSalvandoLote(false);
        setSelecionados(new Set());
        if (falhas.length > 0) {
            setErroAoSalvar(`Falha ao salvar ${falhas.length} de ${alvos.length}: ${falhas.join(' · ')}`);
        }
    }

    return (
        <div className="grid gap-6 md:p-4 lg:grid-cols-[320px_1fr]">
            <aside className="min-w-0 space-y-4">
                <div>
                    <h1 className="text-xl font-semibold">Radar de Clientes</h1>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                        Busca empresas no Google Maps e salva direto no CRM.
                    </p>
                </div>
                <SearchForm
                    budget={budget}
                    isBudgetLoading={isBudgetLoading}
                    isBudgetError={isBudgetError}
                    isSearching={search.isPending}
                    filters={filters}
                    onFiltersChange={setFilters}
                    onSubmit={(vars) => {
                        setUltimaBusca(vars);
                        // Lista nova, conjunto de apagados e seleção zerados:
                        // nada da busca anterior vaza para esta.
                        setApagados([]);
                        setSelecionados(new Set());
                        search.mutate(vars);
                    }}
                />
            </aside>

            <section className="min-w-0 space-y-3">
                {search.isError && (
                    <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">
                        {search.error.message}
                    </div>
                )}

                {erroAoApagar && (
                    <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">
                        {erroAoApagar}
                    </div>
                )}

                {erroAoSalvar && (
                    <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">
                        {erroAoSalvar}
                    </div>
                )}

                {search.data && (
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                            {search.data.origin === 'cache'
                                ? `Resultado do cache, buscado em ${new Date(search.data.cachedAt!).toLocaleString('pt-BR')}. Não gastou nada.`
                                : `Busca ao vivo. Custo real: US$ ${search.data.costUsd.toFixed(4)}.`}
                            {' '}
                            {visiveis.length} de {results.length} empresas visíveis com os filtros atuais.
                        </p>
                        {selecionados.size > 0 && (
                            <div className="flex flex-wrap items-center gap-2">
                                <Badge variant="secondary">{selecionados.size} marcados</Badge>
                                <Button size="sm" disabled={salvandoLote} onClick={salvarSelecionados}>
                                    {salvandoLote ? 'Salvando…' : `Salvar os ${selecionados.size} como leads`}
                                </Button>
                            </div>
                        )}
                    </div>
                )}

                {!search.data && !search.isPending && (
                    <EmptyState
                        icon={RadarIcon}
                        title="Nenhuma busca ainda"
                        description="Preencha nicho e cidade e clique em Buscar. A busca só roda no clique — nada é consultado enquanto você digita."
                    />
                )}

                <div className="grid gap-3 md:grid-cols-2">
                    {visiveis.map((r) => (
                        <ResultCard
                            key={r.id}
                            result={r}
                            selected={selecionados.has(r.id)}
                            onToggleSelect={alternarSelecao}
                            onOpenDetail={setVerDetalhe}
                            onSave={salvar}
                            onDelete={apagar}
                            saving={salvandoId === r.id}
                            deleting={apagandoId === r.id}
                        />
                    ))}
                </div>
            </section>

            {verDetalhe && (
                <ResultDetail
                    result={verDetalhe}
                    onClose={() => setVerDetalhe(null)}
                    onSave={salvar}
                    onDelete={(r) => { setVerDetalhe(null); void apagar(r); }}
                    saving={salvandoId === verDetalhe.id}
                />
            )}
        </div>
    );
}
