import * as React from 'react';
import type { EnterpriseRegistrationDto } from '@se/shared';
import { apiFetch } from './api';
import { useAuth } from './auth';

interface RegistrationsCountContextValue {
  pendingCount: number;
  refresh: () => void;
}

const RegistrationsCountContext = React.createContext<RegistrationsCountContextValue | undefined>(
  undefined,
);

export function RegistrationsCountProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [pendingCount, setPendingCount] = React.useState(0);

  const refresh = React.useCallback(() => {
    if (!user?.isSystemAdmin) return;
    apiFetch<EnterpriseRegistrationDto[]>('/registrations?status=Pending')
      .then((rows) => setPendingCount(rows.length))
      .catch(() => {});
  }, [user?.isSystemAdmin]);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <RegistrationsCountContext.Provider value={{ pendingCount, refresh }}>
      {children}
    </RegistrationsCountContext.Provider>
  );
}

export function useRegistrationsCount() {
  const ctx = React.useContext(RegistrationsCountContext);
  if (!ctx) {
    throw new Error('useRegistrationsCount must be used within RegistrationsCountProvider');
  }
  return ctx;
}
