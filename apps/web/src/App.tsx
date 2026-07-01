import { Routes, Route } from 'react-router-dom';
import Login from '@/pages/Login';
import ChangePassword from '@/pages/ChangePassword';
import Console from '@/pages/Console';
import { ProtectedRoute } from '@/components/ProtectedRoute';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/change-password"
        element={
          <ProtectedRoute>
            <ChangePassword />
          </ProtectedRoute>
        }
      />
      <Route
        path="*"
        element={
          <ProtectedRoute>
            <Console />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}
