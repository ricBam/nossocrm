'use client';

import { useMemo, useState } from 'react';
import { Radar as RadarIcon } from 'lucide-react';
import { useRadarBudget, useRadarSearch } from '@/lib/query/hooks/useRadarQuery';
import { EmptyState } from '@/components/ui/EmptyState';
import { SearchForm, type SearchFilters } from './components/SearchForm';
import { ResultCard } from './components/ResultCard';
import { ReviewsPanel } from './components/ReviewsPanel';
import { SaveToCrmModal } from './components/SaveToCrmModal';
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
 * porque sumir com ela esconderia o motivo. Filtro aqui é fila de leitura.
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
    const [filters, setFilters] = useState<SearchFilters>(FILTROS_INICIAIS);
    const [lendo, setLendo] = useState<RadarResultDTO | null>(null);
    const [salvando, setSalvando] = useState<RadarResultDTO | null>(null);
    const [citacaoSugerida, setCitacaoSugerida] = useState<{ quote: string; date: string | null } | null>(null);
    // Id do resultado sendo apagado agora, não um boolean global — senão o
    // delete de um card desabilitaria o botão Apagar de todos os outros.
    const [apagandoId, setApagandoId] = useState<string | null>(null);
    const [erroAoApagar, setErroAoApagar] = useState<string | null>(null);
    const [ultimaBusca, setUltimaBusca] = useState<RadarSearchVars | null>(null);

    const results = search.data?.results ?? [];
    const visiveis = useMemo(() => aplicarFiltros(results, filters), [results, filters]);

    // Recarrega a busca com `refresh: false` para pegar a lista atualizada sem
    // gastar de novo — cai no cache dos 30 dias.
    //
    // ResultCard chama isto sem `await`/`.catch` (é um `onClick`), então o
    // catch precisa estar AQUI — senão uma falha vira unhandled rejection e o
    // usuário não fica sabendo que o apagar não aconteceu.
    async function apagar(r: RadarResultDTO) {
        setApagandoId(r.id);
        setErroAoApagar(null);
        try {
            const res = await fetch(`/api/radar/results/${r.id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Falha ao apagar.');
            if (ultimaBusca) await search.mutateAsync({ ...ultimaBusca, refresh: false });
        } catch (err) {
            setErroAoApagar(err instanceof Error ? err.message : 'Falha ao apagar.');
        } finally {
            setApagandoId(null);
        }
    }

    return (
        <div className="grid gap-6 p-4 lg:grid-cols-[320px_1fr]">
            <aside className="space-y-4">
                <div>
                    <h1 className="text-xl font-semibold">Radar de Clientes</h1>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                        Busca empresas no Google Maps. Só entra no CRM com citação literal e data.
                    </p>
                </div>
                <SearchForm
                    budget={budget}
                    isBudgetLoading={isBudgetLoading}
                    isBudgetError={isBudgetError}
                    isSearching={search.isPending}
                    filters={filters}
                    onFiltersChange={setFilters}
                    onSubmit={(vars) => { setUltimaBusca(vars); search.mutate(vars); }}
                />
            </aside>

            <section className="space-y-3">
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

                {search.data && (
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                        {search.data.origin === 'cache'
                            ? `Resultado do cache, buscado em ${new Date(search.data.cachedAt!).toLocaleString('pt-BR')}. Não gastou nada.`
                            : `Busca ao vivo. Custo real: US$ ${search.data.costUsd.toFixed(4)}.`}
                        {' '}
                        {visiveis.length} de {results.length} empresas visíveis com os filtros atuais.
                    </p>
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
                            onOpenReviews={setLendo}
                            onSave={setSalvando}
                            onDelete={apagar}
                            deleting={apagandoId === r.id}
                        />
                    ))}
                </div>
            </section>

            {lendo && (
                <ReviewsPanel
                    result={lendo}
                    onClose={() => setLendo(null)}
                    onUseQuote={(quote, date) => {
                        setCitacaoSugerida({ quote, date });
                        setSalvando(lendo);
                        setLendo(null);
                    }}
                />
            )}

            {salvando && (
                <SaveToCrmModal
                    key={citacaoSugerida?.quote ?? salvando.id}
                    result={salvando}
                    initialQuote={citacaoSugerida?.quote ?? ''}
                    initialQuoteDate={citacaoSugerida?.date ?? ''}
                    onClose={() => { setSalvando(null); setCitacaoSugerida(null); }}
                    onSaved={() => { setSalvando(null); setCitacaoSugerida(null); }}
                />
            )}
        </div>
    );
}
