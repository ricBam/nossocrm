/**
 * @fileoverview Remoção de um lead do Radar e do que veio junto com ele, e
 * gravação do vínculo entre um resultado do Radar e o deal salvo a partir dele.
 *
 * A constituição exige procedência rastreável E caminho de remoção. Apagar só
 * o deal deixaria o payload do Google Maps no banco; apagar só a linha do
 * Radar deixaria o deal sem a evidência que o justificou. Aqui os dois somem.
 *
 * O PATCH grava `saved_deal_id` depois que `SaveToCrmModal` já criou o deal E
 * a nota de auditoria — sem isso o badge "Já está no CRM" nunca acende e o
 * DELETE acima nunca encontra o deal para desfazer junto.
 *
 * @module app/api/radar/results/[id]/route
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { mustWrite } from '@/lib/radar/supabaseWrite';

async function resolveOrganizationId(
    supabase: Awaited<ReturnType<typeof createClient>>
): Promise<{ organizationId: string } | { errorResponse: NextResponse }> {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
        return { errorResponse: NextResponse.json({ error: 'Não autenticado.' }, { status: 401 }) };
    }

    const { data: profile } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('id', auth.user.id)
        .maybeSingle();

    const organizationId = (profile as { organization_id?: string } | null)?.organization_id;
    if (!organizationId) {
        return { errorResponse: NextResponse.json({ error: 'Organização não identificada.' }, { status: 403 }) };
    }

    return { organizationId };
}

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
        // banco e a operação pode ser repetida sem perder rastro. `mustWrite`
        // lança se `error` vier preenchido, o que interrompe a função ANTES do
        // delete abaixo — é essa interrupção que garante a ordem.
        if (savedDealId) {
            await mustWrite(
                supabase
                    .from('deals')
                    .update({ deleted_at: new Date().toISOString() })
                    .eq('id', savedDealId)
                    .eq('organization_id', organizationId),
                `soft-delete do deal ${savedDealId}`
            );
        }

        await mustWrite(
            supabase
                .from('radar_results')
                .delete()
                .eq('id', id)
                .eq('organization_id', organizationId),
            `apagar radar_results ${id}`
        );

        return NextResponse.json({ deletedResult: true, deletedDealId: savedDealId ?? null });
    } catch (err) {
        return NextResponse.json(
            { error: err instanceof Error ? err.message : 'Erro ao apagar o resultado.' },
            { status: 500 }
        );
    }
}

/**
 * Grava o id do deal criado a partir deste resultado do Radar. Chamado por
 * `SaveToCrmModal` só depois que o deal E a nota de auditoria já existem —
 * nunca antes, para não marcar como salvo algo que ainda pode falhar.
 */
export async function PATCH(
    req: Request,
    ctx: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await ctx.params;
        const body = await req.json();
        const dealId = (body as { dealId?: unknown } | null)?.dealId;
        if (typeof dealId !== 'string' || dealId.length === 0) {
            return NextResponse.json({ error: 'dealId é obrigatório.' }, { status: 400 });
        }

        const supabase = await createClient();

        const resolved = await resolveOrganizationId(supabase);
        if ('errorResponse' in resolved) return resolved.errorResponse;
        const { organizationId } = resolved;

        // Defense-in-depth: filtra por organization_id além do RLS.
        const { data: row } = await supabase
            .from('radar_results')
            .select('id')
            .eq('id', id)
            .eq('organization_id', organizationId)
            .maybeSingle();

        if (!row) {
            return NextResponse.json({ error: 'Resultado não encontrado.' }, { status: 404 });
        }

        await mustWrite(
            supabase
                .from('radar_results')
                .update({ saved_deal_id: dealId })
                .eq('id', id)
                .eq('organization_id', organizationId),
            `gravar saved_deal_id em radar_results ${id}`
        );

        return NextResponse.json({ savedDealId: dealId });
    } catch (err) {
        return NextResponse.json(
            { error: err instanceof Error ? err.message : 'Erro ao gravar o vínculo com o deal.' },
            { status: 500 }
        );
    }
}
