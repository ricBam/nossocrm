import React, { useMemo } from 'react';
import { Activity, Deal, Contact, Company } from '@/types';
import { ActivityRow } from './ActivityRow';
import { ActivityCard } from './ActivityCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { CheckSquare } from 'lucide-react';

/** Formato de exibição dentro da visão Lista (Pedido do fundador, 2026-08-11) — não é uma visão nova, é um formato de renderização dos mesmos dados/filtros já aplicados. */
export type ListLayout = 'rows' | 'blocks';

interface ActivitiesListProps {
    activities: Activity[];
    deals: Deal[];
    contacts: Contact[];
    companies: Company[];
    onToggleComplete: (id: string) => void;
    onEdit: (activity: Activity) => void;
    onDelete: (id: string) => void;
    /** Abre a visualização somente leitura ao clicar na linha/card. */
    onView: (activity: Activity) => void;
    selectedActivities?: Set<string>;
    onSelectActivity?: (id: string, selected: boolean) => void;
    onAddActivity?: () => void;
    /** @default 'rows' */
    layout?: ListLayout;
}

/**
 * Componente React `ActivitiesList`.
 *
 * @param {ActivitiesListProps} {
    activities,
    deals,
    onToggleComplete,
    onEdit,
    onDelete,
    selectedActivities = new Set(),
    onSelectActivity
} - Parâmetro `{
    activities,
    deals,
    onToggleComplete,
    onEdit,
    onDelete,
    selectedActivities = new Set(),
    onSelectActivity
}`.
 * @returns {Element} Retorna um valor do tipo `Element`.
 */
export const ActivitiesList: React.FC<ActivitiesListProps> = ({
    activities,
    deals,
    contacts,
    companies,
    onToggleComplete,
    onEdit,
    onDelete,
    onView,
    selectedActivities = new Set(),
    onSelectActivity,
    onAddActivity,
    layout = 'rows',
}) => {
    // Performance: Activities pode ser uma lista grande; evitamos `find` por linha (O(N*M)).
    const dealById = useMemo(() => {
        const map = new Map<string, Deal>();
        for (const d of deals) map.set(d.id, d);
        return map;
    }, [deals]);

    const contactById = useMemo(() => {
        const map = new Map<string, Contact>();
        for (const c of contacts) map.set(c.id, c);
        return map;
    }, [contacts]);

    const companyById = useMemo(() => {
        const map = new Map<string, Company>();
        for (const c of companies) map.set(c.id, c);
        return map;
    }, [companies]);

    if (activities.length === 0) {
        return (
            <div className="bg-white dark:bg-dark-card rounded-xl border border-slate-200 dark:border-white/5 border-dashed">
                <EmptyState
                    icon={CheckSquare}
                    title="Nenhuma atividade encontrada"
                    description="Crie uma atividade para começar a acompanhar seu trabalho."
                    action={onAddActivity ? { label: 'Nova Atividade', onClick: onAddActivity } : undefined}
                />
            </div>
        );
    }

    if (layout === 'blocks') {
        return (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {activities.map(activity => (
                    <ActivityCard
                        key={activity.id}
                        activity={activity}
                        deal={activity.dealId ? dealById.get(activity.dealId) : undefined}
                        contact={activity.contactId ? contactById.get(activity.contactId) : undefined}
                        company={activity.clientCompanyId ? companyById.get(activity.clientCompanyId) : undefined}
                        onToggleComplete={onToggleComplete}
                        onEdit={onEdit}
                        onDelete={onDelete}
                        onView={onView}
                    />
                ))}
            </div>
        );
    }

    return (
        <div className="space-y-3">
            {activities.map(activity => (
                <ActivityRow
                    key={activity.id}
                    activity={activity}
                    deal={activity.dealId ? dealById.get(activity.dealId) : undefined}
                    contact={activity.contactId ? contactById.get(activity.contactId) : undefined}
                    company={activity.clientCompanyId ? companyById.get(activity.clientCompanyId) : undefined}
                    onToggleComplete={onToggleComplete}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    onView={onView}
                    isSelected={selectedActivities.has(activity.id)}
                    onSelect={onSelectActivity}
                />
            ))}
        </div>
    );
};
