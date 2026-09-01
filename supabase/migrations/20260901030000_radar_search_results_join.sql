-- ============================================================================
-- Radar de Clientes — um lugar pertence a TODAS as buscas que o encontraram
-- ============================================================================
-- O Google Maps devolve categorias por aproximação, então "dentista Resende" e
-- "clínica odontológica Resende" retornam parte dos mesmos lugares de
-- propósito. O dedupe por (organization_id, place_id) está certo — um lugar é
-- UMA linha por organização — mas a coluna `radar_results.search_id` fazia essa
-- linha pertencer a uma única busca. O upsert da segunda busca reescrevia
-- `search_id` e ROUBAVA a linha da primeira: a busca antiga continuava dentro
-- da janela de 30 dias, continuava `partial = false`, continuava servindo de
-- cache — e devolvia zero resultados, com `places_count` ainda dizendo 50.
--
-- A relação é muitos-para-muitos e passa a ser modelada como tal.
-- `radar_search_results` é a filiação; `radar_results` vira o registro do lugar
-- na organização.
--
-- `radar_results.search_id` continua existindo com um sentido mais estreito: a
-- busca que DESCOBRIU o lugar. Deixa de ser NOT NULL e o FK passa a
-- ON DELETE SET NULL — com a linha agora compartilhada entre buscas, o CASCADE
-- antigo faria apagar uma busca levar junto lugares que outras buscas também
-- encontraram.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.radar_search_results (
    search_id       UUID NOT NULL REFERENCES public.radar_searches(id) ON DELETE CASCADE,
    result_id       UUID NOT NULL REFERENCES public.radar_results(id)  ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES public.organizations(id)  ON DELETE CASCADE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (search_id, result_id)
);

-- A leitura de cache é `WHERE search_id = ...` (coberta pela PK). Este índice
-- serve o caminho inverso: em quais buscas este lugar apareceu.
CREATE INDEX IF NOT EXISTS idx_radar_search_results_result
  ON public.radar_search_results (result_id);

CREATE INDEX IF NOT EXISTS idx_radar_search_results_org
  ON public.radar_search_results (organization_id, search_id);

-- Backfill: a filiação que já existia implicitamente em radar_results.search_id.
INSERT INTO public.radar_search_results (search_id, result_id, organization_id)
SELECT r.search_id, r.id, r.organization_id
  FROM public.radar_results r
 WHERE r.search_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- Só depois do backfill: a coluna deixa de ser obrigatória e para de arrastar
-- lugares compartilhados junto com a busca que os descobriu.
ALTER TABLE public.radar_results ALTER COLUMN search_id DROP NOT NULL;

ALTER TABLE public.radar_results DROP CONSTRAINT IF EXISTS radar_results_search_id_fkey;
ALTER TABLE public.radar_results
  ADD CONSTRAINT radar_results_search_id_fkey
  FOREIGN KEY (search_id) REFERENCES public.radar_searches(id) ON DELETE SET NULL;

ALTER TABLE public.radar_search_results ENABLE ROW LEVEL SECURITY;

-- Mesma policy admin-only de radar_searches/radar_results: a filiação não pode
-- ser mais visível do que as duas pontas que ela liga.
DROP POLICY IF EXISTS "Admins manage radar_search_results" ON public.radar_search_results;
CREATE POLICY "Admins manage radar_search_results"
  ON public.radar_search_results
  FOR ALL
  TO authenticated
  USING (
    (select auth.uid()) IN (
      SELECT id FROM public.profiles
      WHERE organization_id = radar_search_results.organization_id
        AND role = 'admin'
    )
  )
  WITH CHECK (
    (select auth.uid()) IN (
      SELECT id FROM public.profiles
      WHERE organization_id = radar_search_results.organization_id
        AND role = 'admin'
    )
  );

COMMENT ON TABLE public.radar_search_results IS
  'Filiação muitos-para-muitos entre buscas e lugares. Um lugar encontrado por duas buscas tem uma linha aqui para cada uma — nenhuma busca perde o resultado para a seguinte.';
COMMENT ON COLUMN public.radar_results.search_id IS
  'Busca que DESCOBRIU este lugar. Não é a filiação: um lugar pode aparecer em várias buscas, e isso vive em radar_search_results. Nunca reescrever em upsert de re-busca.';
