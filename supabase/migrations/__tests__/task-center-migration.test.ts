/**
 * Guarda-corpo para a migration da Central de Tarefas (Fase 1).
 *
 * Não roda a migration contra um banco real (não há Postgres neste
 * ambiente de teste) — em vez disso, verifica por regex que os pontos
 * críticos de segurança e de sincronia continuam presentes no arquivo,
 * seguindo o mesmo estilo de `lib/query/__tests__/cache-integrity.test.ts`
 * (guarda-corpo baseado em conteúdo de arquivo, não execução real).
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const MIGRATION_PATH = path.join(
  __dirname,
  '../20260810130000_task_center_activities_fields.sql'
);

const content = fs.readFileSync(MIGRATION_PATH, 'utf-8');

describe('Migration: Central de Tarefas (Fase 1)', () => {
  it('existe no caminho esperado', () => {
    expect(fs.existsSync(MIGRATION_PATH)).toBe(true);
  });

  it('é aditiva: usa ADD COLUMN IF NOT EXISTS para todas as colunas novas em activities', () => {
    const expectedColumns = [
      'status',
      'priority',
      'time_sphere',
      'is_focus_today',
      'parent_activity_id',
      'position',
      'start_date',
    ];

    for (const column of expectedColumns) {
      const pattern = new RegExp(`ADD COLUMN IF NOT EXISTS ${column}\\b`);
      expect(content, `deve adicionar "${column}" com IF NOT EXISTS`).toMatch(pattern);
    }
  });

  it('não remove nem altera o tipo de nenhuma coluna existente', () => {
    expect(content).not.toMatch(/DROP COLUMN/i);
    expect(content).not.toMatch(/ALTER COLUMN[^;]*TYPE/i);
  });

  it('cria a tabela activity_checklist_items com RLS habilitado', () => {
    expect(content).toMatch(/CREATE TABLE IF NOT EXISTS public\.activity_checklist_items/);
    expect(content).toMatch(
      /ALTER TABLE public\.activity_checklist_items ENABLE ROW LEVEL SECURITY/
    );
  });

  it('isola activity_checklist_items por organização via get_user_org_id()', () => {
    expect(content).toMatch(/organization_id = public\.get_user_org_id\(\)/);
  });

  it('revoga explicitamente PUBLIC e anon de activity_checklist_items (não confia só em RLS)', () => {
    expect(content).toMatch(
      /REVOKE ALL ON public\.activity_checklist_items FROM PUBLIC,\s*anon/
    );
  });

  it('define a função de sincronia com SET search_path (evita function_search_path_mutable)', () => {
    const fnMatch = content.match(
      /CREATE OR REPLACE FUNCTION public\.sync_activity_completed_status\(\)[\s\S]*?\$\$;/
    );
    expect(fnMatch, 'função de sincronia deve existir').not.toBeNull();
    expect(fnMatch![0]).toMatch(/SET search_path = ''/);
  });

  it('cria o trigger que liga a função de sincronia à tabela activities', () => {
    expect(content).toMatch(
      /CREATE TRIGGER sync_activity_completed_status_trigger\s+BEFORE INSERT OR UPDATE ON public\.activities/
    );
  });

  it('faz backfill de status=done para atividades já completed=true', () => {
    expect(content).toMatch(/UPDATE public\.activities\s+SET status = 'done'\s+WHERE completed = true/);
  });
});
