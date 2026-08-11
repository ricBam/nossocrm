'use client'

import React, { useState } from 'react';
import { useActivitiesController } from './hooks/useActivitiesController';
import { ActivitiesHeader } from './components/ActivitiesHeader';
import { ActivitiesFilters } from './components/ActivitiesFilters';
import { ActivitiesList } from './components/ActivitiesList';
import { ActivitiesCalendar } from './components/ActivitiesCalendar';
import { ActivityFormModal } from './components/ActivityFormModal';
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
        formData,
        setFormData,
        filteredActivities,
        deals,
        contacts,
        companies,
        handleNewActivity,
        handleEditActivity,
        handleDeleteActivity,
        handleToggleComplete,
        handleSnoozeSelected,
        handleSubmit
    } = useActivitiesController();

    const { addToast } = useToast();
    const [selectedActivities, setSelectedActivities] = useState<Set<string>>(new Set());

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

            {viewMode === 'list' ? (
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
                    />
                    <ActivitiesList
                        activities={filteredActivities}
                        deals={deals}
                        contacts={contacts}
                        companies={companies}
                        onToggleComplete={handleToggleComplete}
                        onEdit={handleEditActivity}
                        onDelete={handleDeleteActivity}
                        selectedActivities={selectedActivities}
                        onSelectActivity={handleSelectActivity}
                        onAddActivity={() => handleNewActivity()}
                    />
                </>
            ) : (
                <ActivitiesCalendar
                    activities={filteredActivities}
                    deals={deals}
                    currentDate={currentDate}
                    setCurrentDate={setCurrentDate}
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

            <BulkActionsToolbar
                selectedCount={selectedActivities.size}
                onCompleteAll={handleCompleteAll}
                onSnoozeAll={handleSnoozeAll}
                onClearSelection={handleClearSelection}
            />
        </div>
    );
};
