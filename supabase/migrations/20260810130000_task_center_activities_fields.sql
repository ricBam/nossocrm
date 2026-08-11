-- Central de Tarefas — Fase 1
-- Estende `activities` com os campos de status/prioridade/esfera do tempo/
-- foco do dia/subtarefas/ordenação + nova tabela `activity_checklist_items`.
-- Ref: docs/plano-central-de-tarefas.md (seção 2), aprovado pelo fundador
-- em 2026-08-10. Migration aditiva: nenhuma coluna existente é removida ou
-- tem seu tipo alterado.

-- -----------------------------------------------------------------------------
-- 1. Enums novos
-- -----------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.activity_status AS ENUM ('inbox', 'todo', 'in_progress', 'done');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.activity_priority AS ENUM ('none', 'low', 'medium', 'high', 'urgent');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.time_sphere AS ENUM ('importante', 'urgente', 'circunstancial');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- -----------------------------------------------------------------------------
-- 2. Colunas novas em `activities`
-- -----------------------------------------------------------------------------
ALTER TABLE public.activities
  ADD COLUMN IF NOT EXISTS status activity_status NOT NULL DEFAULT 'todo',
  ADD COLUMN IF NOT EXISTS priority activity_priority NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS time_sphere time_sphere,
  ADD COLUMN IF NOT EXISTS is_focus_today BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS parent_activity_id UUID REFERENCES public.activities(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS position DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS start_date DATE;

CREATE INDEX IF NOT EXISTS idx_activities_parent_activity_id ON public.activities (parent_activity_id);
CREATE INDEX IF NOT EXISTS idx_activities_status ON public.activities (organization_id, status);

-- Backfill: atividades já concluídas (completed = true) entram como 'done'
-- retroativamente, para que a aba "Todas"/Kanban por status não as mostre
-- como 'todo' incorretamente. Demais atividades ficam no default 'todo'
-- (não 'inbox' — já têm due date e dono, ver plano seção 2.1).
UPDATE public.activities
SET status = 'done'
WHERE completed = true AND status <> 'done';

-- -----------------------------------------------------------------------------
-- 3. Trigger de sincronia bidirecional completed <-> status
--
-- `completed` continua existindo (usado em ~10 lugares do código) e vira
-- campo derivado de `status`, mantido em sincronia nos dois sentidos:
--   - status alterado explicitamente -> completed = (status = 'done')
--   - completed alterado explicitamente (status não tocado no mesmo
--     UPDATE) -> status = 'done' se completed = true; se completed volta a
--     false e o status atual era 'done', volta para 'todo' (não há como
--     recuperar um status anterior mais específico só a partir do boolean).
-- Em INSERT, se as duas colunas vierem informadas de forma inconsistente,
-- `status` tem prioridade (é a informação mais rica).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_activity_completed_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'done' THEN
      NEW.completed := true;
    ELSIF NEW.completed THEN
      NEW.status := 'done';
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.completed := (NEW.status = 'done');
  ELSIF NEW.completed IS DISTINCT FROM OLD.completed THEN
    IF NEW.completed THEN
      NEW.status := 'done';
    ELSIF OLD.status = 'done' THEN
      NEW.status := 'todo';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_activity_completed_status_trigger ON public.activities;
CREATE TRIGGER sync_activity_completed_status_trigger
  BEFORE INSERT OR UPDATE ON public.activities
  FOR EACH ROW EXECUTE FUNCTION public.sync_activity_completed_status();

COMMENT ON FUNCTION public.sync_activity_completed_status() IS
  'Mantém activities.completed e activities.status em sincronia nos dois '
  'sentidos, para código legado que só lê/escreve completed continuar '
  'funcionando enquanto a UI nova passa a usar status.';

-- -----------------------------------------------------------------------------
-- 4. Tabela nova: `activity_checklist_items`
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.activity_checklist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id UUID NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  is_done BOOLEAN NOT NULL DEFAULT false,
  position DOUBLE PRECISION NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_checklist_items_activity_id
  ON public.activity_checklist_items (activity_id);

ALTER TABLE public.activity_checklist_items ENABLE ROW LEVEL SECURITY;

-- Mesma política de isolamento por organização usada em `activities`
-- (activities_org_isolate, ver 20260224000001_rls_use_get_user_org_id.sql).
DROP POLICY IF EXISTS "activity_checklist_items_org_isolate" ON public.activity_checklist_items;
CREATE POLICY "activity_checklist_items_org_isolate" ON public.activity_checklist_items
  FOR ALL TO authenticated
  USING (organization_id = public.get_user_org_id())
  WITH CHECK (organization_id = public.get_user_org_id());

-- Trava explícita: `anon`/PUBLIC nunca devem ter acesso a esta tabela.
-- REVOKE FROM PUBLIC por si só não é suficiente neste projeto (ver
-- ALTER DEFAULT PRIVILEGES concedendo direto a role específica) — revoga
-- explicitamente de anon também.
REVOKE ALL ON public.activity_checklist_items FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.activity_checklist_items TO authenticated;
