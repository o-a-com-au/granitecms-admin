import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { getMe, login as apiLogin, logout as apiLogout } from '../api/auth.ts';
import type { CurrentUser } from '../api/auth.ts';

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

interface AuthContextValue {
  status: AuthStatus;
  user: CurrentUser | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<CurrentUser | null>(null);

  // This one call on mount is what makes B3's reload-persistence
  // visible client-side: the session cookie rides along
  // automatically, so a 200 here means the browser was already
  // logged in before this component ever rendered.
  useEffect(() => {
    let cancelled = false;

    getMe()
      .then((currentUser) => {
        if (cancelled) {
          return;
        }
        setUser(currentUser);
        setStatus(currentUser ? 'authenticated' : 'unauthenticated');
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        setUser(null);
        setStatus('unauthenticated');
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const currentUser = await apiLogin(username, password);
    setUser(currentUser);
    setStatus('authenticated');
  }, []);

  const logout = useCallback(async () => {
    await apiLogout();
    setUser(null);
    setStatus('unauthenticated');
  }, []);

  return <AuthContext.Provider value={{ status, user, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
