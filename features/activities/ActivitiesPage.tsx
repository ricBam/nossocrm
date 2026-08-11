'use client'

import React, { useMemo, useState } from 'react';
import { useActivitiesController } from './hooks/useActivitiesController';
import { ActivitiesHeader } from './components/ActivitiesHeader';
import { ActivitiesFilters } from './components/ActivitiesFilters';
import { ActivitiesList } from './components/ActivitiesList';
import { ActivitiesCalendar } from './components/ActivitiesCalendar';
import { ActivitiesKanban } from './components/ActivitiesKanban';
import { ActivityFormModal } from './components/ActivityFormModal';
import { ActivityDetailModal } from './components/ActivityDetailModal';
import { BulkActionsToolbar } from './components/BulkActionsToolbar';
import { TaskTabs } from './components/TaskTabs';
import { useToast } from '@/context/ToastContext';

/**
 * Componente React `ActivitiesPage`.
 * @returns {Element} Retorna um valor do tipo `Element`.
 */
export const ActivitiesPage: React.FC = () => {
    const {
        viewMode,
        setViewMode,
        taskTab,
        setTaskTab,
        listLayout,
        setListLayout,
        showCompleted,
        setShowCompleted,
        searchTerm,
        setSearchTerm,
        filterType,
        setFilterType,
        dateFilter,
        currentDate,
        setCurrentDate,
        isModalOpen,
        setIsModalOpen,
        editingActivity,
        viewingActivity,
        formData,
        setFormData,
        filteredActivities,
        kanbanActivities,
        deals,
        contacts,
        companies,
        handleNewActivity,
        handleEditActivity,
        handleViewActivity,
        handleCloseDetail,
        handleChangeActivityStatus,
        handleDeleteActivity,
        handleToggleComplete,
        handleSnoozeSelected,
        handleSubmit
    } = useActivitiesController();

    const { addToast } = useToast();
    const [selectedActivities, setSelectedActivities] = useState<Set<string>>(new Set());

    // A view somente leitura precisa do deal/contato/empresa vinculados (a
    // própria `Activity` só guarda os IDs) — resolvido aqui, 1 lookup por
    // abertura, não é um hot path como as listas grandes de `ActivitiesList`.
    const viewingDeal = useMemo(
        () => (viewingActivity?.dealId ? deals.find(d => d.id === viewingActivity.dealId) : undefined),
        [deals, viewingActivity]
    );
    const viewingContact = useMemo(
        () => (viewingActivity?.contactId ? contacts.find(c => c.id === viewingActivity.contactId) : undefined),
        [contacts, viewingActivity]
    );
    const viewingCompany = useMemo(
        () => (viewingActivity?.clientCompanyId ? companies.find(c => c.id === viewingActivity.clientCompanyId) : undefined),
        [companies, viewingActivity]
    );

    const handleSelectActivity = (id: string, selected: boolean) => {
        setSelectedActivities(prev => {
            const newSet = new Set(prev);
            if (selected) {
                newSet.add(id);
            } else {
                newSet.delete(id);
            }
            return newSet;
        });
    };

    const handleClearSelection = () => {
        setSelectedActivities(new Set());
    };

    const handleCompleteAll = () => {
        selectedActivities.forEach(id => {
            handleToggleComplete(id);
        });
        addToast(`${selectedActivities.size} atividades concluídas!`, 'success');
        handleClearSelection();
    };

    const handleSnoozeAll = () => {
        handleSnoozeSelected(Array.from(selectedActivities));
        handleClearSelection();
    };

    return (
        <div className="p-8 max-w-400 mx-auto">
            <ActivitiesHeader
                viewMode={viewMode}
                setViewMode={setViewMode}
                onNewActivity={() => handleNewActivity()}
                dateFilter={dateFilter}
            />

            {viewMode === 'list' && (
                <>
                    <TaskTabs
                        taskTab={taskTab}
                        setTaskTab={setTaskTab}
                        showCompleted={showCompleted}
                        setShowCompleted={setShowCompleted}
                    />
                    <ActivitiesFilters
                        searchTerm={searchTerm}
                        setSearchTerm={setSearchTerm}
                        filterType={filterType}
                        setFilterType={setFilterType}
                        listLayout={listLayout}
                        setListLayout={setListLayout}
                    />
                    <ActivitiesList
                        activities={filteredActivities}
                        deals={deals}
                        contacts={contacts}
                        companies={companies}
                        layout={listLayout}
                        onToggleComplete={handleToggleComplete}
                        onEdit={handleEditActivity}
                        onDelete={handleDeleteActivity}
                        onView={handleViewActivity}
                        selectedActivities={selectedActivities}
                        onSelectActivity={handleSelectActivity}
                        onAddActivity={() => handleNewActivity()}
                    />
                </>
            )}

            {viewMode === 'calendar' && (
                <ActivitiesCalendar
                    activities={filteredActivities}
                    deals={deals}
                    currentDate={currentDate}
                    setCurrentDate={setCurrentDate}
                    onView={handleViewActivity}
                />
            )}

            {viewMode === 'kanban' && (
                <ActivitiesKanban
                    activities={kanbanActivities}
                    deals={deals}
                    companies={companies}
                    onView={handleViewActivity}
                    onEdit={handleEditActivity}
                    onChangeStatus={handleChangeActivityStatus}
                />
            )}

            <ActivityFormModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSubmit={handleSubmit}
                formData={formData}
                setFormData={setFormData}
                editingActivity={editingActivity}
                deals={deals}
            />

            <ActivityDetailModal
                isOpen={viewingActivity !== null}
                onClose={handleCloseDetail}
                onEdit={handleEditActivity}
                activity={viewingActivity}
                deal={viewingDeal}
                contact={viewingContact}
                company={viewingCompany}
            />

            <BulkActionsToolbar
                selectedCount={selectedActivities.size}
                onCompleteAll={handleCompleteAll}
                onSnoozeAll={handleSnoozeAll}
                onClearSelection={handleClearSelection}
            />
        </div>
    );
};
