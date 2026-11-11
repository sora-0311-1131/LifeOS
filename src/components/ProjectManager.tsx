'use client';

import React, { useState } from 'react';
import { useDashboard } from '@/store/DashboardContext';
import { Project, Priority } from '@/types';
import { Folder, Plus, ChevronRight, ChevronDown } from 'lucide-react';
import ProjectItem from './ProjectItem';
import SortControls from './SortControls';
import { sortEntities } from '@/utils/sort';

export default function ProjectManager({
  filterGoalId,
  onProjectClick,
}: {
  filterGoalId?: string;
  onProjectClick?: (id: string) => void;
} = {}) {
  const { state, viewPreferences, setViewPreference, toggleProjectGroup, addProject } = useDashboard();
  const [isCreating, setIsCreating] = useState(false);

  const expandedGroups = viewPreferences.expandedProjectGroups;
  const { sortField, sortOrder, showDone } = viewPreferences.projects;

  const isGrouped = !filterGoalId;

  const [newProject, setNewProject] = useState<{
    title: string;
    goalId: string;
    priority: Priority | '';
    deadline: string;
    notes: string;
  }>({ title: '', goalId: '', priority: '', deadline: '', notes: '' });

  const currentPeriodId = state.currentPeriodId;
  const currentGoals = state.goals.filter((g) => g.periodId === currentPeriodId);
  
  const currentProjects = sortEntities(
    state.projects
      .filter((p) => p.periodId === currentPeriodId)
      .filter((p) => (filterGoalId ? p.goalId === filterGoalId : true))
      .filter((p) => showDone || p.status !== 'done'),
    sortField,
    sortOrder
  );

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProject.title || !currentPeriodId) return;

    const project: Project = {
      id: crypto.randomUUID(),
      periodId: currentPeriodId,
      goalId: filterGoalId || newProject.goalId || undefined,
      title: newProject.title,
      notes: newProject.notes || undefined,
      deadline: newProject.deadline || undefined,
      priority: newProject.priority || undefined,
      status: 'todo',
    };
    
    addProject(project);
    setNewProject({ title: '', goalId: '', priority: '', deadline: '', notes: '' });
    setIsCreating(false);
  };

  const renderProjectList = (projects: Project[]) => (
    <ul className="space-y-3">
      {projects.map((project) => (
        <ProjectItem key={project.id} project={project} filterGoalId={filterGoalId} onProjectClick={onProjectClick} />
      ))}
    </ul>
  );

  return (
    <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-6 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <Folder className="w-5 h-5 text-amber-500" />
          Projects
        </h2>
        <div className="flex flex-wrap items-center gap-4">
          <SortControls
            sortField={sortField}
            sortOrder={sortOrder}
            showDone={showDone}
            onSortFieldChange={(field) => setViewPreference('projects', { sortField: field })}
            onToggleSortOrder={() => setViewPreference('projects', { sortOrder: sortOrder === 'asc' ? 'desc' : 'asc' })}
            onToggleShowDone={() => setViewPreference('projects', { showDone: !showDone })}
          />
          <button
            onClick={() => setIsCreating(!isCreating)}
            className="text-sm flex items-center gap-1 text-amber-600 hover:text-amber-700 font-medium bg-amber-50 dark:bg-amber-900/20 px-3 py-1.5 rounded-md transition-colors"
          >
            <Plus className="w-4 h-4" />
            New
          </button>
        </div>
      </div>

      {isCreating && (
        <form onSubmit={handleCreate} className="mb-6 bg-neutral-50 dark:bg-neutral-800/50 p-4 rounded-lg space-y-4 border border-neutral-200 dark:border-neutral-700">
          <div>
            <label className="block text-sm font-medium mb-1">Project (Title)</label>
            <input
              type="text"
              required
              placeholder="e.g., Website Renewal"
              className="w-full px-3 py-2 bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded-md outline-none focus:ring-2 focus:ring-amber-500"
              value={newProject.title}
              onChange={e => setNewProject({ ...newProject, title: e.target.value })}
            />
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Deadline</label>
              <input
                type="date"
                className="w-full px-3 py-2 bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded-md outline-none focus:ring-2 focus:ring-amber-500"
                value={newProject.deadline}
                onChange={e => setNewProject({ ...newProject, deadline: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Priority</label>
              <select
                className="w-full px-3 py-2 bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded-md outline-none focus:ring-2 focus:ring-amber-500"
                value={newProject.priority}
                onChange={e => setNewProject({ ...newProject, priority: e.target.value as (Priority | '') })}
              >
                <option value="">-- Unset --</option>
                <option value="P0">P0: High</option>
                <option value="P1">P1: Medium</option>
                <option value="P2">P2: Low</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Notes</label>
            <textarea
              placeholder="Notes or details"
              rows={2}
              className="w-full px-3 py-2 bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded-md outline-none focus:ring-2 focus:ring-amber-500"
              value={newProject.notes}
              onChange={e => setNewProject({ ...newProject, notes: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Link to Goal (Optional)</label>
            <select
              className="w-full px-3 py-2 bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded-md outline-none focus:ring-2 focus:ring-amber-500"
              value={newProject.goalId}
              onChange={e => setNewProject({ ...newProject, goalId: e.target.value })}
            >
              <option value="">-- None --</option>
              {currentGoals.map(g => (
                <option key={g.id} value={g.id}>{g.title}</option>
              ))}
            </select>
          </div>
          
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsCreating(false)}
              className="px-4 py-2 text-sm font-medium text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-sm font-medium bg-amber-600 text-white rounded-md hover:bg-amber-700 focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 dark:focus:ring-offset-neutral-900"
            >
              Create
            </button>
          </div>
        </form>
      )}

      {currentProjects.length === 0 && !isCreating ? (
        <div className="text-center py-10 border-2 border-dashed border-neutral-200 dark:border-neutral-800 rounded-lg flex flex-col items-center justify-center text-neutral-500">
          <Folder className="w-8 h-8 text-neutral-400 mb-3 opacity-50" />
          <p className="font-medium text-neutral-600 dark:text-neutral-400">No projects yet.</p>
          <p className="text-sm mt-1">Group your tasks into projects.</p>
        </div>
      ) : (
        isGrouped ? (
          <div className="space-y-4">
            {(() => {
              const sortedGoalsForGroups = sortEntities(currentGoals, sortField, sortOrder);

              const groups = [
                { id: 'unassigned', title: 'No Goal' },
                ...sortedGoalsForGroups.map(g => ({ id: g.id, title: g.title }))
              ];
              
              return groups.map(group => {
                const groupProjects = currentProjects.filter(p => (group.id === 'unassigned' ? !p.goalId : p.goalId === group.id));
                if (groupProjects.length === 0) return null;
                
                const isExpanded = expandedGroups[group.id];
                
                return (
                  <div key={group.id} className="space-y-2">
                    <div 
                      className="flex items-center gap-2 cursor-pointer py-2 hover:bg-neutral-50 dark:hover:bg-neutral-800/50 px-2 rounded-md transition-colors -ml-2"
                      onClick={() => toggleProjectGroup(group.id)}
                    >
                      {isExpanded ? <ChevronDown className="w-4 h-4 text-neutral-500" /> : <ChevronRight className="w-4 h-4 text-neutral-500" />}
                      <span className="font-semibold text-neutral-800 dark:text-neutral-200">{group.title}</span>
                      <span className="text-xs text-neutral-500 bg-neutral-100 dark:bg-neutral-800 px-2 py-0.5 rounded-full">
                        {groupProjects.length}
                      </span>
                    </div>
                    {isExpanded && (
                      <div className="pl-4 border-l-2 border-neutral-100 dark:border-neutral-800 ml-2">
                        {renderProjectList(groupProjects)}
                      </div>
                    )}
                  </div>
                );
              });
            })()}
          </div>
        ) : (
          renderProjectList(currentProjects)
        )
      )}
    </div>
  );
}
