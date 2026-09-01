/**
 * @fileoverview Remoção de um lead do Radar e do que veio junto com ele, e
 * gravação do vínculo entre um resultado do Radar e o deal salvo a partir dele.
 *
 * A constituição exige procedência rastreável E caminho de remoção. Apagar só
 * o deal deixaria o payload do Google Maps no banco; apagar só a linha do
 * Radar deixaria o deal sem a evidência que o justificou. Aqui os dois somem
 * de verdade: o deal sai por DELETE, o mesmo caminho que `dealsService.delete`
 * usa no resto do CRM. `deals.deleted_at` NÃO serve aqui — nenhuma leitura de
 * deals nesta aplicação filtra por essa coluna (`dealsService.getAll`, fonte
 * do `DEALS_VIEW_KEY` que o Kanban renderiza, não a menciona), então um
 * soft-delete deixaria o card visível no funil sem nenhum rastro de origem.
 *
 * O PATCH grava `saved_deal_id` depois que `useSaveToCrm` já criou o deal —
 * sem isso o badge "Já está no CRM" nunca acende e o DELETE acima nunca
 * encontra o deal para desfazer junto.
 *
 * @module app/api/radar/results/[id]/route
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { mustWrite } from '@/lib/radar/supabaseWrite';

/**
 * Autentica, resolve a organização E exige papel admin.
 *
 * O gate de papel não é decoração: as policies de RLS de `radar_searches` e
 * `radar_results` são admin-only, então um membro não-admin passaria pelo
 * `profiles` mas veria zero linhas — o que aqui viraria um 404 enganoso e, na
 * rota de busca, um run pago invisível para o teto. Precedente:
 * `app/api/admin/*` responde 403 'Forbidden' para `role !== 'admin'`.
 */
async function resolveOrganizationId(
    supabase: Awaited<ReturnType<typeof createClient>>
): Promise<{ organizationId: string } | { errorResponse: NextResponse }> {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
        return { errorResponse: NextResponse.json({ error: 'Não autenticado.' }, { status: 401 }) };
    }

    const { data: profile } = await supabase
        .from('profiles')
        .select('organization_id, role')
        .eq('id', auth.user.id)
        .maybeSingle();

    const organizationId = (profile as { organization_id?: string } | null)?.organization_id;
    if (!organizationId) {
        return { errorResponse: NextResponse.json({ error: 'Organização não identificada.' }, { status: 403 }) };
    }

    const role = (profile as { role?: string } | null)?.role ?? null;
    if (role !== 'admin') {
        return { errorResponse: NextResponse.json({ error: 'Apenas administradores usam o Radar.' }, { status: 403 }) };
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

        const resolved = await resolveOrganizationId(supabase);
        if ('errorResponse' in resolved) return resolved.errorResponse;
        const { organizationId } = resolved;

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

        // Delete do deal primeiro: se isto falhar, a evidência continua no
        // banco e a operação pode ser repetida sem perder rastro. `mustWrite`
        // lança se `error` vier preenchido, o que interrompe a função ANTES do
        // delete abaixo — é essa interrupção que garante a ordem.
        if (savedDealId) {
            await mustWrite(
                supabase
                    .from('deals')
                    .delete()
                    .eq('id', savedDealId)
                    .eq('organization_id', organizationId),
                `apagar o deal ${savedDealId}`
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
 * `useSaveToCrm` depois que o deal já existe.
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
