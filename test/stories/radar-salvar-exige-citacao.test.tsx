import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { SaveToCrmModal } from '@/features/radar/components/SaveToCrmModal';
import type { RadarResultDTO } from '@/app/api/radar/search/route';

const criarDeal = vi.fn().mockResolvedValue({ id: 'deal_1' });
const excluirDeal = vi.fn().mockResolvedValue('deal_1');
const excluirContato = vi.fn().mockResolvedValue('contact_1');
const excluirEmpresa = vi.fn().mockResolvedValue('company_1');

vi.mock('@/lib/query/hooks/useDealsQuery', () => ({
    useCreateDealWithContact: () => ({ mutateAsync: criarDeal, isPending: false }),
    useDeleteDeal: () => ({ mutateAsync: excluirDeal, isPending: false }),
}));
vi.mock('@/lib/query/hooks/useContactsQuery', () => ({
    useDeleteContact: () => ({ mutateAsync: excluirContato, isPending: false }),
    useDeleteCompany: () => ({ mutateAsync: excluirEmpresa, isPending: false }),
}));
// `SaveToCrmModal` grava `saved_deal_id` via PATCH depois que o deal e a nota
// já existem. Padrão de mock de `fetch` global já usado em
// `radar-apagar-exige-confirmacao.test.tsx`.
const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ savedDealId: 'deal_1' }) });
vi.stubGlobal('fetch', fetchMock);
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

    it('continua desabilitado com citação mas sem data', () => {
        renderModal();
        fireEvent.change(screen.getByLabelText(/citação literal/i), {
            target: { value: 'Liguei três vezes e ninguém responde.' },
        });
        expect(screen.getByRole('button', { name: /salvar no crm/i })).toBeDisabled();
    });

    it('continua desabilitado com data mas sem citação', () => {
        renderModal();
        fireEvent.change(screen.getByLabelText(/data da avaliação/i), { target: { value: '2026-07-01' } });
        expect(screen.getByRole('button', { name: /salvar no crm/i })).toBeDisabled();
    });

    it('habilita assim que existem citação e data', () => {
        renderModal();
        fireEvent.change(screen.getByLabelText(/citação literal/i), {
            target: { value: 'Liguei três vezes e ninguém responde.' },
        });
        fireEvent.change(screen.getByLabelText(/data da avaliação/i), { target: { value: '2026-07-01' } });
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

    it('nao cria um segundo deal quando a nota falha duas vezes', async () => {
        criarDeal.mockClear();
        createNote.mockReset().mockResolvedValue({ error: new Error('timeout') });
        const onSaved = vi.fn();

        const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        render(
            React.createElement(QueryClientProvider, { client },
                React.createElement(SaveToCrmModal, { result: RESULT, onClose: () => {}, onSaved })
            )
        );

        fireEvent.change(screen.getByLabelText(/citação literal/i), {
            target: { value: 'Liguei três vezes e ninguém responde.' },
        });
        fireEvent.change(screen.getByLabelText(/data da avaliação/i), { target: { value: '2026-07-01' } });
        fireEvent.click(screen.getByRole('button', { name: /salvar no crm/i }));

        await vi.waitFor(() => expect(createNote).toHaveBeenCalledTimes(2));
        expect(criarDeal).toHaveBeenCalledTimes(1);
        expect(onSaved).not.toHaveBeenCalled();
        expect(await screen.findByText(/nota de auditoria não foi gravada/i)).toBeInTheDocument();

        // O botão principal virou "retentar nota" — clicar de novo NÃO pode
        // criar outro deal, mesmo que a nota volte a falhar.
        createNote.mockReset().mockResolvedValue({ error: new Error('timeout de novo') });
        fireEvent.click(screen.getByRole('button', { name: /tentar gravar a nota novamente/i }));
        await vi.waitFor(() => expect(createNote).toHaveBeenCalledTimes(1));
        expect(criarDeal).toHaveBeenCalledTimes(1);
        expect(onSaved).not.toHaveBeenCalled();
    });

    it('completa o salvamento quando a nota falha uma vez e vinga na retentativa automatica', async () => {
        criarDeal.mockClear();
        createNote
            .mockReset()
            .mockResolvedValueOnce({ error: new Error('falha transiente') })
            .mockResolvedValueOnce({ error: null });
        const onSaved = vi.fn();

        const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        render(
            React.createElement(QueryClientProvider, { client },
                React.createElement(SaveToCrmModal, { result: RESULT, onClose: () => {}, onSaved })
            )
        );

        fireEvent.change(screen.getByLabelText(/citação literal/i), {
            target: { value: 'Liguei três vezes e ninguém responde.' },
        });
        fireEvent.change(screen.getByLabelText(/data da avaliação/i), { target: { value: '2026-07-01' } });
        fireEvent.click(screen.getByRole('button', { name: /salvar no crm/i }));

        await vi.waitFor(() => expect(onSaved).toHaveBeenCalledWith('deal_1'));
        expect(createNote).toHaveBeenCalledTimes(2);
        expect(criarDeal).toHaveBeenCalledTimes(1);
    });

    it('coloca cada linha de uma citação multilinha dentro do blockquote', async () => {
        criarDeal.mockClear();
        createNote.mockReset().mockResolvedValue({ error: null });

        renderModal();
        fireEvent.change(screen.getByLabelText(/citação literal/i), {
            target: { value: 'Liguei três vezes.\nNinguém atendeu.\nDesisti.' },
        });
        fireEvent.change(screen.getByLabelText(/data da avaliação/i), { target: { value: '2026-07-01' } });
        fireEvent.click(screen.getByRole('button', { name: /salvar no crm/i }));

        await vi.waitFor(() => expect(createNote).toHaveBeenCalled());
        const [, conteudo] = createNote.mock.calls[0];
        expect(conteudo).toContain('> Liguei três vezes.');
        expect(conteudo).toContain('> Ninguém atendeu.');
        expect(conteudo).toContain('> Desisti.');
    });

    it('cancelar depois de a nota falhar desfaz o deal recem-criado', async () => {
        criarDeal.mockClear();
        excluirDeal.mockClear();
        createNote.mockReset().mockResolvedValue({ error: new Error('timeout') });
        const onClose = vi.fn();

        const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        render(
            React.createElement(QueryClientProvider, { client },
                React.createElement(SaveToCrmModal, { result: RESULT, onClose, onSaved: () => {} })
            )
        );

        fireEvent.change(screen.getByLabelText(/citação literal/i), {
            target: { value: 'Liguei três vezes e ninguém responde.' },
        });
        fireEvent.change(screen.getByLabelText(/data da avaliação/i), { target: { value: '2026-07-01' } });
        fireEvent.click(screen.getByRole('button', { name: /salvar no crm/i }));

        await vi.waitFor(() => expect(createNote).toHaveBeenCalledTimes(2));
        expect(await screen.findByText(/nota de auditoria não foi gravada/i)).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /cancelar/i }));

        await vi.waitFor(() => expect(excluirDeal).toHaveBeenCalledWith('deal_1'));
        await vi.waitFor(() => expect(onClose).toHaveBeenCalled());
    });

    it('cancelar antes de existir deal nao apaga nada', () => {
        excluirDeal.mockClear();
        const onClose = vi.fn();

        const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        render(
            React.createElement(QueryClientProvider, { client },
                React.createElement(SaveToCrmModal, { result: RESULT, onClose, onSaved: () => {} })
            )
        );

        fireEvent.change(screen.getByLabelText(/citação literal/i), {
            target: { value: 'Liguei três vezes e ninguém responde.' },
        });
        fireEvent.click(screen.getByRole('button', { name: /cancelar/i }));

        expect(excluirDeal).not.toHaveBeenCalled();
        expect(onClose).toHaveBeenCalled();
    });

    it('trava a citação depois que o deal existe, para a nota nao poder divergir', async () => {
        criarDeal.mockClear();
        createNote.mockReset().mockResolvedValue({ error: new Error('timeout') });

        renderModal();
        fireEvent.change(screen.getByLabelText(/citação literal/i), {
            target: { value: 'Liguei três vezes e ninguém responde.' },
        });
        fireEvent.change(screen.getByLabelText(/data da avaliação/i), { target: { value: '2026-07-01' } });
        fireEvent.click(screen.getByRole('button', { name: /salvar no crm/i }));

        await vi.waitFor(() => expect(createNote).toHaveBeenCalledTimes(2));
        await screen.findByText(/nota de auditoria não foi gravada/i);

        const citacaoInput = screen.getByLabelText(/citação literal/i) as HTMLTextAreaElement;
        expect(citacaoInput.disabled || citacaoInput.readOnly).toBe(true);
    });

    it('grava saved_deal_id no resultado do Radar quando o salvamento completa', async () => {
        criarDeal.mockClear().mockResolvedValue({ id: 'deal_1' });
        createNote.mockReset().mockResolvedValue({ error: null });
        fetchMock.mockClear().mockResolvedValue({ ok: true, json: async () => ({ savedDealId: 'deal_1' }) });

        renderModal();
        fireEvent.change(screen.getByLabelText(/citação literal/i), {
            target: { value: 'Liguei três vezes e ninguém responde.' },
        });
        fireEvent.change(screen.getByLabelText(/data da avaliação/i), { target: { value: '2026-07-01' } });
        fireEvent.click(screen.getByRole('button', { name: /salvar no crm/i }));

        await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
        expect(fetchMock).toHaveBeenCalledWith(
            '/api/radar/results/res_1',
            expect.objectContaining({
                method: 'PATCH',
                body: JSON.stringify({ dealId: 'deal_1' }),
            })
        );
    });

    it('uma falha ao gravar saved_deal_id nao bloqueia o salvamento', async () => {
        criarDeal.mockClear().mockResolvedValue({ id: 'deal_1' });
        createNote.mockReset().mockResolvedValue({ error: null });
        fetchMock.mockClear().mockResolvedValue({ ok: false, status: 500, json: async () => ({ error: 'boom' }) });
        const onSaved = vi.fn();
        const onClose = vi.fn();

        const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        render(
            React.createElement(QueryClientProvider, { client },
                React.createElement(SaveToCrmModal, { result: RESULT, onClose, onSaved })
            )
        );

        fireEvent.change(screen.getByLabelText(/citação literal/i), {
            target: { value: 'Liguei três vezes e ninguém responde.' },
        });
        fireEvent.change(screen.getByLabelText(/data da avaliação/i), { target: { value: '2026-07-01' } });
        fireEvent.click(screen.getByRole('button', { name: /salvar no crm/i }));

        await vi.waitFor(() => expect(onSaved).toHaveBeenCalledWith('deal_1'));
        expect(onClose).toHaveBeenCalled();
    });

    it('cancelar depois de a nota falhar duas vezes remove o deal, o contato e a empresa', async () => {
        criarDeal.mockClear();
        excluirDeal.mockClear();
        excluirContato.mockClear();
        excluirEmpresa.mockClear();
        criarDeal.mockResolvedValueOnce({ id: 'deal_1', contactId: 'contact_1', clientCompanyId: 'company_1' });
        createNote.mockReset().mockResolvedValue({ error: new Error('timeout') });
        fetchMock.mockClear().mockResolvedValue({ ok: true, json: async () => ({ savedDealId: 'deal_1' }) });
        const onClose = vi.fn();

        const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        render(
            React.createElement(QueryClientProvider, { client },
                React.createElement(SaveToCrmModal, { result: RESULT, onClose, onSaved: () => {} })
            )
        );

        fireEvent.change(screen.getByLabelText(/citação literal/i), {
            target: { value: 'Liguei três vezes e ninguém responde.' },
        });
        fireEvent.change(screen.getByLabelText(/data da avaliação/i), { target: { value: '2026-07-01' } });
        fireEvent.click(screen.getByRole('button', { name: /salvar no crm/i }));

        await vi.waitFor(() => expect(createNote).toHaveBeenCalledTimes(2));
        await screen.findByText(/nota de auditoria não foi gravada/i);

        fireEvent.click(screen.getByRole('button', { name: /cancelar/i }));

        await vi.waitFor(() => expect(excluirDeal).toHaveBeenCalledWith('deal_1'));
        await vi.waitFor(() => expect(excluirContato).toHaveBeenCalledWith({ id: 'contact_1' }));
        await vi.waitFor(() => expect(excluirEmpresa).toHaveBeenCalledWith('company_1'));
        await vi.waitFor(() => expect(onClose).toHaveBeenCalled());
    });
});
