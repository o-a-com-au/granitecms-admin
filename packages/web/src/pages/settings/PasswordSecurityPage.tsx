import { useState, type FormEvent } from 'react';
import { changePassword } from '../../api/account.ts';
import { PasswordInput } from '../../components/PasswordInput.tsx';
import { isStrongPassword, MIN_PASSWORD_LENGTH, PASSWORD_REQUIREMENTS_MESSAGE } from '../../auth/passwordStrength.ts';

// Reachable by both roles - a client changes their own password here
// too, not just developers.
export function PasswordSecurityPage() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordChanged, setPasswordChanged] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

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
    <section>
      <h2>Password and Security</h2>
      <form onSubmit={handlePasswordSubmit}>
        <PasswordInput
          label="Current Password"
          value={currentPassword}
          onChange={(event) => setCurrentPassword(event.target.value)}
          autoComplete="current-password"
          required
        />
        <PasswordInput
          label="New Password"
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
          Save
        </button>
      </form>
    </section>
  );
}
