import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AuthField } from '@/components/AuthField';
import { useAuth } from '@/lib/auth';
import { ApiError } from '@/lib/api';

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

export default function ChangePassword() {
  const { user, changePassword } = useAuth();
  const navigate = useNavigate();
  const [current, setCurrent] = React.useState('');
  const [next, setNext] = React.useState('');
  const [confirm, setConfirm] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const forced = user?.mustChangePassword ?? false;

  async function onSubmit() {
    setError(null);
    if (next.length < 8) return setError('New password must be at least 8 characters.');
    if (next !== confirm) return setError('New password and confirmation do not match.');
    setBusy(true);
    try {
      await changePassword(current, next);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
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
        {forced && (
          <div className="mt-4 flex items-start gap-[10px] rounded-sm bg-[rgb(236,245,246)] px-[15px] py-[13px]">
            <span className="flex-none text-brand">
              <ShieldCheck size={18} />
            </span>
            <span className="text-[12.5px] leading-[1.5] text-ink-500">
              For your security, you must change the default password before continuing.
            </span>
          </div>
        )}

        <div className="mt-6 flex flex-col gap-[18px]">
          <AuthField
            label="Current password"
            type="password"
            value={current}
            onChange={setCurrent}
            icon={<Lock size={18} />}
          />
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
        </div>

        {error && <div className="mt-4 text-sm font-medium text-danger">{error}</div>}

        <div className="mt-6">
          <Button size="lg" fullWidth className="h-12" disabled={busy} onClick={onSubmit}>
            {busy ? 'Saving…' : 'Change password'}
          </Button>
        </div>
      </div>
    </div>
  );
}
