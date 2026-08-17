import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '../auth/AuthContext.tsx';
import { updateAccount, changePassword } from '../api/account.ts';

// Reachable by both roles (unlike /settings) - a client manages their
// own name/email/password here too, not just developers.
export function AccountPage() {
  const { user, refresh } = useAuth();

  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');

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
      await updateAccount({ name, email });
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
              Username
              {/* Not editable - it's the account's own id and a
                  foreign key throughout (site access grants, site
                  ownership, the session itself), so it stays fixed. */}
              <input value={user?.username ?? ''} disabled readOnly />
            </label>
            <label>
              Name
              <input value={name} onChange={(event) => setName(event.target.value)} required />
            </label>
            <label>
              Email
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
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
            <label>
              Current password
              <input
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                autoComplete="current-password"
                required
              />
            </label>
            <label>
              New password
              <input
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                autoComplete="new-password"
                required
              />
            </label>
            <label>
              Confirm new password
              <input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                autoComplete="new-password"
                required
              />
            </label>
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
