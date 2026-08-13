-- ============================================================================
-- Módulo Financeiro — Categorias gerenciáveis
-- ============================================================================
-- Substitui as listas fixas de categoria no código por uma lista editável
-- pelo admin em Configurações. O campo `category` em financial_transactions/
-- financial_recurring_expenses continua sendo TEXT livre (não há FK) — esta
-- tabela é só a "lista de sugestões" usada nos dropdowns dos modais, o que
-- preserva a opção de digitar uma categoria avulsa sem precisar cadastrá-la
-- antes.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.financial_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('receita','despesa')),
    color TEXT NOT NULL DEFAULT '#6366F1',
    created_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (organization_id, name, type)
);

CREATE INDEX IF NOT EXISTS idx_financial_categories_org_type
  ON public.financial_categories (organization_id, type);

ALTER TABLE public.financial_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage financial_categories" ON public.financial_categories;
CREATE POLICY "Admins manage financial_categories"
  ON public.financial_categories
  FOR ALL
  TO authenticated
  USING (
    (select auth.uid()) IN (
      SELECT id FROM public.profiles
      WHERE organization_id = financial_categories.organization_id
        AND role = 'admin'
    )
  )
  WITH CHECK (
    (select auth.uid()) IN (
      SELECT id FROM public.profiles
      WHERE organization_id = financial_categories.organization_id
        AND role = 'admin'
    )
  );

-- Seed: cria as categorias padrão para cada organização já existente, para
-- ninguém ficar com dropdown vazio assim que a tela for ao ar. Idempotente
-- via UNIQUE (organization_id, name, type) + ON CONFLICT DO NOTHING.
INSERT INTO public.financial_categories (organization_id, name, type, color)
SELECT o.id, d.name, d.type, d.color
FROM public.organizations o
CROSS JOIN (VALUES
  ('Servidor', 'despesa', '#F97316'),
  ('IA/Claude', 'despesa', '#8B5CF6'),
  ('Anúncios', 'despesa', '#EC4899'),
  ('Ferramentas', 'despesa', '#0EA5E9'),
  ('Outros', 'despesa', '#64748B'),
  ('Vendas (fora do CRM)', 'receita', '#10B981'),
  ('Outros', 'receita', '#14B8A6')
) AS d(name, type, color)
ON CONFLICT (organization_id, name, type) DO NOTHING;

COMMENT ON TABLE public.financial_categories IS
  'Lista gerenciável de categorias sugeridas nos dropdowns de lançamento/despesa recorrente. Não é FK de financial_transactions.category (esse campo continua texto livre).';
