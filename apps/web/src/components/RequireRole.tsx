import { Navigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';

/** Gates a route to users holding the given role key. Assumes ProtectedRoute already ran. */
export function RequireRole({ role, children }: { role: string; children: React.ReactNode }) {
  const { user } = useAuth();
  if (!user?.roles.includes(role)) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}
