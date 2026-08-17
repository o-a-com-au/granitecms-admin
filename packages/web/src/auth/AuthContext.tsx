import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { getMe, login as apiLogin, logout as apiLogout, signup as apiSignup } from '../api/auth.ts';
import type { CurrentUser } from '../api/auth.ts';

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

interface AuthContextValue {
  status: AuthStatus;
  user: CurrentUser | null;
  login: (username: string, password: string) => Promise<void>;
  signup: (input: { name: string; email: string; password: string; timezone: string }) => Promise<void>;
  logout: () => Promise<void>;
  // Re-fetches /me and updates user/status in place, without a full
  // page navigation - what the pause popover item and the paused
  // notice's Resume button both call after changing the account's
  // status server-side, so RequireAuth immediately sees the new
  // user.status on its very next render.
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<CurrentUser | null>(null);

  const refresh = useCallback(async () => {
    try {
      const currentUser = await getMe();
      setUser(currentUser);
      setStatus(currentUser ? 'authenticated' : 'unauthenticated');
    } catch {
      setUser(null);
      setStatus('unauthenticated');
    }
  }, []);

  // This one call on mount is what makes B3's reload-persistence
  // visible client-side: the session cookie rides along
  // automatically, so a 200 here means the browser was already
  // logged in before this component ever rendered.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(async (username: string, password: string) => {
    const currentUser = await apiLogin(username, password);
    setUser(currentUser);
    setStatus('authenticated');
  }, []);

  const signup = useCallback(async (input: { name: string; email: string; password: string; timezone: string }) => {
    const currentUser = await apiSignup(input);
    setUser(currentUser);
    setStatus('authenticated');
  }, []);

  const logout = useCallback(async () => {
    await apiLogout();
    setUser(null);
    setStatus('unauthenticated');
  }, []);

  return <AuthContext.Provider value={{ status, user, login, signup, logout, refresh }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
