import * as React from 'react';
import type { AuthUser, LoginResponse } from '@se/shared';
import { apiFetch, tokenStore } from './api';

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<AuthUser>;
  logout: () => void;
}

const AuthContext = React.createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<AuthUser | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (!tokenStore.access) {
      setLoading(false);
      return;
    }
    apiFetch<AuthUser>('/auth/me')
      .then(setUser)
      .catch(() => tokenStore.clear())
      .finally(() => setLoading(false));
  }, []);

  const login = React.useCallback(async (email: string, password: string) => {
    const res = await apiFetch<LoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    tokenStore.set(res.accessToken, res.refreshToken);
    setUser(res.user);
    return res.user;
  }, []);

  const changePassword = React.useCallback(
    async (currentPassword: string, newPassword: string) => {
      const updated = await apiFetch<AuthUser>('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setUser(updated);
      return updated;
    },
    [],
  );

  const logout = React.useCallback(() => {
    tokenStore.clear();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, changePassword, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
