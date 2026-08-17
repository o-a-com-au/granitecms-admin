import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { useAuth } from '../auth/AuthContext.tsx';
import { getOAuthProviders } from '../api/auth.ts';
import { PasswordInput } from '../components/PasswordInput.tsx';

// One fixed message regardless of failure cause, mirroring the
// backend's own indistinguishable wrong-username/wrong-password
// response - B2's "no information leak about which field was wrong"
// applies here too, not just server-side.
const GENERIC_ERROR = 'Invalid username or password';

const PROVIDER_LABELS: Record<string, string> = {
  google: 'Sign in with Google',
  github: 'Sign in with GitHub',
};

interface LocationState {
  from?: { pathname: string };
}

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [oauthProviders, setOauthProviders] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    getOAuthProviders().then((providers) => {
      if (!cancelled) {
        setOauthProviders(providers);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const from = (location.state as LocationState | null)?.from?.pathname ?? '/';

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(username, password);
      navigate(from, { replace: true });
    } catch {
      setError(GENERIC_ERROR);
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
        <h1>Log in</h1>
        <form onSubmit={handleSubmit}>
          <label>
            {/* "Username or email" - every account except the one
                bootstrap admin now has username === email, since
                nothing asks a human to pick a username any more. */}
            Username or email
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              required
            />
          </label>
          <PasswordInput
            label="Password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
          />
          {error && <p role="alert">{error}</p>}
          <button type="submit" disabled={submitting}>
            Log in
          </button>
        </form>
        {oauthProviders.length > 0 && (
          <div className="login-oauth">
            {oauthProviders.map((provider) => (
              // A real full-page link, not a fetch-triggering button -
              // this starts a genuine browser redirect into the OAuth
              // authorization flow, not an XHR.
              <a key={provider} className="login-oauth-button" href={`/api/auth/${provider}`}>
                {PROVIDER_LABELS[provider] ?? `Sign in with ${provider}`}
              </a>
            ))}
          </div>
        )}
        <p>
          Don&apos;t have an account? <Link to="/signup">Sign up</Link>
        </p>
      </div>
    </div>
  );
}
