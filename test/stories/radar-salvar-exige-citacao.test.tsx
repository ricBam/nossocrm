import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { SaveToCrmModal } from '@/features/radar/components/SaveToCrmModal';
import type { RadarResultDTO } from '@/app/api/radar/search/route';

const criarDeal = vi.fn().mockResolvedValue({ id: 'deal_1' });

vi.mock('@/lib/query/hooks/useDealsQuery', () => ({
    useCreateDealWithContact: () => ({ mutateAsync: criarDeal, isPending: false }),
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
    useAuth: () => ({ user: { id: 'u1', email: 'ric2bam@gmail.com' }, profile: { nickname: 'Ricardo' }, organizationId: 'org1' }),
}));
const createNote = vi.fn().mockResolvedValue({ error: null });
vi.mock('@/lib/supabase/dealNotes', () => ({
    dealNotesService: { createNote: (...a: unknown[]) => createNote(...a) },
}));

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

function renderModal() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
        React.createElement(QueryClientProvider, { client },
            React.createElement(SaveToCrmModal, { result: RESULT, onClose: () => {}, onSaved: () => {} })
        )
    );
}

describe('Salvar no CRM exige citação literal', () => {
    it('nasce com o botão desabilitado, porque a citação está vazia', () => {
        renderModal();
        expect(screen.getByRole('button', { name: /salvar no crm/i })).toBeDisabled();
    });

    it('continua desabilitado com citação só de espaços em branco', () => {
        renderModal();
        fireEvent.change(screen.getByLabelText(/citação literal/i), { target: { value: '    ' } });
        expect(screen.getByRole('button', { name: /salvar no crm/i })).toBeDisabled();
    });

    it('habilita assim que existe citação de verdade', () => {
        renderModal();
        fireEvent.change(screen.getByLabelText(/citação literal/i), {
            target: { value: 'Liguei três vezes e ninguém responde.' },
        });
        expect(screen.getByRole('button', { name: /salvar no crm/i })).toBeEnabled();
    });

    it('grava o deal no primeiro estágio do board e anexa a citação como nota', async () => {
        renderModal();
        fireEvent.change(screen.getByLabelText(/citação literal/i), {
            target: { value: 'Liguei três vezes e ninguém responde.' },
        });
        fireEvent.change(screen.getByLabelText(/data da avaliação/i), { target: { value: '2026-07-01' } });
        fireEvent.click(screen.getByRole('button', { name: /salvar no crm/i }));

        await vi.waitFor(() => expect(criarDeal).toHaveBeenCalled());

        const args = criarDeal.mock.calls[0][0];
        expect(args.deal.boardId).toBe('b0a1d000-0000-4000-8000-0000000000ff');
        // O primeiro estágio por ordem — nunca um nome literal.
        expect(args.deal.status).toBe('b0a1d000-0000-4000-8000-000000000000');
        expect(args.relatedData.companyName).toBe('Clínica Sorriso');
        expect(args.relatedData.contact.phone).toBe('+552433001122');

        await vi.waitFor(() => expect(createNote).toHaveBeenCalled());
        const [, conteudo] = createNote.mock.calls[0];
        expect(conteudo).toContain('Liguei três vezes e ninguém responde.');
        expect(conteudo).toContain('2026-07-01');
        expect(conteudo).toContain('google_maps');
    });
});
