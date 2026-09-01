-- ============================================================================
-- Radar de Clientes — marca de busca parcial
-- ============================================================================
-- waitForFinish é o teto de quanto tempo a API do Apify segura a conexão, não
-- garantia de que o run terminou. Um run que estoura esse tempo devolve status
-- RUNNING e um dataset incompleto.
--
-- Nesse caso a busca ainda É gravada, com o custo real, porque o dinheiro saiu
-- e precisa entrar no acumulado do ciclo — senão o teto de US$5 mentiria. Mas
-- fica marcada como parcial, e a consulta de cache ignora linhas parciais: uma
-- lista incompleta nunca deve ser servida por 30 dias como se estivesse pronta.
-- ============================================================================

ALTER TABLE public.radar_searches
  ADD COLUMN IF NOT EXISTS partial BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.radar_searches.partial IS
  'true quando o run do Apify não chegou a SUCCEEDED. A linha conta para o custo do ciclo, mas nunca é servida como cache.';
