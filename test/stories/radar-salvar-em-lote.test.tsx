/**
 * Marcar vários cards e salvar todos de uma vez, sem passar um por um.
 * Cada empresa ainda cria seu próprio deal — o lote só evita repetir o clique.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { RadarPage } from '@/features/radar/RadarPage';
import type { RadarResultDTO, SearchResponse } from '@/app/api/radar/search/route';

function place(over: Partial<RadarResultDTO['place']> = {}): RadarResultDTO['place'] {
    return {
        placeId: 'ChIJ_1', title: 'Clínica Sorriso', categoryName: 'Clínica odontológica',
        address: 'Rua A, 100', city: 'Resende', phone: '+552433001122', website: null, socials: [],
        totalScore: 4.2, reviewsCount: 90, url: null,
        source: 'google_maps', collectedAt: '2026-08-31T00:00:00.000Z',
        ...over,
    };
}

const RESULT_1: RadarResultDTO = {
    id: 'res_1', place: place({ placeId: 'ChIJ_1', title: 'Clínica Sorriso' }),
    score: 6, breakdown: [], disqualified: false, disqualifyReasons: [],
    duplicate: { isDuplicate: false, reasons: [] }, savedDealId: null,
};
const RESULT_2: RadarResultDTO = {
    id: 'res_2', place: place({ placeId: 'ChIJ_2', title: 'Clínica Feliz' }),
    score: 4, breakdown: [], disqualified: false, disqualifyReasons: [],
    duplicate: { isDuplicate: false, reasons: [] }, savedDealId: null,
};

const SEARCH_DATA: SearchResponse = {
    searchId: 'search_1', origin: 'live', costUsd: 0.01, cachedAt: null, partial: false,
    budget: { allowed: true, level: 'ok', spentUsd: 0, estimateUsd: 0, projectedUsd: 0, remainingUsd: 5, budgetUsd: 5 },
    results: [RESULT_1, RESULT_2],
};

vi.mock('@/lib/query/hooks/useRadarQuery', () => ({
    useRadarBudget: () => ({ data: undefined, isLoading: false, isError: false }),
    useRadarSearch: () => ({
        data: SEARCH_DATA, isPending: false, isError: false, error: null,
        mutate: vi.fn(), mutateAsync: vi.fn(),
    }),
}));

const criarDeal = vi.fn();
vi.mock('@/lib/query/hooks/useDealsQuery', () => ({
    useCreateDealWithContact: () => ({ mutateAsync: (...a: unknown[]) => criarDeal(...a), isPending: false }),
}));
vi.mock('@/lib/query/hooks/useBoardsQuery', () => ({
    useDefaultBoard: () => ({
        data: {
            id: 'b0a1d000-0000-4000-8000-0000000000ff', name: 'Prospecção R.A.F.O',
            stages: [{ id: 'b0a1d000-0000-4000-8000-000000000000', label: 'Radar', order: 0 }],
        },
    }),
}));
vi.mock('@/context/AuthContext', () => ({
    useAuth: () => ({ user: { id: 'u1', email: 'ric2bam@gmail.com' }, profile: { nickname: 'Ricardo' } }),
}));
vi.mock('@/lib/supabase/dealNotes', () => ({
    dealNotesService: { createNote: vi.fn().mockResolvedValue({ error: null }) },
}));

const fetchMock = vi.fn();

beforeEach(() => {
    criarDeal.mockReset();
    fetchMock.mockReset().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);
});

function renderPage() {
    return render(React.createElement(RadarPage));
}

function marcar(nome: string) {
    fireEvent.click(screen.getByRole('checkbox', { name: new RegExp(`marcar ${nome}`, 'i') }));
}

describe('Salvar vários leads de uma vez', () => {
    it('a barra de lote fica escondida enquanto nada está marcado', () => {
        renderPage();
        expect(screen.queryByText(/marcados/i)).not.toBeInTheDocument();
    });

    it('marcar dois cards mostra "2 marcados" e o botão de salvar em lote', () => {
        renderPage();
        marcar('Clínica Sorriso');
        marcar('Clínica Feliz');
        expect(screen.getByText('2 marcados')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /salvar os 2 como leads/i })).toBeInTheDocument();
    });

    it('salva os dois marcados, um deal por empresa, e limpa a seleção no final', async () => {
        criarDeal
            .mockResolvedValueOnce({ id: 'deal_1' })
            .mockResolvedValueOnce({ id: 'deal_2' });
        renderPage();
        marcar('Clínica Sorriso');
        marcar('Clínica Feliz');
        fireEvent.click(screen.getByRole('button', { name: /salvar os 2 como leads/i }));

        await vi.waitFor(() => expect(criarDeal).toHaveBeenCalledTimes(2));
        expect(criarDeal.mock.calls[0][0].relatedData.companyName).toBe('Clínica Sorriso');
        expect(criarDeal.mock.calls[1][0].relatedData.companyName).toBe('Clínica Feliz');

        await vi.waitFor(() => expect(screen.queryByText(/marcados/i)).not.toBeInTheDocument());
        expect(screen.getAllByRole('button', { name: /^salva$/i })).toHaveLength(2);
    });

    it('uma falha num item não impede o outro de salvar, e o erro cita quantos falharam', async () => {
        criarDeal
            .mockRejectedValueOnce(new Error('Supabase fora do ar'))
            .mockResolvedValueOnce({ id: 'deal_2' });
        renderPage();
        marcar('Clínica Sorriso');
        marcar('Clínica Feliz');
        fireEvent.click(screen.getByRole('button', { name: /salvar os 2 como leads/i }));

        await vi.waitFor(() => expect(criarDeal).toHaveBeenCalledTimes(2));
        expect(await screen.findByText(/falha ao salvar 1 de 2/i)).toBeInTheDocument();
        expect(screen.getAllByRole('button', { name: /^salva$/i })).toHaveLength(1);
    });
});
