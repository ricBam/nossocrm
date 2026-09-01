/**
 * @fileoverview Remoção de um lead do Radar e do que veio junto com ele.
 *
 * A constituição exige procedência rastreável E caminho de remoção. Apagar só
 * o deal deixaria o payload do Google Maps no banco; apagar só a linha do
 * Radar deixaria o deal sem a evidência que o justificou. Aqui os dois somem.
 *
 * @module app/api/radar/results/[id]/route
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function DELETE(
    _req: Request,
    ctx: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await ctx.params;
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

        // Defense-in-depth: filtra por organization_id além do RLS.
        const { data: row } = await supabase
            .from('radar_results')
            .select('id, saved_deal_id')
            .eq('id', id)
            .eq('organization_id', organizationId)
            .maybeSingle();

        if (!row) {
            return NextResponse.json({ error: 'Resultado não encontrado.' }, { status: 404 });
        }

        const savedDealId = (row as { saved_deal_id: string | null }).saved_deal_id;

        // Soft-delete do deal primeiro: se isto falhar, a evidência continua no
        // banco e a operação pode ser repetida sem perder rastro.
        if (savedDealId) {
            await supabase
                .from('deals')
                .update({ deleted_at: new Date().toISOString() })
                .eq('id', savedDealId)
                .eq('organization_id', organizationId);
        }

        await supabase
            .from('radar_results')
            .delete()
            .eq('id', id)
            .eq('organization_id', organizationId);

        return NextResponse.json({ deletedResult: true, deletedDealId: savedDealId ?? null });
    } catch (err) {
        return NextResponse.json(
            { error: err instanceof Error ? err.message : 'Erro ao apagar o resultado.' },
            { status: 500 }
        );
    }
}
