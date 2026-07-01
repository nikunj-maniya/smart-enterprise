import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/auth';

/** Gates authed routes. Forces the Change Password screen when required. */
export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-ink-400">Loading…</div>;
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  if (user.mustChangePassword && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />;
  }
  return <>{children}</>;
}
