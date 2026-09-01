/**
 * @fileoverview Acumulado de gasto do Radar no ciclo vigente.
 * @module app/api/radar/budget/route
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { budgetVerdict, currentCycleStart, monthlyBudgetUsd } from '@/lib/radar/pricing';

export async function GET() {
  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', auth.user.id)
    .maybeSingle();

  const organizationId = (profile as { organization_id?: string } | null)?.organization_id;
  if (!organizationId) {
    return NextResponse.json({ error: 'Organização não identificada.' }, { status: 403 });
  }

  const cycleStart = currentCycleStart(new Date());
  const { data } = await supabase
    .from('radar_searches')
    .select('cost_usd')
    .eq('organization_id', organizationId)
    .gte('created_at', cycleStart.toISOString());

  const spentUsd = ((data ?? []) as { cost_usd: number | string }[])
    .reduce((acc, r) => acc + Number(r.cost_usd ?? 0), 0);

  const verdict = budgetVerdict({ spentUsd, estimateUsd: 0, budgetUsd: monthlyBudgetUsd() });

  return NextResponse.json({
    spentUsd,
    budgetUsd: verdict.budgetUsd,
    remainingUsd: verdict.remainingUsd,
    level: verdict.level,
    cycleStart: cycleStart.toISOString(),
  });
}
