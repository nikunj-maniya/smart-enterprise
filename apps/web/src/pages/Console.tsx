import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';

/** Placeholder authed landing — replaced by the real System Admin shell in Slice 1. */
export default function Console() {
  const { user, logout } = useAuth();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-app-bg">
      <div className="text-2xl font-bold">Welcome, {user?.name}</div>
      <div className="text-sm text-ink-400">
        {user?.email} · {user?.isSystemAdmin ? 'System Admin' : 'User'}
      </div>
      <div className="text-[13px] text-ink-300">
        The System Admin console (sidebar, overview, registrations…) lands in Slice 1.
      </div>
      <Button variant="outline" onClick={logout}>
        Log out
      </Button>
    </div>
  );
}
