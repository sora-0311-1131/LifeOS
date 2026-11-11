import { create } from 'zustand';
import { Period, Goal, NonGoal, Project, Task, Event, ViewPreference, ViewPreferenceKey, SortField, SortOrder } from '@/types';
import { createClient } from '@/utils/supabase/client';
import {
  fromDbPeriod, toDbPeriod,
  fromDbGoal, toDbGoal,
  fromDbNonGoal, toDbNonGoal,
  fromDbProject, toDbProject,
  fromDbTask, toDbTask,
  fromDbEvent, toDbEvent
} from '@/utils/supabase/mapper';

export interface ViewPreferencesState {
  goals: ViewPreference;
  projects: ViewPreference;
  tasks: ViewPreference;
  expandedProjectGroups: Record<string, boolean>;
  expandedTaskGroups: Record<string, boolean>;
}

export interface DashboardState {
  periods: Period[];
  currentPeriodId: string | null;
  goals: Goal[];
  nonGoals: NonGoal[];
  projects: Project[];
  tasks: Task[];
  events: Event[];
}

interface DashboardStore {
  state: DashboardState;
  viewPreferences: ViewPreferencesState;
  isLoaded: boolean;
  initializeData: (userId?: string) => Promise<void>;
  clearData: () => void;
  setViewPreference: (key: ViewPreferenceKey, updates: Partial<ViewPreference>) => void;
  toggleProjectGroup: (groupId: string) => void;
  toggleTaskGroup: (groupId: string) => void;
  addPeriod: (period: Period) => void;
  updatePeriod: (id: string, updates: Partial<Period>) => void;
  deletePeriod: (id: string) => void;
  setCurrentPeriod: (id: string) => void;
  addGoal: (goal: Goal) => void;
  updateGoal: (id: string, updates: Partial<Goal>) => void;
  deleteGoal: (id: string) => void;
  addNonGoal: (nonGoal: NonGoal) => void;
  updateNonGoal: (id: string, updates: Partial<NonGoal>) => void;
  deleteNonGoal: (id: string) => void;
  addProject: (project: Project) => void;
  updateProject: (id: string, updates: Partial<Project>) => void;
  deleteProject: (id: string) => void;
  addTask: (task: Task) => void;
  updateTask: (id: string, updates: Partial<Task>) => void;
  deleteTask: (id: string) => void;
  addEvent: (event: Event) => void;
  updateEvent: (id: string, updates: Partial<Event>) => void;
  deleteEvent: (id: string) => void;
}

const initialState: DashboardState = {
  periods: [],
  currentPeriodId: null,
  goals: [],
  nonGoals: [],
  projects: [],
  tasks: [],
  events: [],
};

const defaultViewPreference: ViewPreference = {
  sortField: 'deadline',
  sortOrder: 'asc',
  showDone: false,
};

const defaultViewPreferencesState: ViewPreferencesState = {
  goals: { ...defaultViewPreference },
  projects: { ...defaultViewPreference },
  tasks: { ...defaultViewPreference },
  expandedProjectGroups: { unassigned: true },
  expandedTaskGroups: { unassigned: true },
};

const LAST_SELECTED_PERIOD_KEY = 'personal-dashboard-last-period-id';
const VIEW_PREFERENCES_KEY = 'personal-dashboard-view-preferences';

const VALID_SORT_FIELDS: SortField[] = ['deadline', 'priority', 'status', 'title', 'createdAt'];
const VALID_SORT_ORDERS: SortOrder[] = ['asc', 'desc'];

const sanitizeViewPref = (raw: unknown): ViewPreference => {
  if (!raw || typeof raw !== 'object') return { ...defaultViewPreference };
  const obj = raw as Record<string, unknown>;
  return {
    sortField: VALID_SORT_FIELDS.includes(obj.sortField as SortField)
      ? (obj.sortField as SortField)
      : defaultViewPreference.sortField,
    sortOrder: VALID_SORT_ORDERS.includes(obj.sortOrder as SortOrder)
      ? (obj.sortOrder as SortOrder)
      : defaultViewPreference.sortOrder,
    showDone: typeof obj.showDone === 'boolean' ? obj.showDone : defaultViewPreference.showDone,
  };
};

const loadViewPreferencesFromStorage = (): ViewPreferencesState => {
  if (typeof window === 'undefined') return defaultViewPreferencesState;
  try {
    const raw = localStorage.getItem(VIEW_PREFERENCES_KEY);
    if (!raw) return defaultViewPreferencesState;
    const parsed = JSON.parse(raw);
    return {
      goals: sanitizeViewPref(parsed?.goals),
      projects: sanitizeViewPref(parsed?.projects),
      tasks: sanitizeViewPref(parsed?.tasks),
      expandedProjectGroups:
        parsed?.expandedProjectGroups && typeof parsed.expandedProjectGroups === 'object'
          ? parsed.expandedProjectGroups
          : { unassigned: true },
      expandedTaskGroups:
        parsed?.expandedTaskGroups && typeof parsed.expandedTaskGroups === 'object'
          ? parsed.expandedTaskGroups
          : { unassigned: true },
    };
  } catch {
    return defaultViewPreferencesState;
  }
};

const saveViewPreferencesToStorage = (prefs: ViewPreferencesState) => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(VIEW_PREFERENCES_KEY, JSON.stringify(prefs));
  } catch (err) {
    console.error('Failed to save view preferences', err);
  }
};

const getDefaultPeriodId = (periods: Period[]): string | null => {
  if (periods.length === 0) return null;
  const d = new Date();
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const activePeriods = periods.filter(p => p.startDate <= today && p.endDate >= today);
  if (activePeriods.length > 0) {
    activePeriods.sort((a, b) => a.id.localeCompare(b.id));
    return activePeriods[0].id;
  }
  return periods[0].id;
};

// Checks whether a key is explicitly present in an updates object (even if its value is undefined).
// This lets callers clear optional fields by passing `undefined`.
const has = (obj: object, key: PropertyKey): boolean =>
  Object.prototype.hasOwnProperty.call(obj, key);

// Normalizes cleared optional fields ('' or undefined) to undefined in the given updates object.
const normalizeOptional = <T extends object>(updates: Partial<T>, keys: (keyof T)[]): Partial<T> => {
  const result: Partial<T> = { ...updates };
  for (const key of keys) {
    const value: unknown = result[key];
    if (has(result, key) && (value === '' || value === undefined)) {
      result[key] = undefined;
    }
  }
  return result;
};

export const useDashboardStore = create<DashboardStore>((set, get) => {
  const supabase = createClient();

  return {
    state: initialState,
    viewPreferences: loadViewPreferencesFromStorage(),
    isLoaded: false,

    clearData: () => set({ state: initialState, isLoaded: false }),

    setViewPreference: (key: ViewPreferenceKey, updates: Partial<ViewPreference>) => {
      set(prev => {
        const nextViewPref: ViewPreference = {
          ...prev.viewPreferences[key],
          ...updates,
        };
        const nextPrefs: ViewPreferencesState = {
          ...prev.viewPreferences,
          [key]: nextViewPref,
        };
        saveViewPreferencesToStorage(nextPrefs);
        return { viewPreferences: nextPrefs };
      });
    },

    toggleProjectGroup: (groupId: string) => {
      set(prev => {
        const nextExpanded = {
          ...prev.viewPreferences.expandedProjectGroups,
          [groupId]: !prev.viewPreferences.expandedProjectGroups[groupId],
        };
        const nextPrefs: ViewPreferencesState = {
          ...prev.viewPreferences,
          expandedProjectGroups: nextExpanded,
        };
        saveViewPreferencesToStorage(nextPrefs);
        return { viewPreferences: nextPrefs };
      });
    },

    toggleTaskGroup: (groupId: string) => {
      set(prev => {
        const nextExpanded = {
          ...prev.viewPreferences.expandedTaskGroups,
          [groupId]: !prev.viewPreferences.expandedTaskGroups[groupId],
        };
        const nextPrefs: ViewPreferencesState = {
          ...prev.viewPreferences,
          expandedTaskGroups: nextExpanded,
        };
        saveViewPreferencesToStorage(nextPrefs);
        return { viewPreferences: nextPrefs };
      });
    },

    initializeData: async (userId?: string) => {
      try {
        const savedPrefs = loadViewPreferencesFromStorage();
        const [
          { data: periodsData },
          { data: goalsData },
          { data: nonGoalsData },
          { data: projectsData },
          { data: tasksData },
          { data: eventsData }
        ] = await Promise.all([
          supabase.from('periods').select('*').order('start_date', { ascending: false }),
          supabase.from('goals').select('*'),
          supabase.from('non_goals').select('*'),
          supabase.from('projects').select('*'),
          supabase.from('tasks').select('*'),
          supabase.from('events').select('*').order('date', { ascending: true })
        ]);

        const fetchedPeriods = (periodsData || []).map(fromDbPeriod).sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());
        const fetchedGoals = (goalsData || []).map(fromDbGoal);
        const fetchedNonGoals = (nonGoalsData || []).map(fromDbNonGoal);
        const fetchedProjects = (projectsData || []).map(fromDbProject);
        const fetchedTasks = (tasksData || []).map(fromDbTask);
        const fetchedEvents = (eventsData || []).map(fromDbEvent);

        let initialPeriodId = null;
        const savedPeriodId = localStorage.getItem(LAST_SELECTED_PERIOD_KEY);
        if (savedPeriodId && fetchedPeriods.some(p => p.id === savedPeriodId)) {
          initialPeriodId = savedPeriodId;
        } else {
          initialPeriodId = getDefaultPeriodId(fetchedPeriods);
          if (initialPeriodId) {
            localStorage.setItem(LAST_SELECTED_PERIOD_KEY, initialPeriodId);
          }
        }

        set({
          state: {
            periods: fetchedPeriods,
            goals: fetchedGoals,
            nonGoals: fetchedNonGoals,
            projects: fetchedProjects,
            tasks: fetchedTasks,
            events: fetchedEvents,
            currentPeriodId: initialPeriodId,
          },
          viewPreferences: savedPrefs,
          isLoaded: true
        });
      } catch (err) {
        console.error('Failed to load data from Supabase', err);
        set({ isLoaded: true });
      }
    },

    addPeriod: async (period: Period) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { error } = await supabase.from('periods').insert({ ...toDbPeriod(period), user_id: user.id });
      if (error) return console.error('Failed to add period', error);
      
      set(prev => {
        const isFirst = prev.state.periods.length === 0;
        const newPeriods = [...prev.state.periods, period].sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());
        const newCurrentPeriodId = isFirst ? period.id : prev.state.currentPeriodId;
        if (isFirst) localStorage.setItem(LAST_SELECTED_PERIOD_KEY, period.id);
        
        return { state: { ...prev.state, periods: newPeriods, currentPeriodId: newCurrentPeriodId } };
      });
    },

    updatePeriod: async (id: string, rawUpdates: Partial<Period>) => {
      const updates = normalizeOptional(rawUpdates, ['notes']);
      const dbUpdates: Record<string, unknown> = {};
      if (updates.name !== undefined) dbUpdates.name = updates.name;
      if (updates.startDate !== undefined) dbUpdates.start_date = updates.startDate;
      if (updates.endDate !== undefined) dbUpdates.end_date = updates.endDate;
      if (has(updates, 'notes')) dbUpdates.notes = updates.notes ?? null;

      const { error } = await supabase.from('periods').update(dbUpdates).eq('id', id);
      if (error) return console.error('Failed to update period', error);
      
      set(prev => {
        const newPeriods = prev.state.periods.map(p => (p.id === id ? { ...p, ...updates } : p));
        newPeriods.sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());
        return { state: { ...prev.state, periods: newPeriods } };
      });
    },

    deletePeriod: async (id: string) => {
      try {
        await supabase.from('tasks').delete().eq('period_id', id);
        await supabase.from('projects').delete().eq('period_id', id);
        await supabase.from('non_goals').delete().eq('period_id', id);
        await supabase.from('goals').delete().eq('period_id', id);
        await supabase.from('periods').delete().eq('id', id);

        set(prev => {
          const remainingPeriods = prev.state.periods.filter(p => p.id !== id);
          let newCurrentPeriodId = prev.state.currentPeriodId;
          if (prev.state.currentPeriodId === id) {
            newCurrentPeriodId = getDefaultPeriodId(remainingPeriods);
            if (newCurrentPeriodId) localStorage.setItem(LAST_SELECTED_PERIOD_KEY, newCurrentPeriodId);
            else localStorage.removeItem(LAST_SELECTED_PERIOD_KEY);
          }
          return {
            state: {
              ...prev.state,
              periods: remainingPeriods,
              currentPeriodId: newCurrentPeriodId,
              goals: prev.state.goals.filter(g => g.periodId !== id),
              nonGoals: prev.state.nonGoals.filter(ng => ng.periodId !== id),
              projects: prev.state.projects.filter(p => p.periodId !== id),
              tasks: prev.state.tasks.filter(t => t.periodId !== id),
            }
          };
        });
      } catch (err) {
        console.error('Failed to delete period', err);
      }
    },

    setCurrentPeriod: (id: string) => {
      localStorage.setItem(LAST_SELECTED_PERIOD_KEY, id);
      set(prev => ({ state: { ...prev.state, currentPeriodId: id } }));
    },

    addGoal: async (goal: Goal) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const goalWithTimestamp: Goal = {
        ...goal,
        createdAt: goal.createdAt || new Date().toISOString(),
      };
      const { error } = await supabase.from('goals').insert({ ...toDbGoal(goalWithTimestamp), user_id: user.id });
      if (error) return console.error('Failed to add goal', error);
      set(prev => ({ state: { ...prev.state, goals: [...prev.state.goals, goalWithTimestamp] } }));
    },

    updateGoal: async (id: string, rawUpdates: Partial<Goal>) => {
      const updates = normalizeOptional(rawUpdates, ['notes', 'deadline', 'priority']);
      const dbUpdates: Record<string, unknown> = {};
      if (updates.title !== undefined) dbUpdates.title = updates.title;
      if (has(updates, 'notes')) dbUpdates.notes = updates.notes ?? null;
      if (has(updates, 'deadline')) dbUpdates.deadline = updates.deadline ?? null;
      if (has(updates, 'priority')) dbUpdates.priority = updates.priority ?? null;
      if (updates.status !== undefined) dbUpdates.status = updates.status;

      const { error } = await supabase.from('goals').update(dbUpdates).eq('id', id);
      if (error) return console.error('Failed to update goal', error);
      
      set(prev => ({
        state: { ...prev.state, goals: prev.state.goals.map(g => (g.id === id ? { ...g, ...updates } : g)) }
      }));
    },

    deleteGoal: async (id: string) => {
      const { error } = await supabase.from('goals').delete().eq('id', id);
      if (error) return console.error('Failed to delete goal', error);
      set(prev => ({ state: { ...prev.state, goals: prev.state.goals.filter(g => g.id !== id) } }));
    },

    addNonGoal: async (nonGoal: NonGoal) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { error } = await supabase.from('non_goals').insert({ ...toDbNonGoal(nonGoal), user_id: user.id });
      if (error) return console.error('Failed to add non-goal', error);
      set(prev => ({ state: { ...prev.state, nonGoals: [...prev.state.nonGoals, nonGoal] } }));
    },

    updateNonGoal: async (id: string, rawUpdates: Partial<NonGoal>) => {
      const updates = normalizeOptional(rawUpdates, ['notes']);
      const dbUpdates: Record<string, unknown> = {};
      if (updates.title !== undefined) dbUpdates.title = updates.title;
      if (has(updates, 'notes')) dbUpdates.notes = updates.notes ?? null;

      const { error } = await supabase.from('non_goals').update(dbUpdates).eq('id', id);
      if (error) return console.error('Failed to update non-goal', error);
      
      set(prev => ({
        state: { ...prev.state, nonGoals: prev.state.nonGoals.map(ng => (ng.id === id ? { ...ng, ...updates } : ng)) }
      }));
    },

    deleteNonGoal: async (id: string) => {
      const { error } = await supabase.from('non_goals').delete().eq('id', id);
      if (error) return console.error('Failed to delete non-goal', error);
      set(prev => ({ state: { ...prev.state, nonGoals: prev.state.nonGoals.filter(ng => ng.id !== id) } }));
    },

    addProject: async (project: Project) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const projectWithTimestamp: Project = {
        ...project,
        createdAt: project.createdAt || new Date().toISOString(),
      };
      const { error } = await supabase.from('projects').insert({ ...toDbProject(projectWithTimestamp), user_id: user.id });
      if (error) return console.error('Failed to add project', error);
      set(prev => ({ state: { ...prev.state, projects: [...prev.state.projects, projectWithTimestamp] } }));
    },

    updateProject: async (id: string, rawUpdates: Partial<Project>) => {
      const updates = normalizeOptional(rawUpdates, ['goalId', 'notes', 'deadline', 'priority']);
      const dbUpdates: Record<string, unknown> = {};
      if (updates.title !== undefined) dbUpdates.title = updates.title;
      if (has(updates, 'goalId')) dbUpdates.goal_id = updates.goalId ?? null;
      if (has(updates, 'notes')) dbUpdates.notes = updates.notes ?? null;
      if (has(updates, 'deadline')) dbUpdates.deadline = updates.deadline ?? null;
      if (has(updates, 'priority')) dbUpdates.priority = updates.priority ?? null;
      if (updates.status !== undefined) dbUpdates.status = updates.status;

      const { error } = await supabase.from('projects').update(dbUpdates).eq('id', id);
      if (error) return console.error('Failed to update project', error);
      
      set(prev => ({
        state: { ...prev.state, projects: prev.state.projects.map(p => (p.id === id ? { ...p, ...updates } : p)) }
      }));
    },

    deleteProject: async (id: string) => {
      try {
        await supabase.from('tasks').update({ project_id: null }).eq('project_id', id);
        const { error } = await supabase.from('projects').delete().eq('id', id);
        if (error) throw error;

        set(prev => ({
          state: {
            ...prev.state,
            projects: prev.state.projects.filter(p => p.id !== id),
            tasks: prev.state.tasks.map(t => t.projectId === id ? { ...t, projectId: undefined } : t),
          }
        }));
      } catch (err) {
        console.error('Failed to delete project', err);
      }
    },

    addTask: async (task: Task) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const taskWithTimestamp: Task = {
        ...task,
        createdAt: task.createdAt || new Date().toISOString(),
      };
      const { error } = await supabase.from('tasks').insert({ ...toDbTask(taskWithTimestamp), user_id: user.id });
      if (error) return console.error('Failed to add task', error);
      set(prev => ({ state: { ...prev.state, tasks: [...prev.state.tasks, taskWithTimestamp] } }));
    },

    updateTask: async (id: string, rawUpdates: Partial<Task>) => {
      const updates = normalizeOptional(rawUpdates, ['projectId', 'goalId', 'notes', 'deadline', 'priority']);
      const dbUpdates: Record<string, unknown> = {};
      if (updates.title !== undefined) dbUpdates.title = updates.title;
      if (has(updates, 'projectId')) dbUpdates.project_id = updates.projectId ?? null;
      if (has(updates, 'goalId')) dbUpdates.goal_id = updates.goalId ?? null;
      if (has(updates, 'notes')) dbUpdates.notes = updates.notes ?? null;
      if (has(updates, 'deadline')) dbUpdates.deadline = updates.deadline ?? null;
      if (has(updates, 'priority')) dbUpdates.priority = updates.priority ?? null;
      if (updates.status !== undefined) dbUpdates.status = updates.status;

      const { error } = await supabase.from('tasks').update(dbUpdates).eq('id', id);
      if (error) return console.error('Failed to update task', error);
      
      set(prev => ({
        state: { ...prev.state, tasks: prev.state.tasks.map(t => (t.id === id ? { ...t, ...updates } : t)) }
      }));
    },

    deleteTask: async (id: string) => {
      const { error } = await supabase.from('tasks').delete().eq('id', id);
      if (error) return console.error('Failed to delete task', error);
      set(prev => ({ state: { ...prev.state, tasks: prev.state.tasks.filter(t => t.id !== id) } }));
    },

    addEvent: async (event: Event) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { error } = await supabase.from('events').insert({ ...toDbEvent(event), user_id: user.id });
      if (error) {
        alert(`Failed to add event: ${error.message} \nDetails: ${error.details} \nHint: ${error.hint}`);
        return console.error('Failed to add event', error);
      }
      set(prev => ({ state: { ...prev.state, events: [...prev.state.events, event] } }));
    },


    updateEvent: async (id: string, rawUpdates: Partial<Event>) => {
      const updates = normalizeOptional(rawUpdates, ['notes']);
      const dbUpdates: Record<string, unknown> = {};
      if (updates.title !== undefined) dbUpdates.title = updates.title;
      if (updates.date !== undefined) dbUpdates.date = updates.date;
      if (has(updates, 'notes')) dbUpdates.notes = updates.notes ?? null;

      const { error } = await supabase.from('events').update(dbUpdates).eq('id', id);
      if (error) return console.error('Failed to update event', error);
      
      set(prev => ({
        state: { ...prev.state, events: prev.state.events.map(e => (e.id === id ? { ...e, ...updates } : e)) }
      }));
    },

    deleteEvent: async (id: string) => {
      const { error } = await supabase.from('events').delete().eq('id', id);
      if (error) return console.error('Failed to delete event', error);
      set(prev => ({ state: { ...prev.state, events: prev.state.events.filter(e => e.id !== id) } }));
    }
  };
});
