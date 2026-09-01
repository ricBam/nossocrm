import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useRadarSearch, useRadarBudget, RADAR_BUDGET_KEY } from '@/lib/query/hooks/useRadarQuery';

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client }, children);
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('useRadarSearch', () => {
  it('NÃO chama a rede ao montar — a busca só roda no clique', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    renderHook(() => useRadarSearch(), { wrapper });

    // Espera um tick para dar chance a qualquer efeito de disparar.
    await new Promise(r => setTimeout(r, 20));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('chama POST /api/radar/search quando mutateAsync é invocado', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ searchId: 's1', origin: 'live', costUsd: 0.01, cachedAt: null, budget: {}, results: [] }),
        { status: 200, headers: { 'content-type': 'application/json' } })
    );
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useRadarSearch(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ nicho: 'clínica odontológica', cidade: 'Resende', uf: 'RJ', maxResults: 3 });
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/radar/search');
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'POST' });
  });

  it('transforma resposta de erro em Error com a mensagem do servidor', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'Teto mensal de US$ 5.00 atingido.' }),
        { status: 402, headers: { 'content-type': 'application/json' } })
    ));

    const { result } = renderHook(() => useRadarSearch(), { wrapper });

    await expect(
      act(async () => {
        await result.current.mutateAsync({ nicho: 'x', cidade: 'Resende', uf: 'RJ', maxResults: 3 });
      })
    ).rejects.toThrow(/Teto mensal/);
  });
});

describe('useRadarBudget', () => {
  it('busca o orçamento do ciclo por GET', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ spentUsd: 1.3, budgetUsd: 5, remainingUsd: 3.7, level: 'ok', cycleStart: '2026-08-16T00:00:00.000Z' }),
        { status: 200, headers: { 'content-type': 'application/json' } })
    );
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useRadarBudget(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toMatchObject({ spentUsd: 1.3, budgetUsd: 5, level: 'ok' });
    expect(fetchMock.mock.calls[0][0]).toBe('/api/radar/budget');
  });
});

describe('RADAR_BUDGET_KEY', () => {
  it('é estável, para a busca poder invalidar o orçamento depois de gastar', () => {
    expect(RADAR_BUDGET_KEY).toEqual(['radar', 'budget']);
  });
});
