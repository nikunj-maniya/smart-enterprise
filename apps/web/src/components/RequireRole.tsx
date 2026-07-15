import { Navigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';

/** Gates a route to users holding the given role key (or at least one, if given a list).
 *  Assumes ProtectedRoute already ran. */
export function RequireRole({ role, children }: { role: string | string[]; children: React.ReactNode }) {
  const { user } = useAuth();
  const roles = Array.isArray(role) ? role : [role];
  if (!roles.some((r) => user?.roles.includes(r))) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}
