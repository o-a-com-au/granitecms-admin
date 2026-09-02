import { useState, type FormEvent } from 'react';
import { registerSite, type SiteListEntry } from '../api/sites.ts';

export interface UseRegisterSiteFormResult {
  url: string;
  setUrl: (value: string) => void;
  token: string;
  setToken: (value: string) => void;
  registerError: string | null;
  registering: boolean;
  handleRegister: (event: FormEvent<HTMLFormElement>) => Promise<void>;
}

// Shared by OnboardingPage.tsx (the bare first-run welcome screen) and
// ManageSitesPage.tsx (the normal Settings > Manage Sites view, still
// reachable to register additional sites at any time) - same
// registration mutation either way, only the surrounding chrome/copy
// and what happens on success differ, which onRegistered covers.
export function useRegisterSiteForm(onRegistered: (site: SiteListEntry) => void | Promise<void>): UseRegisterSiteFormResult {
  const [url, setUrl] = useState('');
  const [token, setToken] = useState('');
  const [registerError, setRegisterError] = useState<string | null>(null);
  const [registering, setRegistering] = useState(false);

  async function handleRegister(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setRegisterError(null);
    setRegistering(true);
    try {
      const created = await registerSite(url, token);
      setUrl('');
      setToken('');
      await onRegistered(created);
    } catch (err) {
      setRegisterError(err instanceof Error ? err.message : 'Failed to register the website');
    } finally {
      setRegistering(false);
    }
  }

  return { url, setUrl, token, setToken, registerError, registering, handleRegister };
}
