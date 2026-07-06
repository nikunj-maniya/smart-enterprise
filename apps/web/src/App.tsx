import { Routes, Route, Navigate, Link } from 'react-router-dom';
import { SystemRoleKey } from '@se/shared';
import { PageHeader } from '@/components/shell/PageHeader';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import ChangePassword from '@/pages/ChangePassword';
import ForgotPassword from '@/pages/ForgotPassword';
import SetNewPassword from '@/pages/SetNewPassword';
import Join from '@/pages/Join';
import Profile from '@/pages/Profile';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { RequireRole } from '@/components/RequireRole';
import { AppShell } from '@/components/shell/AppShell';
import Overview from '@/pages/console/Overview';
import Registrations from '@/pages/console/Registrations';
import Enterprises from '@/pages/console/Enterprises';
import PlatformUsers from '@/pages/console/PlatformUsers';
import AuditLog from '@/pages/console/AuditLog';
import Settings from '@/pages/console/Settings';
import OrgUsers from '@/pages/organization/Users';
import Departments from '@/pages/organization/Departments';
import Roles from '@/pages/organization/Roles';
import Projects from '@/pages/organization/Projects';
import { useAuth } from '@/lib/auth';

/** Landing routes each persona to their home. Employee request screens land in a later change. */
function Home() {
  const { user } = useAuth();
  if (user?.isSystemAdmin) return <Overview />;
  if (user?.roles.includes(SystemRoleKey.EnterpriseAdmin)) {
    return <Navigate to="/organization/users" replace />;
  }
  return <MemberHome />;
}

/** Placeholder home for members with no admin section yet (request screens arrive in a later change). */
function MemberHome() {
  const { user } = useAuth();
  return (
    <>
      <PageHeader
        title={`Welcome, ${user?.name?.split(' ')[0] ?? ''}`.trim()}
        subtitle="Your request workspace is being set up."
        breadcrumb={user?.tenantName ?? 'Workspace'}
      />
      <div className="mt-6 rounded-lg border border-dashed border-line bg-surface p-12 text-center text-sm text-ink-400">
        Request forms (Leave, WFH, Visitor, IT) will appear here soon. In the meantime you can
        update your details from{' '}
        <Link to="/profile" className="font-semibold text-brand-hover">
          your profile
        </Link>
        .
      </div>
    </>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<SetNewPassword />} />
      <Route path="/join/:token" element={<Join />} />
      <Route
        path="/change-password"
        element={
          <ProtectedRoute>
            <ChangePassword />
          </ProtectedRoute>
        }
      />
      <Route
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<Home />} />
        <Route path="/registrations" element={<Registrations />} />
        <Route path="/enterprises" element={<Enterprises />} />
        <Route path="/users" element={<PlatformUsers />} />
        <Route path="/audit" element={<AuditLog />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/profile" element={<Profile />} />
        <Route
          path="/organization/users"
          element={
            <RequireRole role={SystemRoleKey.EnterpriseAdmin}>
              <OrgUsers />
            </RequireRole>
          }
        />
        <Route
          path="/organization/departments"
          element={
            <RequireRole role={SystemRoleKey.EnterpriseAdmin}>
              <Departments />
            </RequireRole>
          }
        />
        <Route
          path="/organization/roles"
          element={
            <RequireRole role={SystemRoleKey.EnterpriseAdmin}>
              <Roles />
            </RequireRole>
          }
        />
        <Route
          path="/organization/projects"
          element={
            <RequireRole role={SystemRoleKey.EnterpriseAdmin}>
              <Projects />
            </RequireRole>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
