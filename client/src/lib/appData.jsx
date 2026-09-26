// =============================================================================
// App data  -  the reference data every screen needs: dropdown lists, people
// and projects. Loaded once after sign-in and refreshable after an admin edit.
//
// Dropdown values ALWAYS come from here (the database), never from a literal
// in a component.
// =============================================================================
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from './api.js';

const AppDataContext = createContext(null);

export function AppDataProvider({ children, enabled }) {
  const [state, setState] = useState({ status: 'loading', lists: { statuses: [], priorities: [] }, users: [], projects: [] });

  const load = useCallback(async () => {
    setState((s) => ({ ...s, status: s.status === 'ready' ? 'refreshing' : 'loading' }));
    try {
      const [lists, users, projects] = await Promise.all([api.lists(), api.users(), api.projects()]);
      setState({ status: 'ready', lists: lists.data, users: users.data, projects: projects.data });
    } catch (err) {
      setState((s) => ({ ...s, status: 'error', message: err.message, requestId: err.requestId }));
    }
  }, []);

  useEffect(() => { if (enabled) load(); }, [enabled, load]);

  const value = useMemo(() => {
    const usersById = new Map(state.users.map((u) => [u.id, u]));
    const projectsById = new Map(state.projects.map((p) => [p.id, p]));
    return {
      ...state,
      reload: load,
      usersById,
      projectsById,
      activeUsers: state.users.filter((u) => u.active),
      activeProjects: state.projects.filter((p) => p.active),
      statusLabels: state.lists.statuses.map((s) => s.label),
      priorityLabels: state.lists.priorities.map((p) => p.label),
      // Colour lookups for the grid badges, straight from the stored config.
      statusColor: (label) => state.lists.statuses.find((s) => s.label === label)?.color || '#64748b',
      priorityColor: (label) => state.lists.priorities.find((p) => p.label === label)?.color || '#64748b',
    };
  }, [state, load]);

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export function useAppData() {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error('useAppData must be used inside <AppDataProvider>');
  return ctx;
}
