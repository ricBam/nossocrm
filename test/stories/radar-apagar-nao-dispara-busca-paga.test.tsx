/**
 * "Apagar" nunca pode virar uma busca paga.
 *
 * A tela recarregava a lista depois do delete chamando a busca com
 * `refresh: false`, no pressuposto de que isso é sempre um cache hit. Mas o
 * cache exige `partial = false`: depois de um run que estourou o tempo, ou cuja
 * gravação falhou, não existe linha cacheável — e esse "recarregar de graça"
 * vira um run novo do Apify de até US$ 0,40, disparado por um botão escrito
 * Apagar.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { RadarPage } from '@/features/radar/RadarPage';
import type { RadarResultDTO, SearchResponse } from '@/app/api/radar/search/route';

const RESULT: RadarResultDTO = {
    id: 'res_1',
    place: {
        placeId: 'ChIJ_1', title: 'Clínica Sorriso', categoryName: 'Clínica odontológica',
        address: 'Rua A, 100', city: 'Resende', phone: '+552433001122', website: null, socials: [],
        totalScore: 4.2, reviewsCount: 90, url: null,
        source: 'google_maps', collectedAt: '2026-08-31T00:00:00.000Z',
    },
    score: 6,
    breakdown: [],
    disqualified: false,
    disqualifyReasons: [],
    duplicate: { isDuplicate: false, reasons: [] },
    savedDealId: null,
};

const respostaBase: SearchResponse = {
    searchId: 'search_1',
    origin: 'live',
    costUsd: 0.01,
    cachedAt: null,
    partial: false,
    budget: { allowed: true, level: 'ok', spentUsd: 0, estimateUsd: 0, projectedUsd: 0, remainingUsd: 5, budgetUsd: 5 },
    results: [RESULT],
};

// Mutável porque `vi.mock` é içado: cada teste ajusta `partial` antes de render.
const estado: { data: SearchResponse } = { data: respostaBase };
const mutateAsync = vi.fn();
const mutate = vi.fn();

vi.mock('@/lib/query/hooks/useRadarQuery', () => ({
    useRadarBudget: () => ({ data: undefined, isLoading: false, isError: false }),
    useRadarSearch: () => ({
        data: estado.data,
        isPending: false,
        isError: false,
        error: null,
        mutate,
        mutateAsync,
    }),
}));

const fetchMock = vi.fn();

beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ deletedResult: true, deletedDealId: null }) });
    mutateAsync.mockReset();
    mutate.mockReset();
    estado.data = respostaBase;
    vi.stubGlobal('fetch', fetchMock);
});

/** Renderiza e faz uma busca, para que a tela tenha `ultimaBusca` guardada. */
function renderComBuscaFeita() {
    render(React.createElement(RadarPage));
    fireEvent.change(screen.getByLabelText('Nicho'), { target: { value: 'dentista' } });
    fireEvent.change(screen.getByLabelText('Cidade'), { target: { value: 'Resende' } });
    fireEvent.click(screen.getByRole('button', { name: /^buscar$/i }));
    expect(mutate).toHaveBeenCalledTimes(1);
}

async function apagarOCard() {
    fireEvent.click(screen.getByRole('button', { name: /^apagar$/i }));
    fireEvent.click(screen.getByRole('button', { name: /confirmar\?/i }));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
}

describe('Apagar depois de uma busca parcial', () => {
    it('não chama a busca de novo — o card sai por estado local', async () => {
        estado.data = { ...respostaBase, partial: true };
        renderComBuscaFeita();

        await apagarOCard();

        expect(fetchMock).toHaveBeenCalledWith('/api/radar/results/res_1', { method: 'DELETE' });
        // Nenhuma busca disparada: uma busca parcial não tem linha de cache, e
        // `refresh: false` aqui custaria dinheiro de verdade.
        expect(mutateAsync).not.toHaveBeenCalled();
        // Mesmo sem recarregar, o card apagado sai da tela.
        await vi.waitFor(() =>
            expect(screen.queryByText('Clínica Sorriso')).not.toBeInTheDocument()
        );
    });
});

describe('Apagar depois de uma busca completa', () => {
    it('recarrega pelo cache, que é gratuito', async () => {
        estado.data = { ...respostaBase, partial: false };
        renderComBuscaFeita();

        await apagarOCard();

        await vi.waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
        expect(mutateAsync).toHaveBeenCalledWith(
            expect.objectContaining({ nicho: 'dentista', cidade: 'Resende', refresh: false })
        );
    });
});
