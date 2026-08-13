-- ============================================================================
-- Módulo Financeiro — Ledger unificado + geração de despesas recorrentes
-- ============================================================================

-- -----------------------------------------------------------------------------
-- 1. VIEW financial_ledger
-- -----------------------------------------------------------------------------
-- Fonte única de leitura para o dashboard financeiro: combina receita
-- automática de deals ganhos com os lançamentos manuais, sem duplicar dado.
-- `security_invoker = true` é obrigatório aqui: sem isso, a view herdaria os
-- privilégios do dono (postgres), que ignora RLS, e vazaria dados entre
-- organizações. Com security_invoker, a RLS de `deals` e
-- `financial_transactions` é aplicada para o usuário que está consultando.
-- -----------------------------------------------------------------------------
DROP VIEW IF EXISTS public.financial_ledger;
CREATE VIEW public.financial_ledger
WITH (security_invoker = true) AS
SELECT
  organization_id,
  'receita'::text AS type,
  title AS description,
  value AS amount,
  'Vendas (CRM)'::text AS category,
  closed_at::date AS date,
  'deal'::text AS source,
  id AS source_id
FROM public.deals
WHERE is_won = TRUE AND deleted_at IS NULL AND closed_at IS NOT NULL
UNION ALL
SELECT
  organization_id, type, description, amount, category, date, source, id AS source_id
FROM public.financial_transactions;

COMMENT ON VIEW public.financial_ledger IS
  'UNION de receita automática (deals ganhos) + lançamentos manuais. security_invoker=true para respeitar RLS por organização.';

-- -----------------------------------------------------------------------------
-- 2. Função de geração de ocorrências recorrentes
-- -----------------------------------------------------------------------------
-- SECURITY DEFINER porque roda via pg_cron (sem sessão de usuário autenticado).
-- Idempotente: o índice único parcial idx_financial_transactions_recurring_month
-- (criado na migration anterior) impede duplicar a ocorrência do mês mesmo se
-- o job rodar mais de uma vez no mesmo dia.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_recurring_financial_transactions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.financial_transactions
    (organization_id, type, description, amount, category, date, source, recurring_id)
  SELECT
    organization_id, 'despesa', name, amount, category, CURRENT_DATE, 'recorrente', id
  FROM public.financial_recurring_expenses
  WHERE active = TRUE
    AND day_of_month = EXTRACT(DAY FROM CURRENT_DATE)::int
  ON CONFLICT (recurring_id, (date_trunc('month', date::timestamp))) WHERE recurring_id IS NOT NULL
  DO NOTHING;
END;
$$;

-- Função não deve ser chamável via RPC pelo client — só o cron a invoca.
REVOKE EXECUTE ON FUNCTION public.generate_recurring_financial_transactions() FROM PUBLIC, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 3. Agendamento pg_cron (diário às 06:00 UTC; idempotente e tolerante à
--    ausência da extensão, mesmo padrão de 20260409120000_hitl_pending_alerts.sql)
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  PERFORM cron.schedule(
    'financial-recurring-expenses',
    '0 6 * * *',
    'SELECT public.generate_recurring_financial_transactions();'
  );
  RAISE NOTICE 'Created cron job: financial-recurring-expenses (daily 06:00 UTC)';
EXCEPTION WHEN undefined_object OR invalid_schema_name THEN
  RAISE NOTICE 'pg_cron extension not available. Call public.generate_recurring_financial_transactions() manually or wire an external scheduler.';
END $$;
