import { Navigate, Outlet, useLocation } from 'react-router';
import { useAuth } from './AuthContext.tsx';

// B1: an unauthenticated visitor is redirected to a login screen for
// every route except login itself. Applied by wrapping protected
// <Route> elements under a parent <Route element={<RequireAuth/>}>
// in App.tsx, not per-page - a new protected page never needs to
// remember to add this itself.
export function RequireAuth() {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return null;
  }

  if (status === 'unauthenticated') {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}
