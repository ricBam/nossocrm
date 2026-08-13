-- ============================================================================
-- Módulo Financeiro — Receita recorrente a partir de itens de deal
-- ============================================================================
-- Fluxo: no cockpit do deal, um item de produto/serviço pode ser marcado
-- como "receita recorrente mensal" (deal_items.is_recurring). Quando o deal
-- é marcado como ganho (is_won = true, por QUALQUER caminho — RPC, update
-- direto do client, API pública, agente de IA), um trigger cria uma linha em
-- financial_recurring_revenue para cada item recorrente do deal.
--
-- O valor total do deal já é reconhecido como receita única no mês do
-- fechamento (via financial_ledger, que lê deals.value/closed_at — não
-- alterado aqui). Para não contar o primeiro mês em dobro, a recorrência só
-- começa a gerar ocorrências em financial_transactions a partir do MÊS
-- SEGUINTE ao fechamento (financial_recurring_revenue.starts_at).
-- ============================================================================

-- -----------------------------------------------------------------------------
-- 1. deal_items.is_recurring
-- -----------------------------------------------------------------------------
ALTER TABLE public.deal_items
  ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN NOT NULL DEFAULT FALSE;

-- -----------------------------------------------------------------------------
-- 2. FINANCIAL_RECURRING_REVENUE
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.financial_recurring_revenue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    deal_id UUID REFERENCES public.deals(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    amount NUMERIC(14,2) NOT NULL CHECK (amount >= 0),
    category TEXT NOT NULL DEFAULT 'Receita recorrente',
    day_of_month INTEGER NOT NULL CHECK (day_of_month BETWEEN 1 AND 28),
    starts_at DATE NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_financial_recurring_revenue_org
  ON public.financial_recurring_revenue (organization_id);
CREATE INDEX IF NOT EXISTS idx_financial_recurring_revenue_deal
  ON public.financial_recurring_revenue (deal_id);

ALTER TABLE public.financial_recurring_revenue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage financial_recurring_revenue" ON public.financial_recurring_revenue;
CREATE POLICY "Admins manage financial_recurring_revenue"
  ON public.financial_recurring_revenue
  FOR ALL
  TO authenticated
  USING (
    (select auth.uid()) IN (
      SELECT id FROM public.profiles
      WHERE organization_id = financial_recurring_revenue.organization_id
        AND role = 'admin'
    )
  )
  WITH CHECK (
    (select auth.uid()) IN (
      SELECT id FROM public.profiles
      WHERE organization_id = financial_recurring_revenue.organization_id
        AND role = 'admin'
    )
  );

-- -----------------------------------------------------------------------------
-- 3. financial_transactions ganha um segundo vínculo de recorrência (receita)
-- -----------------------------------------------------------------------------
ALTER TABLE public.financial_transactions
  ADD COLUMN IF NOT EXISTS recurring_revenue_id UUID REFERENCES public.financial_recurring_revenue(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_financial_transactions_recurring_revenue_month
  ON public.financial_transactions (recurring_revenue_id, (date_trunc('month', date::timestamp)))
  WHERE recurring_revenue_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 4. Trigger: deal marcado como ganho → cria financial_recurring_revenue
--    para cada deal_item com is_recurring = true. Idempotente por deal_id+nome
--    (evita duplicar se o deal for reaberto e ganho de novo).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_recurring_revenue_from_deal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.financial_recurring_revenue
    (organization_id, deal_id, name, amount, category, day_of_month, starts_at)
  SELECT
    NEW.organization_id,
    NEW.id,
    NEW.title || ' - ' || di.name,
    di.quantity * di.price,
    'Receita recorrente',
    LEAST(GREATEST(EXTRACT(DAY FROM NEW.closed_at)::int, 1), 28),
    (date_trunc('month', NEW.closed_at) + interval '1 month')::date
  FROM public.deal_items di
  WHERE di.deal_id = NEW.id
    AND di.is_recurring = TRUE
    AND NOT EXISTS (
      SELECT 1 FROM public.financial_recurring_revenue frr
      WHERE frr.deal_id = NEW.id AND frr.name = NEW.title || ' - ' || di.name
    );
  RETURN NEW;
END;
$$;

-- Função de trigger — não deve ser chamável diretamente via RPC.
REVOKE EXECUTE ON FUNCTION public.create_recurring_revenue_from_deal() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_deal_won_create_recurring_revenue ON public.deals;
CREATE TRIGGER trg_deal_won_create_recurring_revenue
  AFTER UPDATE ON public.deals
  FOR EACH ROW
  WHEN (NEW.is_won = TRUE AND (OLD.is_won IS DISTINCT FROM TRUE))
  EXECUTE FUNCTION public.create_recurring_revenue_from_deal();

-- -----------------------------------------------------------------------------
-- 5. Estende o gerador mensal (mesmo job de pg_cron já criado para despesas)
--    para também gerar ocorrências de receita recorrente.
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

  INSERT INTO public.financial_transactions
    (organization_id, type, description, amount, category, date, source, recurring_revenue_id)
  SELECT
    organization_id, 'receita', name, amount, category, CURRENT_DATE, 'recorrente', id
  FROM public.financial_recurring_revenue
  WHERE active = TRUE
    AND day_of_month = EXTRACT(DAY FROM CURRENT_DATE)::int
    AND date_trunc('month', CURRENT_DATE) >= date_trunc('month', starts_at)
  ON CONFLICT (recurring_revenue_id, (date_trunc('month', date::timestamp))) WHERE recurring_revenue_id IS NOT NULL
  DO NOTHING;
END;
$$;

COMMENT ON TABLE public.financial_recurring_revenue IS
  'Receita recorrente mensal gerada a partir de deal_items marcados is_recurring=true, criada automaticamente quando o deal é ganho (trigger trg_deal_won_create_recurring_revenue). starts_at = mês seguinte ao fechamento, para não contar o valor do deal em dobro no mês 1.';

-- -----------------------------------------------------------------------------
-- 6. Categoria "Receita recorrente" nas categorias gerenciáveis, para as
--    ocorrências geradas aparecerem bem no filtro por categoria.
-- -----------------------------------------------------------------------------
INSERT INTO public.financial_categories (organization_id, name, type, color)
SELECT o.id, 'Receita recorrente', 'receita', '#22C55E'
FROM public.organizations o
ON CONFLICT (organization_id, name, type) DO NOTHING;
