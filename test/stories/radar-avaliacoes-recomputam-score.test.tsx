import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
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
    score: 3,
    breakdown: [
        { label: 'Sem site', points: 3, matched: true },
        { label: 'Avaliação recente casa com o âncora', points: 3, matched: false, pending: true },
    ],
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

const reviewsMutateAsync = vi.fn();

// `ReviewsPanel` chama `useRadarReviews` do mesmo módulo que `RadarPage` chama
// `useRadarBudget`/`useRadarSearch` — mockar o módulo inteiro evita rede real
// e deixa o teste focado no fio score -> card, que é o que a Finding 5 cobre.
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
    useRadarReviews: () => ({
        mutateAsync: reviewsMutateAsync,
        isPending: false,
        isError: false,
        error: null,
    }),
}));

// `onUseQuote` abre o `SaveToCrmModal` — mocks mínimos para ele renderizar
// sem tocar rede real, iguais aos de `radar-salvar-exige-citacao.test.tsx`.
vi.mock('@/lib/query/hooks/useDealsQuery', () => ({
    useCreateDealWithContact: () => ({ mutateAsync: vi.fn(), isPending: false }),
    useDeleteDeal: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('@/lib/query/hooks/useContactsQuery', () => ({
    useDeleteContact: () => ({ mutateAsync: vi.fn(), isPending: false }),
    useDeleteCompany: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('@/lib/query/hooks/useBoardsQuery', () => ({
    useDefaultBoard: () => ({
        data: {
            id: 'b0a1d000-0000-4000-8000-0000000000ff',
            name: 'Prospecção R.A.F.O',
            stages: [{ id: 'b0a1d000-0000-4000-8000-000000000000', label: 'Radar', order: 0 }],
        },
    }),
}));
vi.mock('@/context/AuthContext', () => ({
    useAuth: () => ({ user: { id: 'u1', email: 'ric2bam@gmail.com' }, profile: { nickname: 'Ricardo' }, organizationId: 'org1' }),
}));
vi.mock('@/lib/supabase/dealNotes', () => ({
    dealNotesService: { createNote: vi.fn().mockResolvedValue({ error: null }) },
}));

const REVIEW_COM_TERMO = {
    reviewId: 'r1',
    text: 'Liguei três vezes e ninguém responde.',
    stars: 1,
    publishedAt: '2026-07-01T00:00:00.000Z',
    reviewerName: 'Fulano',
};
const REVIEW_SEM_TERMO = {
    reviewId: 'r2',
    text: 'Adorei o atendimento, recomendo muito.',
    stars: 5,
    publishedAt: '2026-06-20T00:00:00.000Z',
    reviewerName: 'Ciclana',
};

beforeEach(() => {
    reviewsMutateAsync.mockReset();
});

function renderPage() {
    return render(React.createElement(RadarPage));
}

function abrirPainelEPuxar() {
    fireEvent.click(screen.getByRole('button', { name: /ler avaliações/i }));
    fireEvent.click(screen.getByRole('button', { name: /puxar avaliações/i }));
}

describe('Buscar avaliações recomputa o score do card', () => {
    it('o card mostra "pendente" antes da busca e o score resolvido depois', async () => {
        reviewsMutateAsync.mockResolvedValue({
            reviews: [REVIEW_COM_TERMO],
            costUsd: 0.002,
            score: 6,
            breakdown: [
                { label: 'Sem site', points: 3, matched: true },
                { label: 'Avaliação recente casa com o âncora', points: 3, matched: true },
            ],
        });

        renderPage();
        expect(screen.getByText(/score 3/i)).toBeInTheDocument();
        expect(screen.getByText(/pendente, puxe as avaliações/i)).toBeInTheDocument();

        abrirPainelEPuxar();

        await vi.waitFor(() => expect(screen.getByText(/score 6/i)).toBeInTheDocument());
        expect(screen.queryByText(/pendente, puxe as avaliações/i)).not.toBeInTheDocument();
    });
});

describe('Painel de avaliações não afirma um filtro que não existe', () => {
    it('cabeçalho e estado vazio deixam de dizer "filtradas pelos termos do âncora"', async () => {
        reviewsMutateAsync.mockResolvedValue({ reviews: [], costUsd: 0, score: 0, breakdown: [] });

        renderPage();
        fireEvent.click(screen.getByRole('button', { name: /ler avaliações/i }));

        expect(screen.queryByText(/filtradas pelos termos do âncora/i)).not.toBeInTheDocument();
        expect(screen.getByText(/últimos 180 dias/i)).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /puxar avaliações/i }));

        expect(await screen.findByText(/nenhuma avaliação nos últimos 180 dias/i)).toBeInTheDocument();
        expect(screen.queryByText(/casou com os termos do âncora/i)).not.toBeInTheDocument();
    });

    it('marca visivelmente a avaliação sem nenhum termo do âncora, sem escondê-la', async () => {
        reviewsMutateAsync.mockResolvedValue({
            reviews: [REVIEW_COM_TERMO, REVIEW_SEM_TERMO],
            costUsd: 0.004,
            score: 6,
            breakdown: [],
        });

        renderPage();
        abrirPainelEPuxar();

        await screen.findByText(REVIEW_SEM_TERMO.text);

        const itens = screen.getAllByRole('listitem');
        expect(itens).toHaveLength(2);
        // A avaliação com termo do âncora não ganha o selo.
        expect(within(itens[0]).queryByText(/sem termo do âncora/i)).not.toBeInTheDocument();
        // A avaliação sem nenhum termo continua na lista, só marcada — nunca some.
        expect(within(itens[1]).getByText(/sem termo do âncora/i)).toBeInTheDocument();
        expect(within(itens[1]).getByRole('button', { name: /usar como citação/i })).toBeEnabled();
    });
});

describe('Citação promovida de uma avaliação pré-preenche a data', () => {
    it('"Usar como citação" abre o Salvar no CRM com citação e data já prontas', async () => {
        reviewsMutateAsync.mockResolvedValue({
            reviews: [REVIEW_COM_TERMO],
            costUsd: 0.002,
            score: 6,
            breakdown: [],
        });

        renderPage();
        abrirPainelEPuxar();
        await screen.findByRole('button', { name: /usar como citação/i });

        fireEvent.click(screen.getByRole('button', { name: /usar como citação/i }));

        const citacaoInput = await screen.findByLabelText(/citação literal/i);
        const dataInput = screen.getByLabelText(/data da avaliação/i);
        expect(citacaoInput).toHaveValue(REVIEW_COM_TERMO.text);
        expect(dataInput).toHaveValue('2026-07-01');
        // Citação e data já vieram prontas — nenhuma edição manual é necessária.
        // O card por trás também tem um botão "Salvar no CRM": escopar ao modal.
        const modal = citacaoInput.closest('.space-y-4') as HTMLElement;
        expect(within(modal).getByRole('button', { name: /salvar no crm/i })).toBeEnabled();
    });
});
