import { Navigate, Outlet, useLocation } from 'react-router';
import { FullPageSpinner } from '../../components/FullPageSpinner';
import { useAuth } from './api';

export interface RedirectState {
  from?: string;
}

export function ProtectedRoute() {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) return <FullPageSpinner />;
  if (!user) {
    const state: RedirectState = { from: location.pathname + location.search };
    return <Navigate to="/login" replace state={state} />;
  }
  return <Outlet />;
}

// Signing in sets the user in the cache, and this guard then sends them back to where
// ProtectedRoute bounced them from. The pages don't navigate themselves.
export function PublicOnlyRoute() {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) return <FullPageSpinner />;
  if (user) return <Navigate to={redirectTarget(location.state)} replace />;
  return <Outlet />;
}

// location.state is `unknown`: anything could have put it there, so check its shape.
function redirectTarget(state: unknown): string {
  const from =
    typeof state === 'object' && state !== null && 'from' in state ? state.from : undefined;
  // Only same-app paths; "//evil.com" would be read as a protocol-relative URL.
  return typeof from === 'string' && from.startsWith('/') && !from.startsWith('//') ? from : '/';
}
