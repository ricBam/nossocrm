import { describe, expect, it } from 'vitest';
import { mustWrite, tryWrite, SupabaseWriteFailedError, type SupabaseWriteQuery } from '@/lib/radar/supabaseWrite';

/** Builder falso do supabase-js: um thenable que resolve para `{ data, error }`. */
function fakeQuery<T>(result: { data: T | null; error: { message: string } | null }): SupabaseWriteQuery<T> {
  return {
    then: (onfulfilled, onrejected) => Promise.resolve(result).then(onfulfilled, onrejected),
  } as SupabaseWriteQuery<T>;
}

/** Builder falso que rejeita — simula uma exceção genuína (rede, runtime), não um `error` do Postgrest. */
function throwingQuery<T>(err: Error): SupabaseWriteQuery<T> {
  return {
    then: (onfulfilled, onrejected) => Promise.reject(err).then(onfulfilled, onrejected),
  } as SupabaseWriteQuery<T>;
}

describe('mustWrite', () => {
  it('devolve data em caso de sucesso', async () => {
    const data = await mustWrite(fakeQuery({ data: { id: '1' }, error: null }), 'contexto de teste');
    expect(data).toEqual({ id: '1' });
  });

  it('lança SupabaseWriteFailedError com o contexto na mensagem quando error vem preenchido', async () => {
    await expect(
      mustWrite(fakeQuery({ data: null, error: { message: 'RLS negou' } }), 'apagar deal deal_1')
    ).rejects.toMatchObject({
      name: 'SupabaseWriteFailedError',
      message: 'apagar deal deal_1: RLS negou',
      contexto: 'apagar deal deal_1',
    });
  });

  it('o erro lançado é instância de SupabaseWriteFailedError e carrega o erro original em cause', async () => {
    try {
      await mustWrite(fakeQuery({ data: null, error: { message: 'falhou' } }), 'ctx');
      expect.unreachable('deveria ter lançado');
    } catch (err) {
      expect(err).toBeInstanceOf(SupabaseWriteFailedError);
      expect((err as SupabaseWriteFailedError).cause).toEqual({ message: 'falhou' });
    }
  });

  it('não engole uma exceção genuína lançada pela própria query', async () => {
    await expect(mustWrite(throwingQuery(new Error('rede caiu')), 'ctx')).rejects.toThrow('rede caiu');
  });
});

describe('tryWrite', () => {
  it('devolve { success: true, data } em caso de sucesso, sem lançar', async () => {
    const outcome = await tryWrite(fakeQuery({ data: { id: '1' }, error: null }), 'contexto de teste');
    expect(outcome).toEqual({ success: true, data: { id: '1' } });
  });

  it('devolve { success: false, message, error } em vez de lançar quando error vem preenchido', async () => {
    const outcome = await tryWrite(
      fakeQuery({ data: null, error: { message: 'upsert falhou' } }),
      'gravar radar_results'
    );
    expect(outcome).toEqual({
      success: false,
      message: 'gravar radar_results: upsert falhou',
      error: { message: 'upsert falhou' },
    });
  });

  it('não engole uma exceção genuína lançada pela própria query', async () => {
    await expect(tryWrite(throwingQuery(new Error('timeout')), 'ctx')).rejects.toThrow('timeout');
  });
});
