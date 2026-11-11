'use client';

import React, { useState } from 'react';
import { useDashboard } from '@/store/DashboardContext';
import { Goal, Priority } from '@/types';
import { Target, Plus } from 'lucide-react';
import GoalItem from './GoalItem';
import SortControls from './SortControls';
import { sortEntities } from '@/utils/sort';

export default function GoalManager({ onGoalClick }: { onGoalClick?: (id: string) => void } = {}) {
  const { state, viewPreferences, setViewPreference, addGoal } = useDashboard();
  const [isCreating, setIsCreating] = useState(false);
  const [newGoal, setNewGoal] = useState<{
    title: string;
    priority: Priority | '';
    deadline: string;
    notes: string;
  }>({ title: '', priority: '', deadline: '', notes: '' });

  const { sortField, sortOrder, showDone } = viewPreferences.goals;

  const currentPeriodId = state.currentPeriodId;
  const currentGoals = sortEntities(
    state.goals
      .filter((g) => g.periodId === currentPeriodId)
      .filter((g) => showDone || g.status !== 'done'),
    sortField,
    sortOrder
  );

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGoal.title || !currentPeriodId) return;

    const goal: Goal = {
      id: crypto.randomUUID(),
      periodId: currentPeriodId,
      title: newGoal.title,
      notes: newGoal.notes || undefined,
      deadline: newGoal.deadline || undefined,
      priority: newGoal.priority || undefined,
      status: 'todo',
    };
    
    addGoal(goal);
    setNewGoal({ title: '', priority: '', deadline: '', notes: '' });
    setIsCreating(false);
  };

  if (!currentPeriodId) return null;

  return (
    <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-6 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <Target className="w-5 h-5 text-indigo-500" />
          Goals
        </h2>
        <div className="flex flex-wrap items-center gap-4">
          <SortControls
            sortField={sortField}
            sortOrder={sortOrder}
            showDone={showDone}
            onSortFieldChange={(field) => setViewPreference('goals', { sortField: field })}
            onToggleSortOrder={() => setViewPreference('goals', { sortOrder: sortOrder === 'asc' ? 'desc' : 'asc' })}
            onToggleShowDone={() => setViewPreference('goals', { showDone: !showDone })}
          />
          <button
            onClick={() => setIsCreating(!isCreating)}
            className="text-sm flex items-center gap-1 text-indigo-600 hover:text-indigo-700 font-medium bg-indigo-50 dark:bg-indigo-900/20 px-3 py-1.5 rounded-md transition-colors"
          >
            <Plus className="w-4 h-4" />
            New
          </button>
        </div>
      </div>

      {isCreating && (
        <form onSubmit={handleCreate} className="mb-6 bg-neutral-50 dark:bg-neutral-800/50 p-4 rounded-lg space-y-4 border border-neutral-200 dark:border-neutral-700">
          <div>
            <label className="block text-sm font-medium mb-1">Goal</label>
            <input
              type="text"
              required
              placeholder="e.g., Complete Personal Dashboard"
              className="w-full px-3 py-2 bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded-md outline-none focus:ring-2 focus:ring-indigo-500"
              value={newGoal.title}
              onChange={e => setNewGoal({ ...newGoal, title: e.target.value })}
            />
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Deadline</label>
              <input
                type="date"
                className="w-full px-3 py-2 bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded-md outline-none focus:ring-2 focus:ring-indigo-500"
                value={newGoal.deadline}
                onChange={e => setNewGoal({ ...newGoal, deadline: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Priority</label>
              <select
                className="w-full px-3 py-2 bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded-md outline-none focus:ring-2 focus:ring-indigo-500"
                value={newGoal.priority}
                onChange={e => setNewGoal({ ...newGoal, priority: e.target.value as (Priority | '') })}
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
              rows={2}
              className="w-full px-3 py-2 bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded-md outline-none focus:ring-2 focus:ring-indigo-500"
              value={newGoal.notes}
              onChange={e => setNewGoal({ ...newGoal, notes: e.target.value })}
            />
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
              className="px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-neutral-900"
            >
              Create
            </button>
          </div>
        </form>
      )}

      {currentGoals.length === 0 && !isCreating ? (
        <div className="text-center py-6 text-neutral-500">
          <p>No goals have been set for this period yet.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {currentGoals.map((goal) => (
            <GoalItem key={goal.id} goal={goal} onGoalClick={onGoalClick} />
          ))}
        </ul>
      )}
    </div>
  );
}
