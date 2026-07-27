import * as React from 'react';
import type { AuthUser } from '@se/shared';
import { apiFetch } from './api';
import { disconnectSocket } from './socket';

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<AuthUser>;
  refresh: () => Promise<void>;
  logout: () => void;
}

const AuthContext = React.createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<AuthUser | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    // Tokens live in httpOnly cookies (finding #6) — there's no JS-readable flag to check before
    // deciding whether to ask, so this always asks; a 401 just means "not logged in."
    apiFetch<AuthUser>('/auth/me')
      .then(setUser)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const login = React.useCallback(async (email: string, password: string) => {
    // The server sets the auth cookies on this response — the web app never reads the tokens
    // back out of the body or persists them itself.
    const res = await apiFetch<{ user: AuthUser }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
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

  const refresh = React.useCallback(async () => {
    const updated = await apiFetch<AuthUser>('/auth/me');
    setUser(updated);
  }, []);

  const logout = React.useCallback(() => {
    // Best-effort: revoke the refresh-token session server-side too (reading it from the
    // httpOnly cookie), so a token an attacker already captured is dead the moment the real user
    // logs out, not just locally forgotten. The server also clears the auth cookies.
    apiFetch('/auth/logout', { method: 'POST' }).catch(() => {});
    disconnectSocket();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, changePassword, refresh, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
