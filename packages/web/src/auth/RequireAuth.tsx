import { useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router';
import { useAuth } from './AuthContext.tsx';
import { resumeAccount } from '../api/auth.ts';

// B1: an unauthenticated visitor is redirected to a login screen for
// every route except login itself. Applied by wrapping protected
// <Route> elements under a parent <Route element={<RequireAuth/>}>
// in App.tsx, not per-page - a new protected page never needs to
// remember to add this itself.
//
// A paused account is a fourth state, distinct from unauthenticated:
// the session is still genuinely valid (GET /me succeeds - it uses
// requireSession, not requireAuth, for exactly this reason), so this
// renders a dedicated notice instead of bouncing to /login with no
// explanation. Not a redirect either - staying on RequireAuth keeps
// the Resume action reachable from wherever the user already was.
function PausedNotice() {
  const { refresh } = useAuth();
  const [resuming, setResuming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleResume(): Promise<void> {
    setError(null);
    setResuming(true);
    try {
      await resumeAccount();
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resume the account');
    } finally {
      setResuming(false);
    }
  }

  return (
    <div className="paused-notice">
      <h1>Your account is paused</h1>
      <p>Resume it to get back into the admin. Your website stays live and unaffected while paused.</p>
      {error && <p role="alert">{error}</p>}
      <button type="button" className="button-primary" onClick={() => void handleResume()} disabled={resuming}>
        Resume account
      </button>
    </div>
  );
}

export function RequireAuth() {
  const { status, user } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return null;
  }

  if (status === 'unauthenticated') {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (user?.status === 'paused') {
    return <PausedNotice />;
  }

  return <Outlet />;
}
