import * as React from 'react';
import { Link, Navigate } from 'react-router-dom';
import { Mail, MailCheck } from 'lucide-react';
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

export default function ForgotPassword() {
  const { user } = useAuth();
  const [email, setEmail] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [sent, setSent] = React.useState(false);

  if (user) {
    return <Navigate to={user.mustChangePassword ? '/change-password' : '/'} replace />;
  }

  async function onSubmit() {
    setError(null);
    setBusy(true);
    try {
      await apiFetch('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to send the reset link.');
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-app-bg p-10">
        <div className="w-full max-w-[440px] rounded-xl border border-line-soft bg-surface p-11 text-center shadow-card">
          <div className="mx-auto flex h-[68px] w-[68px] items-center justify-center rounded-full bg-[rgb(236,245,246)]">
            <MailCheck size={32} className="text-brand" />
          </div>
          <div className="mt-[22px] text-2xl font-bold tracking-[-.4px]">Check your email</div>
          <div className="mt-[10px] text-sm leading-[1.6] text-ink-400">
            If an account exists for that address, a password reset link is on its way. No email
            enabled? Your Enterprise Admin can issue a reset for you.
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

        <div className="mt-6 text-2xl font-bold tracking-[-.4px]">Reset your password</div>
        <div className="mt-2 text-[13.5px] leading-[1.6] text-ink-400">
          Enter your account email and we&apos;ll send a reset link. If email isn&apos;t enabled
          for your enterprise, your Enterprise Admin can reset it for you.
        </div>

        <form
          className="mt-6"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}
        >
          <AuthField
            label="Email"
            type="email"
            value={email}
            onChange={setEmail}
            placeholder="you@company.com"
            icon={<Mail size={18} />}
          />

          {error && <div className="mt-4 text-sm font-medium text-danger">{error}</div>}

          <div className="mt-[22px]">
            <Button type="submit" size="lg" fullWidth className="h-12" disabled={busy}>
              {busy ? 'Sending…' : 'Send reset link'}
            </Button>
          </div>
        </form>

        <Link
          to="/login"
          className="mt-[18px] block text-center text-[13px] font-semibold text-brand-hover"
        >
          ← Back to login
        </Link>
      </div>
    </div>
  );
}
