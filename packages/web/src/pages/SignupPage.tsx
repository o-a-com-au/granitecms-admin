import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { useAuth } from '../auth/AuthContext.tsx';
import { PasswordInput } from '../components/PasswordInput.tsx';
import { isStrongPassword, MIN_PASSWORD_LENGTH, PASSWORD_REQUIREMENTS_MESSAGE } from '../auth/passwordStrength.ts';

// Public, a sibling of /login in App.tsx - self-serve developer
// signup. No username field anywhere - it's derived from email
// server-side, matching every other account-creation path in this
// codebase (OAuth, the email-invite claim flow).
export function SignupPage() {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    if (!isStrongPassword(password)) {
      setError(PASSWORD_REQUIREMENTS_MESSAGE);
      return;
    }
    setSubmitting(true);
    try {
      await signup({ name, email, password });
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create your account');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <p className="login-logo" aria-hidden="true">
          Granite CMS
        </p>
        <h1>Sign up</h1>
        <form onSubmit={handleSubmit}>
          <label>
            Name
            <input value={name} onChange={(event) => setName(event.target.value)} required />
          </label>
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
            />
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
          {error && <p role="alert">{error}</p>}
          <button type="submit" disabled={submitting}>
            Create account
          </button>
        </form>
        <p>
          Already have an account? <Link to="/login">Log in</Link>
        </p>
      </div>
    </div>
  );
}
