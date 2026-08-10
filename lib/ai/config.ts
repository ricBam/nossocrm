/**
 * @fileoverview Configuração de provedores de IA para o CRM.
 *
 * Este módulo abstrai a criação de clientes de diferentes provedores de IA
 * (Google Gemini nativo, e qualquer modelo do catálogo OpenRouter via uma
 * única chave BYOK), permitindo trocar entre eles de forma transparente.
 *
 * OpenRouter é integrado via `@ai-sdk/openai-compatible` (não o pacote
 * oficial `@openrouter/ai-sdk-provider`) porque este projeto está fixado em
 * `ai@^6` (spec `@ai-sdk/provider@3.x`) e o provider oficial da OpenRouter só
 * publica versões compatíveis com `ai@^7` (spec `@ai-sdk/provider@4.x`). A
 * API HTTP da OpenRouter é compatível com o formato OpenAI, então
 * `createOpenAICompatible` com `baseURL: 'https://openrouter.ai/api/v1'`
 * funciona sem essa dependência de versão.
 *
 * @module services/ai/config
 */

import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { AI_DEFAULT_MODELS, AI_DEFAULT_PROVIDER } from './defaults';

export type AIProvider = 'google' | 'openrouter';

const ALLOWED_GOOGLE_MODELS = new Set([
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'gemini-1.5-pro',
  'gemini-1.5-flash',
  'gemini-1.5-flash-8b',
  'gemini-2.5-pro-preview-03-25',
  'gemini-2.5-flash-preview-04-17',
]);

/**
 * Cria e retorna uma instância do modelo de IA configurada.
 *
 * Suporta dois provedores:
 * - `google`: chama a API nativa do Gemini (`@ai-sdk/google`), modelo
 *   restrito à allowlist `ALLOWED_GOOGLE_MODELS` (fallback pro default se
 *   o modelo salvo não estiver na lista).
 * - `openrouter`: chama o catálogo de modelos da OpenRouter (qualquer
 *   modelo, ex: `anthropic/claude-3.5-sonnet`, `openai/gpt-4o`) via uma
 *   única chave de API da OpenRouter. Sem allowlist — o catálogo muda com
 *   frequência, então qualquer `modelId` não vazio é aceito como está.
 *
 * @param provider - Provedor de IA a ser utilizado.
 * @param apiKey - Chave de API do provedor.
 * @param modelId - ID do modelo específico (opcional, usa padrão se não informado).
 * @returns Instância configurada do modelo de IA.
 * @throws Error se a API key não for fornecida.
 *
 * @example
 * ```typescript
 * // Usando Google Gemini
 * const model = getModel('google', 'sua-api-key', 'gemini-2.0-flash');
 *
 * // Usando OpenRouter com um modelo específico do catálogo
 * const model = getModel('openrouter', 'sua-api-key-openrouter', 'anthropic/claude-3.5-sonnet');
 * ```
 */
export const getModel = (provider: AIProvider, apiKey: string, modelId: string) => {
    if (!apiKey) {
        throw new Error('API Key is missing');
    }

    if (provider === 'openrouter') {
        const resolvedModel = modelId || AI_DEFAULT_MODELS.openrouter;
        const openrouter = createOpenAICompatible({
            name: 'openrouter',
            apiKey,
            baseURL: 'https://openrouter.ai/api/v1',
        });
        return openrouter(resolvedModel);
    }

    const resolvedModel = modelId && ALLOWED_GOOGLE_MODELS.has(modelId)
        ? modelId
        : AI_DEFAULT_MODELS.google;

    const google = createGoogleGenerativeAI({ apiKey });
    return google(resolvedModel);
};

/**
 * Formato mínimo de linha de `organization_settings` necessário para
 * resolver qual provedor/chave usar. Aceita o shape retornado por qualquer
 * `.select()` que inclua essas colunas (mesmo com colunas extras).
 */
export interface OrgAIProviderRow {
    ai_provider?: string | null;
    ai_google_key?: string | null;
    ai_openrouter_key?: string | null;
}

/**
 * Resolve o provedor de IA ativo e a chave de API correspondente a partir de
 * uma linha de `organization_settings`. Ponto único de verdade para essa
 * lógica — evita repetir `orgSettings.ai_google_key || ''` hardcoded em cada
 * route/serviço que precisa montar um `model` (ver `lib/ai/tasks/server.ts`,
 * `lib/ai/agent/agent.service.ts`, `app/api/ai/{chat,crm-agent,actions}/route.ts`).
 */
export function resolveProviderAndKey(
    row: OrgAIProviderRow | null | undefined
): { provider: AIProvider; apiKey: string } {
    const provider: AIProvider = row?.ai_provider === 'openrouter' ? 'openrouter' : 'google';
    const apiKey = provider === 'openrouter'
        ? (row?.ai_openrouter_key || '')
        : (row?.ai_google_key || '');
    return { provider, apiKey };
}

/**
 * Configuração de modelo para uso com env vars.
 */
export interface ModelConfig {
    provider?: AIProvider;
    model?: string;
}

/**
 * Retorna um modelo de IA usando variáveis de ambiente.
 *
 * Usa as seguintes env vars:
 * - GOOGLE_GENERATIVE_AI_API_KEY
 * - OPENAI_API_KEY
 * - ANTHROPIC_API_KEY
 *
 * @param config - Configuração opcional (provider e model)
 * @returns Instância configurada do modelo de IA
 *
 * @example
 * ```typescript
 * // Usa provider padrão (google) com model padrão
 * const model = getModelFromEnv();
 *
 * // Especifica provider e model
 * const model = getModelFromEnv({ provider: 'openai', model: 'gpt-4o-mini' });
 * ```
 */
export const getModelFromEnv = (config?: ModelConfig) => {
    const model = config?.model || '';
    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;

    if (!apiKey) {
        throw new Error('API Key for google not found in environment (GOOGLE_GENERATIVE_AI_API_KEY)');
    }

    return getModel(AI_DEFAULT_PROVIDER, apiKey, model);
};
