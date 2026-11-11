/* eslint-disable @typescript-eslint/no-explicit-any */
import { Period, Goal, NonGoal, Project, Task, EntityStatus, Priority, ExtendedStatus } from '@/types';

// Utility to convert undefined to null for DB insertion
const toDbNull = <T>(value: T | undefined): T | null => (value === undefined ? null : value);
// Utility to convert null to undefined for Frontend state
const fromDbNull = <T>(value: T | null): T | undefined => (value === null ? undefined : value);

// --- Period ---
export const toDbPeriod = (period: Period) => ({
  id: period.id,
  name: period.name,
  start_date: period.startDate,
  end_date: period.endDate,
  notes: toDbNull(period.notes),
});

export const fromDbPeriod = (row: any): Period => ({
  id: row.id,
  userId: row.user_id,
  name: row.name,
  startDate: row.start_date,
  endDate: row.end_date,
  notes: fromDbNull(row.notes),
  createdAt: fromDbNull(row.created_at),
});

// --- Goal ---
export const toDbGoal = (goal: Goal) => ({
  id: goal.id,
  period_id: goal.periodId,
  title: goal.title,
  notes: toDbNull(goal.notes),
  deadline: toDbNull(goal.deadline),
  priority: toDbNull(goal.priority),
  status: goal.status,
});

export const fromDbGoal = (row: any): Goal => ({
  id: row.id,
  userId: row.user_id,
  periodId: row.period_id,
  title: row.title,
  notes: fromDbNull(row.notes),
  deadline: fromDbNull(row.deadline),
  priority: fromDbNull(row.priority) as Priority | undefined,
  status: row.status as EntityStatus,
  createdAt: fromDbNull(row.created_at),
});

// --- NonGoal ---
export const toDbNonGoal = (nonGoal: NonGoal) => ({
  id: nonGoal.id,
  period_id: nonGoal.periodId,
  title: nonGoal.title,
  notes: toDbNull(nonGoal.notes),
});

export const fromDbNonGoal = (row: any): NonGoal => ({
  id: row.id,
  userId: row.user_id,
  periodId: row.period_id,
  title: row.title,
  notes: fromDbNull(row.notes),
  createdAt: fromDbNull(row.created_at),
});

// --- Project ---
export const toDbProject = (project: Project) => ({
  id: project.id,
  period_id: project.periodId,
  goal_id: toDbNull(project.goalId),
  title: project.title,
  notes: toDbNull(project.notes),
  deadline: toDbNull(project.deadline),
  priority: toDbNull(project.priority),
  status: project.status,
});

export const fromDbProject = (row: any): Project => ({
  id: row.id,
  userId: row.user_id,
  periodId: row.period_id,
  goalId: fromDbNull(row.goal_id),
  title: row.title,
  notes: fromDbNull(row.notes),
  deadline: fromDbNull(row.deadline),
  priority: fromDbNull(row.priority) as Priority | undefined,
  status: row.status as ExtendedStatus,
  createdAt: fromDbNull(row.created_at),
});

// --- Task ---
export const toDbTask = (task: Task) => ({
  id: task.id,
  period_id: task.periodId,
  project_id: toDbNull(task.projectId),
  goal_id: toDbNull(task.goalId),
  title: task.title,
  notes: toDbNull(task.notes),
  deadline: toDbNull(task.deadline),
  priority: toDbNull(task.priority),
  status: task.status,
});

export const fromDbTask = (row: any): Task => ({
  id: row.id,
  userId: row.user_id,
  periodId: row.period_id,
  projectId: fromDbNull(row.project_id),
  goalId: fromDbNull(row.goal_id),
  title: row.title,
  notes: fromDbNull(row.notes),
  deadline: fromDbNull(row.deadline),
  priority: fromDbNull(row.priority) as Priority | undefined,
  status: row.status as ExtendedStatus,
  createdAt: fromDbNull(row.created_at),
});

// --- Event ---
export const toDbEvent = (event: import('@/types').Event) => ({
  id: event.id,
  title: event.title,
  date: event.date,
  notes: toDbNull(event.notes),
});

export const fromDbEvent = (row: any): import('@/types').Event => ({
  id: row.id,
  userId: row.user_id,
  title: row.title,
  date: row.date,
  notes: fromDbNull(row.notes),
  createdAt: fromDbNull(row.created_at),
});
