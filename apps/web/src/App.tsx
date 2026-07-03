import { Routes, Route, Navigate } from 'react-router-dom';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import ChangePassword from '@/pages/ChangePassword';
import ForgotPassword from '@/pages/ForgotPassword';
import SetNewPassword from '@/pages/SetNewPassword';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { AppShell } from '@/components/shell/AppShell';
import Overview from '@/pages/console/Overview';
import Registrations from '@/pages/console/Registrations';
import Enterprises from '@/pages/console/Enterprises';
import PlatformUsers from '@/pages/console/PlatformUsers';
import AuditLog from '@/pages/console/AuditLog';
import Settings from '@/pages/console/Settings';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<SetNewPassword />} />
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
        <Route path="/" element={<Overview />} />
        <Route path="/registrations" element={<Registrations />} />
        <Route path="/enterprises" element={<Enterprises />} />
        <Route path="/users" element={<PlatformUsers />} />
        <Route path="/audit" element={<AuditLog />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
