/**
 * Salvar no CRM é um clique só — sem citação, sem data, sem modal.
 *
 * A citação deixou de ser portão de entrada: o usuário disse que não usa
 * (compensa com anotações no próprio deal) e que o fluxo em duas etapas
 * atrapalhava mais do que ajudava.
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
        totalScore: 4.2, reviewsCount: 90, url: 'https://maps.google.com/?cid=1',
        source: 'google_maps', collectedAt: '2026-08-31T00:00:00.000Z',
    },
    score: 6,
    breakdown: [{ label: 'Telefone presente', points: 1, matched: true }],
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

vi.mock('@/lib/query/hooks/useRadarQuery', () => ({
    useRadarBudget: () => ({ data: undefined, isLoading: false, isError: false }),
    useRadarSearch: () => ({
        data: SEARCH_DATA,
        isPending: false,
        isError: false,
        error: null,
        mutate: vi.fn(),
        mutateAsync: vi.fn(),
    }),
}));

const criarDeal = vi.fn();
vi.mock('@/lib/query/hooks/useDealsQuery', () => ({
    useCreateDealWithContact: () => ({ mutateAsync: (...a: unknown[]) => criarDeal(...a), isPending: false }),
}));
vi.mock('@/lib/query/hooks/useBoardsQuery', () => ({
    useDefaultBoard: () => ({
        data: {
            id: 'b0a1d000-0000-4000-8000-0000000000ff',
            name: 'Prospecção R.A.F.O',
            stages: [
                { id: 'b0a1d000-0000-4000-8000-000000000000', label: 'Radar', order: 0 },
                { id: 'b0a1d000-0000-4000-8000-000000000001', label: 'Abordado', order: 1 },
            ],
        },
    }),
}));
vi.mock('@/context/AuthContext', () => ({
    useAuth: () => ({ user: { id: 'u1', email: 'ric2bam@gmail.com' }, profile: { nickname: 'Ricardo' } }),
}));
const createNote = vi.fn();
vi.mock('@/lib/supabase/dealNotes', () => ({
    dealNotesService: { createNote: (...a: unknown[]) => createNote(...a) },
}));

const fetchMock = vi.fn();

beforeEach(() => {
    criarDeal.mockReset().mockResolvedValue({ id: 'deal_1', contactId: 'contact_1', clientCompanyId: 'company_1' });
    createNote.mockReset().mockResolvedValue({ error: null });
    fetchMock.mockReset().mockResolvedValue({ ok: true, json: async () => ({ savedDealId: 'deal_1' }) });
    vi.stubGlobal('fetch', fetchMock);
});

function renderPage() {
    return render(React.createElement(RadarPage));
}

describe('Salvar no CRM em um clique', () => {
    it('o botão Salvar já nasce habilitado, sem exigir nada além do clique', () => {
        renderPage();
        expect(screen.getByRole('button', { name: /salvar no crm/i })).toBeEnabled();
    });

    it('um clique cria o deal no primeiro estágio do board, sem passar por nenhum modal', async () => {
        renderPage();
        fireEvent.click(screen.getByRole('button', { name: /salvar no crm/i }));

        await vi.waitFor(() => expect(criarDeal).toHaveBeenCalledTimes(1));
        const args = criarDeal.mock.calls[0][0];
        expect(args.deal.boardId).toBe('b0a1d000-0000-4000-8000-0000000000ff');
        expect(args.deal.status).toBe('b0a1d000-0000-4000-8000-000000000000');
        expect(args.relatedData.companyName).toBe('Clínica Sorriso');

        // Nenhum modal de citação/data chega a existir.
        expect(screen.queryByLabelText(/citação/i)).not.toBeInTheDocument();
        expect(screen.queryByLabelText(/data da avaliação/i)).not.toBeInTheDocument();
    });

    it('anota os dados coletados no deal, sem exigir citação', async () => {
        renderPage();
        fireEvent.click(screen.getByRole('button', { name: /salvar no crm/i }));

        await vi.waitFor(() => expect(createNote).toHaveBeenCalledTimes(1));
        const [dealId, conteudo] = createNote.mock.calls[0];
        expect(dealId).toBe('deal_1');
        expect(conteudo).toContain('ChIJ_1');
        expect(conteudo).toContain('Telefone presente');
    });

    it('grava saved_deal_id e o card vira "Salva" depois do clique', async () => {
        renderPage();
        fireEvent.click(screen.getByRole('button', { name: /salvar no crm/i }));

        await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
            '/api/radar/results/res_1',
            expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ dealId: 'deal_1' }) })
        ));
        expect(await screen.findByRole('button', { name: /^salva$/i })).toBeDisabled();
    });

    it('uma falha ao gravar a nota não impede o deal de contar como salvo', async () => {
        createNote.mockResolvedValue({ error: new Error('timeout') });
        renderPage();
        fireEvent.click(screen.getByRole('button', { name: /salvar no crm/i }));

        // Duas tentativas automáticas de nota, e mesmo assim o deal conta como salvo.
        await vi.waitFor(() => expect(createNote).toHaveBeenCalledTimes(2));
        expect(await screen.findByRole('button', { name: /^salva$/i })).toBeInTheDocument();
    });

    it('uma falha ao criar o deal mostra o erro e não trava o resto da tela', async () => {
        criarDeal.mockRejectedValue(new Error('Supabase fora do ar'));
        renderPage();
        fireEvent.click(screen.getByRole('button', { name: /salvar no crm/i }));

        expect(await screen.findByText(/supabase fora do ar/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /salvar no crm/i })).toBeEnabled();
    });
});
