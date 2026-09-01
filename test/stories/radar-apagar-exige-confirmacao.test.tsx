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

const SEARCH_DATA: SearchResponse = {
    searchId: 'search_1',
    origin: 'live',
    costUsd: 0.01,
    cachedAt: null,
    partial: false,
    budget: { allowed: true, level: 'ok', spentUsd: 0, estimateUsd: 0, projectedUsd: 0, remainingUsd: 5, budgetUsd: 5 },
    results: [RESULT],
};

const mutateAsync = vi.fn();

// A tela nunca dispara uma busca de verdade nesta story: o hook já vem com
// `data` preenchido, então `RadarPage` renderiza o card sem precisar de rede.
vi.mock('@/lib/query/hooks/useRadarQuery', () => ({
    useRadarBudget: () => ({ data: undefined, isLoading: false, isError: false }),
    useRadarSearch: () => ({
        data: SEARCH_DATA,
        isPending: false,
        isError: false,
        error: null,
        mutate: vi.fn(),
        mutateAsync,
    }),
}));

const fetchMock = vi.fn();

beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ deletedResult: true, deletedDealId: null }) });
    mutateAsync.mockReset();
    vi.stubGlobal('fetch', fetchMock);
});

function renderPage() {
    return render(React.createElement(RadarPage));
}

describe('Apagar exige confirmação em dois cliques', () => {
    it('o primeiro clique não chama o endpoint DELETE — só troca o rótulo para "Confirmar?"', async () => {
        renderPage();
        const botao = screen.getByRole('button', { name: /apagar/i });

        fireEvent.click(botao);

        expect(fetchMock).not.toHaveBeenCalled();
        expect(screen.getByRole('button', { name: /confirmar\?/i })).toBeInTheDocument();
    });

    it('o segundo clique chama o DELETE do resultado certo', async () => {
        renderPage();
        const botao = screen.getByRole('button', { name: /apagar/i });

        fireEvent.click(botao);
        fireEvent.click(screen.getByRole('button', { name: /confirmar\?/i }));

        await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
        expect(fetchMock).toHaveBeenCalledWith('/api/radar/results/res_1', { method: 'DELETE' });
    });

    it('perder o foco do botão desarma a confirmação', async () => {
        renderPage();
        const botao = screen.getByRole('button', { name: /apagar/i });

        fireEvent.click(botao);
        expect(screen.getByRole('button', { name: /confirmar\?/i })).toBeInTheDocument();

        fireEvent.blur(screen.getByRole('button', { name: /confirmar\?/i }));
        expect(screen.getByRole('button', { name: /^apagar$/i })).toBeInTheDocument();
        expect(fetchMock).not.toHaveBeenCalled();
    });
});
