// =============================================================================
// Session  -  who is signed in, and what they may do.
//
// can() here is the SAME function the server enforces with (imported from
// @todo/shared), so the UI and the API can never drift apart on a rule.
// =============================================================================
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, setToken, getToken, onUnauthorized } from './api.js';
import { can as sharedCan } from '@todo/shared';

const SessionContext = createContext(null);
const USER_KEY = 'todo.user';

const readStoredUser = () => {
  try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); } catch { return null; }
};
const writeStoredUser = (user) => {
  try {
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
    else localStorage.removeItem(USER_KEY);
  } catch { /* private mode - the session simply will not survive a reload */ }
};

export function SessionProvider({ children }) {
  const [user, setUser] = useState(readStoredUser);
  const [checking, setChecking] = useState(Boolean(getToken()));

  // Confirm a stored token is still good before trusting the cached user.
  useEffect(() => {
    if (!getToken()) { setChecking(false); return; }
    let live = true;
    api.me()
      .then(({ data }) => { if (live) { setUser(data); writeStoredUser(data); } })
      .catch(() => { if (live) { setUser(null); writeStoredUser(null); setToken(null); } })
      .finally(() => { if (live) setChecking(false); });
    return () => { live = false; };
  }, []);

  // Any 401 anywhere in the app returns us to the login screen.
  useEffect(() => onUnauthorized(() => { setUser(null); writeStoredUser(null); }), []);

  const login = useCallback(async (userId, pin) => {
    const { data } = await api.login(userId, pin);
    setToken(data.token);
    setUser(data.user);
    writeStoredUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    writeStoredUser(null);
  }, []);

  /** Adopt a fresh token, e.g. after "Reset demo data" rebuilds the accounts. */
  const adoptSession = useCallback((token, nextUser) => {
    setToken(token);
    setUser(nextUser);
    writeStoredUser(nextUser);
  }, []);

  const value = useMemo(() => ({
    user,
    checking,
    login,
    logout,
    adoptSession,
    isAdmin: user?.role === 'ADMIN',
    can: (action, ctx) => sharedCan(user, action, ctx),
  }), [user, checking, login, logout, adoptSession]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside <SessionProvider>');
  return ctx;
}
