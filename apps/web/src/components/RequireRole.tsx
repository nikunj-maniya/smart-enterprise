import { Navigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';

/** Gates a route to users holding the given role key (or at least one, if given a list) — or,
 *  with `systemAdmin`, to the platform's System Admin console (`user.isSystemAdmin` is a
 *  separate flag from the tenant `roles` array, so it can't be expressed via `role`).
 *  Assumes ProtectedRoute already ran. */
export function RequireRole({
  role,
  systemAdmin,
  children,
}: {
  role?: string | string[];
  systemAdmin?: boolean;
  children: React.ReactNode;
}) {
  const { user } = useAuth();
  if (systemAdmin) {
    if (!user?.isSystemAdmin) return <Navigate to="/" replace />;
    return <>{children}</>;
  }
  const roles = Array.isArray(role) ? role : role ? [role] : [];
  if (!roles.some((r) => user?.roles.includes(r))) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}
