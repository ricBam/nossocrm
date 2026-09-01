-- ============================================================================
-- Radar de Clientes — índice dedicado para a soma de custo do ciclo
-- ============================================================================
-- A query do teto de gasto filtra por (organization_id, created_at >= início do
-- ciclo) e não menciona nicho, cidade nem uf. No índice idx_radar_searches_cache
-- a coluna created_at fica atrás de três colunas sem predicado, então não pode
-- ser usada como range scan. Este índice dá suporte real a essa query, que roda
-- em TODA busca antes de qualquer chamada paga ao Apify.
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_radar_searches_cycle
  ON public.radar_searches (organization_id, created_at DESC);

-- Corrige o comentário do índice de cache, que prometia servir também a soma do
-- ciclo. Ele serve apenas o lookup de cache por (nicho, cidade, uf).
COMMENT ON INDEX public.idx_radar_searches_cache IS
  'Lookup do cache de 30 dias por (organization_id, nicho, cidade, uf). NÃO serve a soma de custo do ciclo — para isso existe idx_radar_searches_cycle.';
