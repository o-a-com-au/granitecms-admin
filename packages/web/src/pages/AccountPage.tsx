import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '../auth/AuthContext.tsx';
import { updateAccount, changePassword } from '../api/account.ts';
import { PasswordInput } from '../components/PasswordInput.tsx';
import { isStrongPassword, MIN_PASSWORD_LENGTH, PASSWORD_REQUIREMENTS_MESSAGE } from '../auth/passwordStrength.ts';

// 'UTC' explicitly included, not just Intl.supportedValuesOf('timeZone')
// alone - at least on some ICU builds that list omits 'UTC' entirely
// despite it being the real, valid default new/backfilled accounts
// actually carry (see packages/server/src/auth/timezone.ts's own
// comment on the same gap). Without it, an account whose timezone
// really is 'UTC' would render this <select> with no matching option
// selected. Computed once at module load, not per render - static and
// the same list every time.
const TIMEZONE_OPTIONS = Array.from(new Set(['UTC', ...Intl.supportedValuesOf('timeZone')])).sort();

// Reachable by both roles (unlike /settings) - a client manages their
// own name/email/password here too, not just developers.
export function AccountPage() {
  const { user, refresh } = useAuth();

  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [timezone, setTimezone] = useState(user?.timezone ?? 'UTC');

  // In practice this page only ever mounts once RequireAuth has
  // already resolved status to 'authenticated', by which point user
  // is populated - but AuthContext's own user starts out null and
  // only arrives asynchronously (getMe() inside refresh()), so the
  // useState initialisers above can't be trusted alone: they only run
  // once, at first mount. This syncs the fields once user actually
  // arrives (and again after this page's own save calls refresh() -
  // harmless, since local state already matches what was just saved).
  useEffect(() => {
    if (user) {
      setName(user.name);
      setEmail(user.email);
      setTimezone(user.timezone);
    }
  }, [user]);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [detailsSaved, setDetailsSaved] = useState(false);
  const [savingDetails, setSavingDetails] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordChanged, setPasswordChanged] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  async function handleDetailsSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setDetailsError(null);
    setDetailsSaved(false);
    setSavingDetails(true);
    try {
      await updateAccount({ name, email, timezone });
      // Updates the popover's own display immediately, no reload -
      // the same refresh() the pause/resume flow already uses.
      await refresh();
      setDetailsSaved(true);
    } catch (err) {
      setDetailsError(err instanceof Error ? err.message : 'Failed to update your account details');
    } finally {
      setSavingDetails(false);
    }
  }

  async function handlePasswordSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setPasswordError(null);
    setPasswordChanged(false);
    if (newPassword !== confirmPassword) {
      setPasswordError('New password and confirmation do not match');
      return;
    }
    if (!isStrongPassword(newPassword)) {
      setPasswordError(PASSWORD_REQUIREMENTS_MESSAGE);
      return;
    }
    setChangingPassword(true);
    try {
      await changePassword({ currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordChanged(true);
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : 'Failed to change your password');
    } finally {
      setChangingPassword(false);
    }
  }

  return (
    <div className="list-page">
      <div className="list-page-inner">
        <h1>Account details</h1>

        <section>
          <h2>Your details</h2>
          <form onSubmit={handleDetailsSubmit}>
            <label>
              Name
              <input value={name} onChange={(event) => setName(event.target.value)} required />
            </label>
            <label>
              Email
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
            </label>
            <label>
              Timezone
              <select value={timezone} onChange={(event) => setTimezone(event.target.value)} required>
                {TIMEZONE_OPTIONS.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
            </label>
            {detailsError && <p role="alert">{detailsError}</p>}
            {detailsSaved && (
              <p role="status" className="success-notice">
                Account details updated.
              </p>
            )}
            <button type="submit" disabled={savingDetails}>
              Save
            </button>
          </form>
        </section>

        <section>
          <h2>Change password</h2>
          <form onSubmit={handlePasswordSubmit}>
            <PasswordInput
              label="Current password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
            <PasswordInput
              label="New password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              autoComplete="new-password"
              minLength={MIN_PASSWORD_LENGTH}
              required
              hint={PASSWORD_REQUIREMENTS_MESSAGE}
            />
            <PasswordInput
              label="Confirm new password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              autoComplete="new-password"
              required
            />
            {passwordError && <p role="alert">{passwordError}</p>}
            {passwordChanged && (
              <p role="status" className="success-notice">
                Password changed. Any other signed-in sessions have been logged out.
              </p>
            )}
            <button type="submit" disabled={changingPassword}>
              Change password
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
