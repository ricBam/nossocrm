-- Adiciona suporte a OpenRouter como provedor de IA alternativo ao Google
-- Gemini em organization_settings (BYOK). `ai_provider` já é uma coluna
-- `text` livre (sem CHECK constraint), então 'openrouter' já é um valor
-- válido sem alteração adicional — só falta a coluna para guardar a chave.
--
-- `ai_model` continua reutilizado para os dois provedores: para Google
-- guarda um ID de modelo Gemini (ex: 'gemini-2.0-flash'); para OpenRouter
-- guarda um slug do catálogo OpenRouter (ex: 'anthropic/claude-3.5-sonnet').

ALTER TABLE public.organization_settings
  ADD COLUMN IF NOT EXISTS ai_openrouter_key text;

COMMENT ON COLUMN public.organization_settings.ai_openrouter_key IS
  'Chave de API da OpenRouter (BYOK), usada quando ai_provider = ''openrouter''. Alternativa ao ai_google_key.';
