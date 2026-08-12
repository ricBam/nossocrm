-- ============================================================================
-- Módulo Financeiro — Schema Base
-- ============================================================================
-- Tabelas do módulo Financeiro do CRM (uso interno R.A.F.O., admin-only):
-- - financial_transactions: lançamentos manuais de receita/despesa
-- - financial_recurring_expenses: definição de despesas fixas mensais
-- - financial_buckets: cofrinhos com meta opcional
-- - financial_bucket_movements: aportes/retiradas de cada cofrinho
--
-- Ver docs/superpowers/specs/2026-08-12-crm-financeiro-design.md
-- ============================================================================

-- -----------------------------------------------------------------------------
-- 1. FINANCIAL_RECURRING_EXPENSES (definido antes por causa da FK em transactions)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.financial_recurring_expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    amount NUMERIC(14,2) NOT NULL CHECK (amount >= 0),
    category TEXT NOT NULL,
    day_of_month INTEGER NOT NULL CHECK (day_of_month BETWEEN 1 AND 28),
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_financial_recurring_expenses_org
  ON public.financial_recurring_expenses (organization_id);

ALTER TABLE public.financial_recurring_expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage financial_recurring_expenses" ON public.financial_recurring_expenses;
CREATE POLICY "Admins manage financial_recurring_expenses"
  ON public.financial_recurring_expenses
  FOR ALL
  TO authenticated
  USING (
    (select auth.uid()) IN (
      SELECT id FROM public.profiles
      WHERE organization_id = financial_recurring_expenses.organization_id
        AND role = 'admin'
    )
  )
  WITH CHECK (
    (select auth.uid()) IN (
      SELECT id FROM public.profiles
      WHERE organization_id = financial_recurring_expenses.organization_id
        AND role = 'admin'
    )
  );

-- -----------------------------------------------------------------------------
-- 2. FINANCIAL_TRANSACTIONS (lançamentos manuais: receita avulsa, despesa avulsa
--    e ocorrências de despesa recorrente geradas pelo cron)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.financial_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('receita','despesa')),
    description TEXT NOT NULL,
    amount NUMERIC(14,2) NOT NULL CHECK (amount >= 0),
    category TEXT NOT NULL,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','recorrente')),
    recurring_id UUID REFERENCES public.financial_recurring_expenses(id) ON DELETE SET NULL,
    created_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_financial_transactions_org_date
  ON public.financial_transactions (organization_id, date DESC);

-- Índice único parcial: garante que o job de recorrência nunca gere duas
-- ocorrências da mesma despesa recorrente no mesmo mês (usado no ON CONFLICT
-- da função criada na próxima migration).
-- Cast explícito para timestamp (não timestamptz): date_trunc(text, timestamptz)
-- é STABLE (depende do timezone da sessão) e não pode ser usado em índice;
-- date_trunc(text, timestamp) é IMMUTABLE.
CREATE UNIQUE INDEX IF NOT EXISTS idx_financial_transactions_recurring_month
  ON public.financial_transactions (recurring_id, (date_trunc('month', date::timestamp)))
  WHERE recurring_id IS NOT NULL;

ALTER TABLE public.financial_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage financial_transactions" ON public.financial_transactions;
CREATE POLICY "Admins manage financial_transactions"
  ON public.financial_transactions
  FOR ALL
  TO authenticated
  USING (
    (select auth.uid()) IN (
      SELECT id FROM public.profiles
      WHERE organization_id = financial_transactions.organization_id
        AND role = 'admin'
    )
  )
  WITH CHECK (
    (select auth.uid()) IN (
      SELECT id FROM public.profiles
      WHERE organization_id = financial_transactions.organization_id
        AND role = 'admin'
    )
  );

-- -----------------------------------------------------------------------------
-- 3. FINANCIAL_BUCKETS (cofrinhos)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.financial_buckets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    goal_amount NUMERIC(14,2),
    color TEXT NOT NULL DEFAULT '#6366F1',
    archived_at TIMESTAMPTZ,
    created_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_financial_buckets_org
  ON public.financial_buckets (organization_id);

ALTER TABLE public.financial_buckets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage financial_buckets" ON public.financial_buckets;
CREATE POLICY "Admins manage financial_buckets"
  ON public.financial_buckets
  FOR ALL
  TO authenticated
  USING (
    (select auth.uid()) IN (
      SELECT id FROM public.profiles
      WHERE organization_id = financial_buckets.organization_id
        AND role = 'admin'
    )
  )
  WITH CHECK (
    (select auth.uid()) IN (
      SELECT id FROM public.profiles
      WHERE organization_id = financial_buckets.organization_id
        AND role = 'admin'
    )
  );

-- -----------------------------------------------------------------------------
-- 4. FINANCIAL_BUCKET_MOVEMENTS (aportes positivos / retiradas negativas)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.financial_bucket_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bucket_id UUID NOT NULL REFERENCES public.financial_buckets(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    amount NUMERIC(14,2) NOT NULL CHECK (amount <> 0),
    note TEXT,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_financial_bucket_movements_bucket_date
  ON public.financial_bucket_movements (bucket_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_financial_bucket_movements_org
  ON public.financial_bucket_movements (organization_id);

ALTER TABLE public.financial_bucket_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage financial_bucket_movements" ON public.financial_bucket_movements;
CREATE POLICY "Admins manage financial_bucket_movements"
  ON public.financial_bucket_movements
  FOR ALL
  TO authenticated
  USING (
    (select auth.uid()) IN (
      SELECT id FROM public.profiles
      WHERE organization_id = financial_bucket_movements.organization_id
        AND role = 'admin'
    )
  )
  WITH CHECK (
    (select auth.uid()) IN (
      SELECT id FROM public.profiles
      WHERE organization_id = financial_bucket_movements.organization_id
        AND role = 'admin'
    )
  );

COMMENT ON TABLE public.financial_transactions IS
  'Lançamentos manuais de receita/despesa do Financeiro (admin-only). Receita automática de deals ganhos NÃO fica aqui — ver view financial_ledger.';
COMMENT ON TABLE public.financial_recurring_expenses IS
  'Definição de despesas fixas mensais; ocorrências são inseridas em financial_transactions por um job pg_cron (ver migration seguinte).';
COMMENT ON TABLE public.financial_buckets IS
  'Cofrinhos com meta opcional. Saldo de cada cofrinho = soma de financial_bucket_movements.amount.';
