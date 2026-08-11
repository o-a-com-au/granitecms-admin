import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

export type Theme = 'light' | 'dark';

// Must match the inline bootstrap script in index.html, which sets
// documentElement's data-theme before React ever mounts (avoiding a
// flash of the wrong theme on load) - it reads this exact key.
const STORAGE_KEY = 'cms-admin-theme';

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

// localStorage access is wrapped, not called bare - it can throw in
// real browsers (Safari private browsing, all-cookies-blocked
// settings), and in this project's own test environment the global
// is simply undefined (Node's own experimental localStorage shadows
// jsdom's, inert without a CLI flag neither this app nor its tests
// pass). Either way the toggle should still work for the session, it
// just won't persist across a reload.
function readStoredTheme(): Theme | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : null;
  } catch {
    return null;
  }
}

function writeStoredTheme(theme: Theme): void {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // See readStoredTheme - unavailable/blocked storage is expected,
    // not an error worth surfacing.
  }
}

function readInitialTheme(): Theme {
  const stored = readStoredTheme();
  if (stored) {
    return stored;
  }
  // Dark is the app's own long-standing default look (every mockup in
  // docs/design was built against it), not just a system-preference
  // passthrough - only follow the OS toward light explicitly, never
  // away from it. matchMedia doesn't exist in the jsdom test
  // environment either, so this has to be guarded the same way.
  const prefersLight = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: light)').matches;
  return prefersLight ? 'light' : 'dark';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(readInitialTheme);

  // Re-applies on every change, not just once - keeps
  // documentElement's data-theme (set synchronously by index.html's
  // bootstrap script before this ever runs) in sync with React state
  // once the user actually toggles it.
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    writeStoredTheme(theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((current) => (current === 'dark' ? 'light' : 'dark'));
  }, []);

  return <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
