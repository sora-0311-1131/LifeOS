import { Priority, ExtendedStatus, EntityStatus, SortField, SortOrder } from '@/types';

export interface SortableEntity {
  id: string;
  title: string;
  deadline?: string;
  priority?: Priority;
  status: EntityStatus | ExtendedStatus;
  createdAt?: string;
}

const PRIORITY_ORDER: Record<Priority, number> = {
  P0: 0,
  P1: 1,
  P2: 2,
};

const STATUS_ORDER: Record<ExtendedStatus, number> = {
  'todo': 0,
  'in-progress': 1,
  'pending': 2,
  'done': 3,
};

function compareDeadlineAsc(a: SortableEntity, b: SortableEntity): number {
  if (!a.deadline && !b.deadline) return 0;
  if (!a.deadline) return 1;
  if (!b.deadline) return -1;
  return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
}

export function sortEntities<T extends SortableEntity>(
  items: T[],
  field: SortField,
  order: SortOrder
): T[] {
  const dir = order === 'asc' ? 1 : -1;
  const indexed = items.map((item, index) => ({ item, index }));

  indexed.sort((wrapperA, wrapperB) => {
    const a = wrapperA.item;
    const b = wrapperB.item;

    if (field === 'deadline') {
      // Items without a deadline always stay at the bottom regardless of asc/desc
      if (!a.deadline && !b.deadline) {
        return a.title.localeCompare(b.title, 'ja', { numeric: true, sensitivity: 'base' }) || (wrapperA.index - wrapperB.index);
      }
      if (!a.deadline) return 1;
      if (!b.deadline) return -1;
      const diff = new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
      if (diff !== 0) return diff * dir;
      return a.title.localeCompare(b.title, 'ja', { numeric: true, sensitivity: 'base' });
    }

    if (field === 'priority') {
      // Items without a priority always stay at the bottom regardless of asc/desc
      const hasA = a.priority !== undefined;
      const hasB = b.priority !== undefined;
      if (!hasA && !hasB) {
        return compareDeadlineAsc(a, b) || a.title.localeCompare(b.title, 'ja', { numeric: true, sensitivity: 'base' });
      }
      if (!hasA) return 1;
      if (!hasB) return -1;
      const diff = PRIORITY_ORDER[a.priority!] - PRIORITY_ORDER[b.priority!];
      if (diff !== 0) return diff * dir;
      return compareDeadlineAsc(a, b) || a.title.localeCompare(b.title, 'ja', { numeric: true, sensitivity: 'base' });
    }

    if (field === 'status') {
      const diff = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
      if (diff !== 0) return diff * dir;
      return compareDeadlineAsc(a, b) || a.title.localeCompare(b.title, 'ja', { numeric: true, sensitivity: 'base' });
    }

    if (field === 'title') {
      const diff = a.title.localeCompare(b.title, 'ja', { numeric: true, sensitivity: 'base' });
      if (diff !== 0) return diff * dir;
      return compareDeadlineAsc(a, b);
    }

    if (field === 'createdAt') {
      if (a.createdAt && b.createdAt) {
        const diff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        if (diff !== 0) return diff * dir;
      } else if (a.createdAt && !b.createdAt) {
        return 1 * dir;
      } else if (!a.createdAt && b.createdAt) {
        return -1 * dir;
      }
      return (wrapperA.index - wrapperB.index) * dir;
    }

    return 0;
  });

  return indexed.map((w) => w.item);
}

export function getSortOrderHint(field: SortField, order: SortOrder): string {
  switch (field) {
    case 'deadline':
      return order === 'asc' ? 'Soonest first (Asc)' : 'Latest first (Desc)';
    case 'priority':
      return order === 'asc' ? 'High to Low: P0 → P2 (Asc)' : 'Low to High: P2 → P0 (Desc)';
    case 'status':
      return order === 'asc' ? 'To Do → Done (Asc)' : 'Done → To Do (Desc)';
    case 'title':
      return order === 'asc' ? 'A → Z / あ → ん (Asc)' : 'Z → A / ん → あ (Desc)';
    case 'createdAt':
      return order === 'asc' ? 'Oldest first (Asc)' : 'Newest first (Desc)';
  }
}

