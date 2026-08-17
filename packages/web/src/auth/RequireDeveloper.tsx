import { Navigate, Outlet } from 'react-router';
import { useAuth } from './AuthContext.tsx';

// Defense-in-depth alongside the server's real requireDeveloper
// enforcement, not a security boundary on its own - a client who
// somehow lands on a developer-only route (e.g. /settings) is sent
// home rather than shown a page whose every action would 403 anyway.
// Always nested under RequireAuth in App.tsx, so status is never
// 'loading'/'unauthenticated' here in practice, but both are handled
// the same conservative way (render nothing / redirect) regardless.
export function RequireDeveloper() {
  const { status, user } = useAuth();

  if (status !== 'authenticated' || !user) {
    return null;
  }

  if (user.role !== 'developer') {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
