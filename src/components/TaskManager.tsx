'use client';

import React, { useState } from 'react';
import { useDashboard } from '@/store/DashboardContext';
import { Task, Priority } from '@/types';
import { CheckSquare, Plus, ChevronRight, ChevronDown } from 'lucide-react';
import TaskItem from './TaskItem';
import SortControls from './SortControls';
import { sortEntities } from '@/utils/sort';

export default function TaskManager({
  filterProjectId,
}: {
  filterProjectId?: string;
} = {}) {
  const { state, viewPreferences, setViewPreference, toggleTaskGroup, addTask } = useDashboard();
  const [isCreating, setIsCreating] = useState(false);

  const expandedGroups = viewPreferences.expandedTaskGroups;
  const { sortField, sortOrder, showDone } = viewPreferences.tasks;

  const isGrouped = !filterProjectId;

  const [newTask, setNewTask] = useState<{
    title: string;
    projectId: string;
    goalId: string;
    priority: Priority | '';
    deadline: string;
    notes: string;
  }>({ title: '', projectId: '', goalId: '', priority: '', deadline: '', notes: '' });

  const currentPeriodId = state.currentPeriodId;
  const currentProjects = state.projects.filter((p) => p.periodId === currentPeriodId);
  const currentGoals = state.goals.filter((g) => g.periodId === currentPeriodId);
  
  const currentTasks = sortEntities(
    state.tasks
      .filter((t) => t.periodId === currentPeriodId)
      .filter((t) => (filterProjectId ? t.projectId === filterProjectId : true))
      .filter((t) => showDone || t.status !== 'done'),
    sortField,
    sortOrder
  );

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTask.title || !currentPeriodId) return;

    const task: Task = {
      id: crypto.randomUUID(),
      periodId: currentPeriodId,
      projectId: filterProjectId || newTask.projectId || undefined,
      goalId: newTask.goalId || undefined,
      title: newTask.title,
      notes: newTask.notes || undefined,
      deadline: newTask.deadline || undefined,
      priority: newTask.priority || undefined,
      status: 'todo',
    };
    
    addTask(task);
    setNewTask({ title: '', projectId: '', goalId: '', priority: '', deadline: '', notes: '' });
    setIsCreating(false);
  };

  if (!currentPeriodId) return null;

  const renderTaskList = (tasks: Task[]) => (
    <ul className="space-y-3">
      {tasks.map((task) => (
        <TaskItem key={task.id} task={task} />
      ))}
    </ul>
  );

  return (
    <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-6 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <CheckSquare className="w-5 h-5 text-emerald-500" />
          Tasks
        </h2>
        <div className="flex flex-wrap items-center gap-4">
          <SortControls
            sortField={sortField}
            sortOrder={sortOrder}
            showDone={showDone}
            onSortFieldChange={(field) => setViewPreference('tasks', { sortField: field })}
            onToggleSortOrder={() => setViewPreference('tasks', { sortOrder: sortOrder === 'asc' ? 'desc' : 'asc' })}
            onToggleShowDone={() => setViewPreference('tasks', { showDone: !showDone })}
          />
          <button
            onClick={() => setIsCreating(!isCreating)}
            className="text-sm flex items-center gap-1 text-emerald-600 hover:text-emerald-700 font-medium bg-emerald-50 dark:bg-emerald-900/20 px-3 py-1.5 rounded-md transition-colors"
          >
            <Plus className="w-4 h-4" />
            New
          </button>
        </div>
      </div>

      {isCreating && (
        <form onSubmit={handleCreate} className="mb-6 bg-neutral-50 dark:bg-neutral-800/50 p-4 rounded-lg space-y-4 border border-neutral-200 dark:border-neutral-700">
          <div>
            <label className="block text-sm font-medium mb-1">Task (Title)</label>
            <input
              type="text"
              required
              placeholder="e.g., Create PRD"
              className="w-full px-3 py-2 bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded-md outline-none focus:ring-2 focus:ring-emerald-500"
              value={newTask.title}
              onChange={e => setNewTask({ ...newTask, title: e.target.value })}
            />
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Deadline</label>
              <input
                type="date"
                className="w-full px-3 py-2 bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded-md outline-none focus:ring-2 focus:ring-emerald-500"
                value={newTask.deadline}
                onChange={e => setNewTask({ ...newTask, deadline: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Priority</label>
              <select
                className="w-full px-3 py-2 bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded-md outline-none focus:ring-2 focus:ring-emerald-500"
                value={newTask.priority}
                onChange={e => setNewTask({ ...newTask, priority: e.target.value as (Priority | '') })}
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
              className="w-full px-3 py-2 bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded-md outline-none focus:ring-2 focus:ring-emerald-500"
              value={newTask.notes}
              onChange={e => setNewTask({ ...newTask, notes: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Link to Project (Optional)</label>
              <select
                className="w-full px-3 py-2 bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded-md outline-none focus:ring-2 focus:ring-emerald-500"
                value={newTask.projectId}
                onChange={e => setNewTask({ ...newTask, projectId: e.target.value })}
              >
                <option value="">-- None --</option>
                {currentProjects.map(p => (
                  <option key={p.id} value={p.id}>{p.title}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Link to Goal (Optional)</label>
              <select
                className="w-full px-3 py-2 bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded-md outline-none focus:ring-2 focus:ring-emerald-500"
                value={newTask.goalId}
                onChange={e => setNewTask({ ...newTask, goalId: e.target.value })}
              >
                <option value="">-- None --</option>
                {currentGoals.map(g => (
                  <option key={g.id} value={g.id}>{g.title}</option>
                ))}
              </select>
            </div>
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
              className="px-4 py-2 text-sm font-medium bg-emerald-600 text-white rounded-md hover:bg-emerald-700 focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 dark:focus:ring-offset-neutral-900"
            >
              Create
            </button>
          </div>
        </form>
      )}

      {currentTasks.length === 0 && !isCreating ? (
        <div className="text-center py-10 border-2 border-dashed border-neutral-200 dark:border-neutral-800 rounded-lg flex flex-col items-center justify-center text-neutral-500">
          <CheckSquare className="w-8 h-8 text-neutral-400 mb-3 opacity-50" />
          <p className="font-medium text-neutral-600 dark:text-neutral-400">No tasks yet.</p>
          <p className="text-sm mt-1">Add tasks to get started.</p>
        </div>
      ) : (
        isGrouped ? (
          <div className="space-y-4">
            {(() => {
              const sortedProjectsForGroups = sortEntities(currentProjects, sortField, sortOrder);

              const groups = [
                { id: 'unassigned', title: 'No Project' },
                ...sortedProjectsForGroups.map(p => ({ id: p.id, title: p.title }))
              ];
              
              return groups.map(group => {
                const groupTasks = currentTasks.filter(t => (group.id === 'unassigned' ? !t.projectId : t.projectId === group.id));
                if (groupTasks.length === 0) return null;
                
                const isExpanded = expandedGroups[group.id];
                
                return (
                  <div key={group.id} className="space-y-2">
                    <div 
                      className="flex items-center gap-2 cursor-pointer py-2 hover:bg-neutral-50 dark:hover:bg-neutral-800/50 px-2 rounded-md transition-colors -ml-2"
                      onClick={() => toggleTaskGroup(group.id)}
                    >
                      {isExpanded ? <ChevronDown className="w-4 h-4 text-neutral-500" /> : <ChevronRight className="w-4 h-4 text-neutral-500" />}
                      <span className="font-semibold text-neutral-800 dark:text-neutral-200">{group.title}</span>
                      <span className="text-xs text-neutral-500 bg-neutral-100 dark:bg-neutral-800 px-2 py-0.5 rounded-full">
                        {groupTasks.length}
                      </span>
                    </div>
                    {isExpanded && (
                      <div className="pl-4 border-l-2 border-neutral-100 dark:border-neutral-800 ml-2">
                        {renderTaskList(groupTasks)}
                      </div>
                    )}
                  </div>
                );
              });
            })()}
          </div>
        ) : (
          renderTaskList(currentTasks)
        )
      )}
    </div>
  );
}
