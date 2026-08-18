import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useAuth } from '../auth/AuthContext.tsx';
import { getInvite, claimInvite, type InviteInfo } from '../api/site-invites.ts';
import { writeLastSiteId, resolveEditorHref } from '../sites/currentSite.ts';
import { PasswordInput } from '../components/PasswordInput.tsx';
import { isStrongPassword, MIN_PASSWORD_LENGTH, PASSWORD_REQUIREMENTS_MESSAGE } from '../auth/passwordStrength.ts';

const INVALID_REASON_MESSAGES: Record<'expired' | 'claimed' | 'not-found', string> = {
  expired: 'This invite has expired. Ask whoever sent it to send a new one.',
  claimed: 'This invite has already been used.',
  'not-found': 'This invite is not valid.',
};

// A public route (App.tsx registers it outside RequireAuth, a sibling
// of /login) - whoever opens the emailed link has no session yet, or
// is exactly the "already have an account, just add this site" case.
export function ClaimInvitePage() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { status, refresh } = useAuth();

  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState('');
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);

  useEffect(() => {
    if (!code) {
      return;
    }
    let cancelled = false;
    getInvite(code)
      .then((result) => {
        if (!cancelled) {
          setInfo(result);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Failed to load this invite');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [code]);

  async function landInSite(siteId: string): Promise<void> {
    writeLastSiteId(siteId);
    navigate(resolveEditorHref(siteId), { replace: true });
  }

  async function handleAccept(): Promise<void> {
    if (!code) {
      return;
    }
    setClaimError(null);
    setClaiming(true);
    try {
      const { siteId } = await claimInvite(code);
      await landInSite(siteId);
    } catch (err) {
      setClaimError(err instanceof Error ? err.message : 'Failed to accept this invite');
    } finally {
      setClaiming(false);
    }
  }

  async function handleSignupSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!code) {
      return;
    }
    setClaimError(null);
    if (!isStrongPassword(password)) {
      setClaimError(PASSWORD_REQUIREMENTS_MESSAGE);
      return;
    }
    setClaiming(true);
    try {
      // Invisible - no visible Timezone field on this form. The one
      // real browser signal available at account-creation time,
      // editable afterward via Account Details.
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const { siteId } = await claimInvite(code, { firstName, lastName, password, timezone });
      // The claim response set a fresh session cookie - refresh()
      // picks it up so the rest of the app (AppShell, RequireAuth)
      // treats this visitor as logged in from here on, with no
      // separate login step.
      await refresh();
      await landInSite(siteId);
    } catch (err) {
      setClaimError(err instanceof Error ? err.message : 'Failed to accept this invite');
    } finally {
      setClaiming(false);
    }
  }

  if (loadError) {
    return (
      <div className="login-page">
        <div className="login-card">
          <h1>Invite error</h1>
          <p role="alert">{loadError}</p>
        </div>
      </div>
    );
  }

  if (status === 'loading' || info === null) {
    return null;
  }

  if (!info.valid) {
    return (
      <div className="login-page">
        <div className="login-card">
          <h1>Invite not available</h1>
          <p>{INVALID_REASON_MESSAGES[info.reason]}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <p className="login-logo" aria-hidden="true">
          Granite CMS
        </p>
        <h1>You&apos;re invited</h1>
        <p>{`You've been invited to manage ${info.siteUrl}.`}</p>

        {status === 'authenticated' ? (
          <>
            {claimError && <p role="alert">{claimError}</p>}
            <button type="button" className="button-primary" onClick={() => void handleAccept()} disabled={claiming}>
              Accept invite
            </button>
          </>
        ) : (
          <form onSubmit={handleSignupSubmit}>
            <label>
              Email
              <input value={info.email} disabled readOnly />
            </label>
            <label>
              First Name
              <input value={firstName} onChange={(event) => setFirstName(event.target.value)} required />
            </label>
            <label>
              Last Name
              <input value={lastName} onChange={(event) => setLastName(event.target.value)} />
            </label>
            <PasswordInput
              label="Password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              minLength={MIN_PASSWORD_LENGTH}
              required
              hint={PASSWORD_REQUIREMENTS_MESSAGE}
            />
            {claimError && <p role="alert">{claimError}</p>}
            <button type="submit" disabled={claiming}>
              Create account
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
