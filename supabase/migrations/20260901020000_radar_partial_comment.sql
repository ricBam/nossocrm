-- ============================================================================
-- Radar de Clientes — amplia o sentido de radar_searches.partial
-- ============================================================================
-- A marca passa a cobrir duas causas com a mesma consequência: a busca gravada
-- está incompleta e não deve ser servida do cache.
--   1. o run do Apify não chegou a SUCCEEDED; ou
--   2. o run terminou, mas a gravação dos resultados falhou.
-- Em ambos os casos o custo real É contabilizado, porque o dinheiro saiu.
-- ============================================================================

COMMENT ON COLUMN public.radar_searches.partial IS
  'true quando a busca gravada está incompleta: ou o run do Apify não chegou a SUCCEEDED, ou a gravação dos resultados falhou. A linha conta para o custo do ciclo (o dinheiro saiu), mas nunca é servida como cache.';
