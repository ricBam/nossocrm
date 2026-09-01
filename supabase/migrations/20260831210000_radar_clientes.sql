-- ============================================================================
-- Radar de Clientes — descoberta de empresas no Google Maps via Apify
-- ============================================================================
-- radar_searches: uma linha por busca. Guarda parâmetros, run do Apify e o
--   custo REAL cobrado, para o acumulado do ciclo e para o cache de 30 dias.
-- radar_results:  uma linha por lugar encontrado. place_id é a chave de dedupe
--   e saved_deal_id é o caminho para apagar um lead com o que veio junto.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.radar_searches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    nicho TEXT NOT NULL,
    cidade TEXT NOT NULL,
    uf TEXT NOT NULL,
    params JSONB NOT NULL DEFAULT '{}'::jsonb,
    apify_run_id TEXT,
    cost_usd NUMERIC(10,5) NOT NULL DEFAULT 0 CHECK (cost_usd >= 0),
    origin TEXT NOT NULL DEFAULT 'live' CHECK (origin IN ('live','cache')),
    places_count INTEGER NOT NULL DEFAULT 0 CHECK (places_count >= 0),
    created_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Serve o cache por (nicho, cidade, uf) E a soma de custo do ciclo.
CREATE INDEX IF NOT EXISTS idx_radar_searches_cache
  ON public.radar_searches (organization_id, nicho, cidade, uf, created_at DESC);

CREATE TABLE IF NOT EXISTS public.radar_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    search_id UUID NOT NULL REFERENCES public.radar_searches(id) ON DELETE CASCADE,
    place_id TEXT NOT NULL,
    payload JSONB NOT NULL,
    score INTEGER NOT NULL DEFAULT 0,
    score_breakdown JSONB NOT NULL DEFAULT '[]'::jsonb,
    disqualified BOOLEAN NOT NULL DEFAULT FALSE,
    disqualify_reasons TEXT[] NOT NULL DEFAULT '{}'::text[],
    reviews JSONB,
    reviews_fetched_at TIMESTAMPTZ,
    saved_deal_id UUID REFERENCES public.deals(id) ON DELETE SET NULL,
    collected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Dedupe: um place_id aparece uma vez por organização.
CREATE UNIQUE INDEX IF NOT EXISTS idx_radar_results_org_place
  ON public.radar_results (organization_id, place_id);

CREATE INDEX IF NOT EXISTS idx_radar_results_search
  ON public.radar_results (search_id);

ALTER TABLE public.radar_searches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.radar_results  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage radar_searches" ON public.radar_searches;
CREATE POLICY "Admins manage radar_searches"
  ON public.radar_searches
  FOR ALL
  TO authenticated
  USING (
    (select auth.uid()) IN (
      SELECT id FROM public.profiles
      WHERE organization_id = radar_searches.organization_id
        AND role = 'admin'
    )
  )
  WITH CHECK (
    (select auth.uid()) IN (
      SELECT id FROM public.profiles
      WHERE organization_id = radar_searches.organization_id
        AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins manage radar_results" ON public.radar_results;
CREATE POLICY "Admins manage radar_results"
  ON public.radar_results
  FOR ALL
  TO authenticated
  USING (
    (select auth.uid()) IN (
      SELECT id FROM public.profiles
      WHERE organization_id = radar_results.organization_id
        AND role = 'admin'
    )
  )
  WITH CHECK (
    (select auth.uid()) IN (
      SELECT id FROM public.profiles
      WHERE organization_id = radar_results.organization_id
        AND role = 'admin'
    )
  );

COMMENT ON TABLE public.radar_searches IS
  'Buscas do Radar de Clientes. cost_usd é o custo REAL do run do Apify (usageTotalUsd), não a estimativa. origin=cache significa que a busca foi servida do banco e não gastou nada.';
COMMENT ON TABLE public.radar_results IS
  'Lugares retornados pelo Google Maps via Apify. payload é o registro bruto, com origem google_maps e collected_at. Empresa desqualificada NÃO é apagada: fica marcada, para o motivo continuar visível.';
