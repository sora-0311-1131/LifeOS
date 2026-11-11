'use client';

import React from 'react';
import { SortField, SortOrder } from '@/types';
import { Eye, EyeOff, ArrowUp, ArrowDown } from 'lucide-react';
import { getSortOrderHint } from '@/utils/sort';

interface SortControlsProps {
  sortField: SortField;
  sortOrder: SortOrder;
  showDone: boolean;
  onSortFieldChange: (field: SortField) => void;
  onToggleSortOrder: () => void;
  onToggleShowDone: () => void;
}

export default function SortControls({
  sortField,
  sortOrder,
  showDone,
  onSortFieldChange,
  onToggleSortOrder,
  onToggleShowDone,
}: SortControlsProps) {
  const hint = getSortOrderHint(sortField, sortOrder);

  return (
    <>
      <button
        type="button"
        onClick={onToggleShowDone}
        className={`text-sm flex items-center gap-1 font-medium px-3 py-1.5 rounded-md transition-colors ${
          showDone
            ? 'bg-neutral-200 text-neutral-700 dark:bg-neutral-700 dark:text-neutral-300 hover:bg-neutral-300 dark:hover:bg-neutral-600'
            : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700'
        }`}
        title={showDone ? 'Hide done items' : 'Show done items'}
      >
        {showDone ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        <span className="hidden sm:inline">{showDone ? 'Hide Done' : 'Show Done'}</span>
      </button>

      <div className="flex items-center text-sm bg-neutral-50 dark:bg-neutral-800/50 rounded-md border border-neutral-200 dark:border-neutral-700 overflow-hidden">
        <select
          value={sortField}
          onChange={(e) => onSortFieldChange(e.target.value as SortField)}
          className="bg-transparent border-none outline-none cursor-pointer text-neutral-700 dark:text-neutral-300 font-medium px-2.5 py-1.5"
          aria-label="Sort field"
        >
          <option value="deadline" className="bg-white dark:bg-neutral-900">Deadline</option>
          <option value="priority" className="bg-white dark:bg-neutral-900">Priority</option>
          <option value="status" className="bg-white dark:bg-neutral-900">Status</option>
          <option value="title" className="bg-white dark:bg-neutral-900">Title</option>
          <option value="createdAt" className="bg-white dark:bg-neutral-900">Created Date</option>
        </select>
        <button
          type="button"
          onClick={onToggleSortOrder}
          title={`Sort order: ${hint}. Click to toggle.`}
          className="flex items-center gap-1 px-2.5 py-1.5 border-l border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200/60 dark:hover:bg-neutral-700/60 transition-colors font-medium cursor-pointer"
          aria-label={`Sort order: ${hint}`}
        >
          {sortOrder === 'asc' ? (
            <ArrowUp className="w-4 h-4 text-neutral-600 dark:text-neutral-300" />
          ) : (
            <ArrowDown className="w-4 h-4 text-neutral-600 dark:text-neutral-300" />
          )}
          <span className="text-xs">{sortOrder === 'asc' ? 'Asc' : 'Desc'}</span>
        </button>
      </div>
    </>
  );
}

