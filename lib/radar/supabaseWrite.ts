/**
 * @fileoverview Guarda contra o padrão "bare await" em escritas Supabase.
 *
 * `supabase-js` devolve `{ data, error }` e NÃO lança em falhas a nível de
 * Postgrest (RLS negado, constraint violada, etc.) — só em falhas de
 * rede/runtime. Um `await supabase.from(...).update(...)` sozinho, sem checar
 * `error`, ignora essas falhas em silêncio. Já causou três bugs reais no
 * Radar: busca cacheada com zero resultados, gasto sumindo do teto mensal, e
 * um delete fora de ordem que apagaria a evidência mesmo com o deal intacto.
 *
 * TypeScript não pode transformar "ignorar um valor de retorno de um await"
 * em erro de compilação — isto NÃO é uma garantia do compilador. O que este
 * módulo compra é uma convenção nomeada e grepável (`mustWrite` / `tryWrite`)
 * que substitui a forma bare-await por completo nos pontos de escrita do
 * Radar. É uma guarda, não um framework.
 *
 * @module lib/radar/supabaseWrite
 */

import type { PostgrestError } from '@supabase/supabase-js';

/** Formato mínimo que qualquer query builder de escrita do supabase-js resolve. */
export interface SupabaseWriteResult<T> {
  data: T | null;
  error: PostgrestError | null;
}

/**
 * Aceita o builder do supabase-js diretamente — ele é `PromiseLike`, então
 * nenhum call site precisa de cast para chamar `mustWrite`/`tryWrite`.
 */
export type SupabaseWriteQuery<T> = PromiseLike<SupabaseWriteResult<T>>;

/** Erro lançado por `mustWrite`. Carrega o contexto e o erro original do Postgrest. */
export class SupabaseWriteFailedError extends Error {
  readonly contexto: string;
  readonly cause: PostgrestError;

  constructor(contexto: string, cause: PostgrestError) {
    super(`${contexto}: ${cause.message}`);
    this.name = 'SupabaseWriteFailedError';
    this.contexto = contexto;
    this.cause = cause;
  }
}

/**
 * Usar quando a resposta correta a uma falha é PARAR — o chamador não deve
 * seguir para o próximo passo. Aguarda `query` e lança `SupabaseWriteFailedError`
 * quando `error` vier preenchido; devolve `data` em caso de sucesso.
 */
export async function mustWrite<T>(query: SupabaseWriteQuery<T>, contexto: string): Promise<T | null> {
  const { data, error } = await query;
  if (error) throw new SupabaseWriteFailedError(contexto, error);
  return data;
}

export type WriteOutcome<T> =
  | { success: true; data: T | null }
  | { success: false; error: PostgrestError; message: string };

/**
 * Usar quando a rota precisa CONTINUAR e compensar a falha (logar, marcar
 * parcial, etc.) em vez de abortar. Nunca lança por causa de `error` — só
 * deixa passar uma exceção genuína da própria query (rede, runtime).
 */
export async function tryWrite<T>(query: SupabaseWriteQuery<T>, contexto: string): Promise<WriteOutcome<T>> {
  const { data, error } = await query;
  if (error) return { success: false, error, message: `${contexto}: ${error.message}` };
  return { success: true, data };
}
