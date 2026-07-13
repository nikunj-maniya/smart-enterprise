import { Routes, Route, Navigate } from 'react-router-dom';
import { SystemRoleKey } from '@se/shared';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import ChangePassword from '@/pages/ChangePassword';
import ForgotPassword from '@/pages/ForgotPassword';
import SetNewPassword from '@/pages/SetNewPassword';
import Join from '@/pages/Join';
import Profile from '@/pages/Profile';
import Notifications from '@/pages/Notifications';
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
import CompanyDetails from '@/pages/organization/CompanyDetails';
import FormBuilder from '@/pages/organization/FormBuilder';
import LeavePolicy from '@/pages/organization/LeavePolicy';
import ItemCatalog from '@/pages/organization/ItemCatalog';
import NewRequest from '@/pages/requests/NewRequest';
import RequestForm from '@/pages/requests/RequestForm';
import MyRequests from '@/pages/requests/MyRequests';
import ApprovalsQueue from '@/pages/requests/ApprovalsQueue';
import HrSignoffs from '@/pages/requests/HrSignoffs';
import HrAbsences from '@/pages/requests/HrAbsences';
import FrontDesk from '@/pages/requests/FrontDesk';
import FulfilmentQueue from '@/pages/requests/FulfilmentQueue';
import AbsenceCalendar from '@/pages/organization/AbsenceCalendar';
import SlackIntegration from '@/pages/organization/SlackIntegration';
import Reports from '@/pages/requests/Reports';
import { OfflineBanner } from '@/components/shell/OfflineBanner';
import { useAuth } from '@/lib/auth';

/** Landing routes each persona to their home: System Admin → platform overview, Enterprise Admin → org users, everyone else → My Requests. */
function Home() {
  const { user } = useAuth();
  if (user?.isSystemAdmin) return <Overview />;
  if (user?.roles.includes(SystemRoleKey.EnterpriseAdmin)) {
    return <Navigate to="/organization/users" replace />;
  }
  return <Navigate to="/requests" replace />;
}

export default function App() {
  return (
    <>
      <OfflineBanner />
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
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/requests" element={<MyRequests />} />
        <Route path="/requests/mine" element={<MyRequests />} />
        <Route path="/requests/approvals" element={<ApprovalsQueue />} />
        <Route path="/requests/hr-signoffs" element={<HrSignoffs />} />
        <Route path="/requests/absences" element={<HrAbsences />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/front-desk" element={<FrontDesk />} />
        <Route path="/requests/fulfilment-queue" element={<FulfilmentQueue />} />
        <Route path="/requests/new" element={<NewRequest />} />
        <Route path="/requests/new/:key" element={<RequestForm />} />
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
        <Route
          path="/organization/details"
          element={
            <RequireRole role={SystemRoleKey.EnterpriseAdmin}>
              <CompanyDetails />
            </RequireRole>
          }
        />
        <Route
          path="/organization/form-builder"
          element={
            <RequireRole role={SystemRoleKey.EnterpriseAdmin}>
              <FormBuilder />
            </RequireRole>
          }
        />
        <Route
          path="/organization/leave-policy"
          element={
            <RequireRole role={SystemRoleKey.EnterpriseAdmin}>
              <LeavePolicy />
            </RequireRole>
          }
        />
        <Route
          path="/organization/item-catalog"
          element={
            <RequireRole role={SystemRoleKey.EnterpriseAdmin}>
              <ItemCatalog />
            </RequireRole>
          }
        />
        <Route
          path="/organization/absence-calendar"
          element={
            <RequireRole role={SystemRoleKey.EnterpriseAdmin}>
              <AbsenceCalendar />
            </RequireRole>
          }
        />
        <Route
          path="/organization/slack"
          element={
            <RequireRole role={SystemRoleKey.EnterpriseAdmin}>
              <SlackIntegration />
            </RequireRole>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
