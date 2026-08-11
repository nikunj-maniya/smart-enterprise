import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { SystemRoleKey } from '@se/shared';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { RequireRole } from '@/components/RequireRole';
import { AppShell } from '@/components/shell/AppShell';
import { OfflineBanner } from '@/components/shell/OfflineBanner';
import { useAuth } from '@/lib/auth';

const Login = lazy(() => import('@/pages/Login'));
const Register = lazy(() => import('@/pages/Register'));
const ChangePassword = lazy(() => import('@/pages/ChangePassword'));
const ForgotPassword = lazy(() => import('@/pages/ForgotPassword'));
const SetNewPassword = lazy(() => import('@/pages/SetNewPassword'));
const Join = lazy(() => import('@/pages/Join'));
const Profile = lazy(() => import('@/pages/Profile'));
const Notifications = lazy(() => import('@/pages/Notifications'));
const Overview = lazy(() => import('@/pages/console/Overview'));
const Registrations = lazy(() => import('@/pages/console/Registrations'));
const Enterprises = lazy(() => import('@/pages/console/Enterprises'));
const PlatformUsers = lazy(() => import('@/pages/console/PlatformUsers'));
const AuditLog = lazy(() => import('@/pages/console/AuditLog'));
const Settings = lazy(() => import('@/pages/console/Settings'));
const OrgUsers = lazy(() => import('@/pages/organization/Users'));
const Departments = lazy(() => import('@/pages/organization/Departments'));
const Roles = lazy(() => import('@/pages/organization/Roles'));
const Projects = lazy(() => import('@/pages/organization/Projects'));
const CompanyDetails = lazy(() => import('@/pages/organization/CompanyDetails'));
const FormBuilder = lazy(() => import('@/pages/organization/FormBuilder'));
const LeavePolicy = lazy(() => import('@/pages/organization/LeavePolicy'));
const ItemCatalog = lazy(() => import('@/pages/organization/ItemCatalog'));
const NewRequest = lazy(() => import('@/pages/requests/NewRequest'));
const RequestForm = lazy(() => import('@/pages/requests/RequestForm'));
const MyRequests = lazy(() => import('@/pages/requests/MyRequests'));
const ApprovalsQueue = lazy(() => import('@/pages/requests/ApprovalsQueue'));
const HrSignoffs = lazy(() => import('@/pages/requests/HrSignoffs'));
const HrAbsences = lazy(() => import('@/pages/requests/HrAbsences'));
const FrontDesk = lazy(() => import('@/pages/requests/FrontDesk'));
const FulfilmentQueue = lazy(() => import('@/pages/requests/FulfilmentQueue'));
const AbsenceCalendar = lazy(() => import('@/pages/organization/AbsenceCalendar'));
const SlackIntegration = lazy(() => import('@/pages/organization/SlackIntegration'));
const Reports = lazy(() => import('@/pages/requests/Reports'));
const AttendanceReport = lazy(() => import('@/pages/requests/AttendanceReport'));
const Holidays = lazy(() => import('@/pages/organization/Holidays'));

/** Suspense fallback for lazy-loaded pages, matching ProtectedRoute's loading state. */
function PageFallback() {
  return <div className="flex min-h-screen items-center justify-center text-ink-400">Loading…</div>;
}

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
      <Suspense fallback={<PageFallback />}>
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
        <Route
          path="/registrations"
          element={
            <RequireRole systemAdmin>
              <Registrations />
            </RequireRole>
          }
        />
        <Route
          path="/enterprises"
          element={
            <RequireRole systemAdmin>
              <Enterprises />
            </RequireRole>
          }
        />
        <Route
          path="/users"
          element={
            <RequireRole systemAdmin>
              <PlatformUsers />
            </RequireRole>
          }
        />
        <Route
          path="/audit"
          element={
            <RequireRole systemAdmin>
              <AuditLog />
            </RequireRole>
          }
        />
        <Route
          path="/settings"
          element={
            <RequireRole systemAdmin>
              <Settings />
            </RequireRole>
          }
        />
        <Route path="/profile" element={<Profile />} />
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/requests" element={<MyRequests />} />
        <Route path="/requests/mine" element={<MyRequests />} />
        <Route path="/requests/approvals" element={<ApprovalsQueue />} />
        <Route path="/requests/hr-signoffs" element={<HrSignoffs />} />
        <Route path="/requests/absences" element={<HrAbsences />} />
        <Route path="/reports" element={<Reports />} />
        <Route
          path="/reports/attendance"
          element={
            <RequireRole role={[SystemRoleKey.Finance, SystemRoleKey.EnterpriseAdmin]}>
              <AttendanceReport />
            </RequireRole>
          }
        />
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
            <RequireRole
              role={[
                SystemRoleKey.EnterpriseAdmin,
                SystemRoleKey.HrHead,
                SystemRoleKey.ProjectManager,
                SystemRoleKey.TechLead,
              ]}
            >
              <AbsenceCalendar />
            </RequireRole>
          }
        />
        <Route
          path="/organization/holidays"
          element={
            <RequireRole role={[SystemRoleKey.HrHead, SystemRoleKey.EnterpriseAdmin]}>
              <Holidays />
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
      </Suspense>
    </>
  );
}
