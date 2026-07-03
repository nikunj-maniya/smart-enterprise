import * as React from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { Lock, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AuthField } from '@/components/AuthField';
import { useAuth } from '@/lib/auth';
import { apiFetch, ApiError } from '@/lib/api';

/** Brand logo mark for use on light backgrounds (matches ChangePassword). */
function LogoMark() {
  return (
    <svg width={34} height={34} viewBox="0 0 40 40" fill="none">
      <rect width="40" height="40" rx="11" fill="#163E3E" />
      <path
        d="M10.5 20.5 L17 27 L29.5 12.5"
        stroke="#fff"
        strokeWidth="3.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="10.5" cy="20.5" r="3.4" fill="#00E6E6" />
    </svg>
  );
}

export default function SetNewPassword() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [next, setNext] = React.useState('');
  const [confirm, setConfirm] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [done, setDone] = React.useState(false);

  if (user) {
    return <Navigate to={user.mustChangePassword ? '/change-password' : '/'} replace />;
  }

  async function onSubmit() {
    setError(null);
    if (next.length < 8) return setError('New password must be at least 8 characters.');
    if (next !== confirm) return setError('New password and confirmation do not match.');
    setBusy(true);
    try {
      await apiFetch('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token, newPassword: next }),
      });
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to reset your password.');
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-app-bg p-10">
        <div className="w-full max-w-[430px] rounded-xl border border-line-soft bg-surface p-10 text-center shadow-card">
          <div className="text-2xl font-bold tracking-[-.4px]">Invalid reset link</div>
          <div className="mt-[10px] text-sm leading-[1.6] text-ink-400">
            This link is missing its reset token. Request a new one from the forgot-password
            screen.
          </div>
          <Link to="/forgot-password" className="mt-7 block">
            <Button fullWidth>Request a new link</Button>
          </Link>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-app-bg p-10">
        <div className="w-full max-w-[430px] rounded-xl border border-line-soft bg-surface p-10 text-center shadow-card">
          <div className="mx-auto flex h-[68px] w-[68px] items-center justify-center rounded-full bg-[rgb(236,245,246)]">
            <CheckCircle2 size={32} className="text-brand" />
          </div>
          <div className="mt-[22px] text-2xl font-bold tracking-[-.4px]">Password updated</div>
          <div className="mt-[10px] text-sm leading-[1.6] text-ink-400">
            Your password has been reset. Log in with your new password.
          </div>
          <Link to="/login" className="mt-7 block">
            <Button fullWidth>Back to login</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-app-bg p-10">
      <div className="w-full max-w-[430px] rounded-xl border border-line-soft bg-surface p-10 shadow-card">
        <div className="flex items-center gap-3">
          <LogoMark />
          <span className="text-[17px] font-bold">
            Smart<span className="font-medium text-ink-400"> Enterprise</span>
          </span>
        </div>

        <div className="mt-6 text-2xl font-bold tracking-[-.4px]">Set a new password</div>
        <div className="mt-2 text-[13.5px] leading-[1.6] text-ink-400">
          Choose a new password for your account.
        </div>

        <form
          className="mt-6 flex flex-col gap-[18px]"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}
        >
          <AuthField
            label="New password"
            type="password"
            value={next}
            onChange={setNext}
            icon={<Lock size={18} />}
          />
          <AuthField
            label="Confirm new password"
            type="password"
            value={confirm}
            onChange={setConfirm}
            icon={<Lock size={18} />}
          />

          {error && <div className="text-sm font-medium text-danger">{error}</div>}

          <Button type="submit" size="lg" fullWidth className="h-12" disabled={busy}>
            {busy ? 'Saving…' : 'Set new password'}
          </Button>
        </form>
      </div>
    </div>
  );
}
