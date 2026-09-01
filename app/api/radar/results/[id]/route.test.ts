import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient }));

import { DELETE, PATCH } from '@/app/api/radar/results/[id]/route';

const ORG = 'dc09e9de-2030-426b-9dcd-1beae85bac5e';
const USER = 'c2fce80e-77f6-4c85-9d41-f98d9a2aef16';
const RESULT_ID = '11111111-1111-4111-8111-111111111111';

// `then` fica em `vi.fn()` próprio (não `deals.update`/`results.delete`) porque é
// a resolução da query — não a chamada de encadeamento — que marca QUANDO a
// escrita realmente aconteceu; é isso que `invocationCallOrder` precisa comparar.
const deals = { update: vi.fn(), eq: vi.fn(), resolve: vi.fn() };
const results = { delete: vi.fn(), update: vi.fn(), eq: vi.fn(), resolve: vi.fn() };

function fakeSupabase(opts: {
    user?: { id: string } | null;
    row?: { id: string; saved_deal_id: string | null } | null;
    dealUpdateFails?: boolean;
}) {
    const dealsBuilder: Record<string, unknown> = {
        update: (v: unknown) => { deals.update(v); return dealsBuilder; },
        eq: (...a: unknown[]) => { deals.eq(...a); return dealsBuilder; },
        then: (r: (v: { error: { message: string } | null }) => unknown) => {
            const result = { error: opts.dealUpdateFails ? { message: 'RLS negou (teste)' } : null };
            deals.resolve(result);
            return r(result);
        },
    };
    const resultsBuilder: Record<string, unknown> = {
        select: () => resultsBuilder,
        delete: () => { results.delete(); return resultsBuilder; },
        update: (v: unknown) => { results.update(v); return resultsBuilder; },
        eq: (...a: unknown[]) => { results.eq(...a); return resultsBuilder; },
        maybeSingle: async () => ({ data: opts.row === undefined ? { id: RESULT_ID, saved_deal_id: null } : opts.row, error: null }),
        then: (r: (v: { error: null }) => unknown) => {
            const result = { error: null };
            results.resolve(result);
            return r(result);
        },
    };
    return {
        auth: { getUser: async () => ({ data: { user: opts.user === undefined ? { id: USER } : opts.user }, error: null }) },
        from: (name: string) => {
            if (name === 'profiles') {
                return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { organization_id: ORG }, error: null }) }) }) };
            }
            if (name === 'deals') return dealsBuilder;
            return resultsBuilder;
        },
    };
}

function req() {
    return new Request(`http://localhost/api/radar/results/${RESULT_ID}`, { method: 'DELETE' });
}
function patchReq(body: unknown) {
    return new Request(`http://localhost/api/radar/results/${RESULT_ID}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}
const ctx = { params: Promise.resolve({ id: RESULT_ID }) };

beforeEach(() => {
    vi.clearAllMocks();
    deals.update.mockClear();
    deals.resolve.mockClear();
    results.delete.mockClear();
    results.update.mockClear();
    results.resolve.mockClear();
});

describe('DELETE /api/radar/results/:id', () => {
    it('responde 401 sem sessão e não apaga nada', async () => {
        createClient.mockResolvedValue(fakeSupabase({ user: null }));
        const res = await DELETE(req(), ctx);
        expect(res.status).toBe(401);
        expect(results.delete).not.toHaveBeenCalled();
    });

    it('responde 404 quando o resultado não é da organização do usuário', async () => {
        createClient.mockResolvedValue(fakeSupabase({ row: null }));
        const res = await DELETE(req(), ctx);
        expect(res.status).toBe(404);
        expect(results.delete).not.toHaveBeenCalled();
    });

    it('apaga a linha do Radar quando não há deal salvo', async () => {
        createClient.mockResolvedValue(fakeSupabase({ row: { id: RESULT_ID, saved_deal_id: null } }));
        const res = await DELETE(req(), ctx);
        const json = await res.json();
        expect(res.status).toBe(200);
        expect(json).toEqual({ deletedResult: true, deletedDealId: null });
        expect(results.delete).toHaveBeenCalled();
        expect(deals.update).not.toHaveBeenCalled();
    });

    it('faz soft-delete do deal ligado e depois apaga a linha do Radar', async () => {
        createClient.mockResolvedValue(fakeSupabase({ row: { id: RESULT_ID, saved_deal_id: 'deal_1' } }));
        const res = await DELETE(req(), ctx);
        const json = await res.json();
        expect(res.status).toBe(200);
        expect(json).toEqual({ deletedResult: true, deletedDealId: 'deal_1' });
        expect(deals.update).toHaveBeenCalledWith(
            expect.objectContaining({ deleted_at: expect.any(String) })
        );
        expect(results.delete).toHaveBeenCalled();

        // A garantia de ordem é o motivo desta rota existir: se o soft-delete do
        // deal e o delete do Radar fossem invertidos, um soft-delete que falhasse
        // depois de já ter apagado a evidência não poderia mais ser repetido.
        // `invocationCallOrder` compara QUANDO cada query resolveu (`then`), não
        // quando foi montada — é a resolução que importa para a ordem real.
        const dealResolvedAt = deals.resolve.mock.invocationCallOrder[0];
        const resultDeletedAt = results.resolve.mock.invocationCallOrder[0];
        expect(dealResolvedAt).toBeLessThan(resultDeletedAt);
    });

    it('não apaga a linha do Radar e responde 500 quando o soft-delete do deal falha', async () => {
        createClient.mockResolvedValue(
            fakeSupabase({ row: { id: RESULT_ID, saved_deal_id: 'deal_1' }, dealUpdateFails: true })
        );
        const res = await DELETE(req(), ctx);
        const json = await res.json();
        expect(res.status).toBe(500);
        expect(json.error).toContain('RLS negou (teste)');
        expect(deals.update).toHaveBeenCalled();
        // A evidência sobrevive à falha parcial: é isso que permite repetir a
        // operação depois.
        expect(results.delete).not.toHaveBeenCalled();
    });
});

describe('PATCH /api/radar/results/:id', () => {
    it('grava saved_deal_id filtrando por organization_id', async () => {
        createClient.mockResolvedValue(fakeSupabase({ row: { id: RESULT_ID, saved_deal_id: null } }));
        const res = await PATCH(patchReq({ dealId: 'deal_9' }), ctx);
        const json = await res.json();
        expect(res.status).toBe(200);
        expect(json).toEqual({ savedDealId: 'deal_9' });
        expect(results.update).toHaveBeenCalledWith({ saved_deal_id: 'deal_9' });
        // Defense-in-depth: o `.eq('organization_id', ...)` precisa estar na
        // cadeia — tanto na busca da linha quanto no update em si.
        expect(results.eq.mock.calls.some(([col, val]) => col === 'organization_id' && val === ORG)).toBe(true);
    });

    it('responde 401 sem sessão e não grava nada', async () => {
        createClient.mockResolvedValue(fakeSupabase({ user: null }));
        const res = await PATCH(patchReq({ dealId: 'deal_9' }), ctx);
        expect(res.status).toBe(401);
        expect(results.update).not.toHaveBeenCalled();
    });

    it('responde 404 quando o resultado não é da organização do usuário', async () => {
        createClient.mockResolvedValue(fakeSupabase({ row: null }));
        const res = await PATCH(patchReq({ dealId: 'deal_9' }), ctx);
        expect(res.status).toBe(404);
        expect(results.update).not.toHaveBeenCalled();
    });
});
