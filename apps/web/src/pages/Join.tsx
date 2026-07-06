import * as React from 'react';
import { Link, useParams } from 'react-router-dom';
import { User, Mail, Lock, CheckCircle2, ShieldCheck, Unlink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AuthField } from '@/components/AuthField';
import { apiFetch, ApiError } from '@/lib/api';
import type { SelfRegistrationInfo } from '@se/shared';

/** Brand logo mark for use on light backgrounds (matches the other auth cards). */
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

function CardShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-app-bg p-10">
      <div className="w-full max-w-[440px] rounded-xl border border-line-soft bg-surface p-10 shadow-card">
        {children}
      </div>
    </div>
  );
}

export default function Join() {
  const { token } = useParams<{ token: string }>();
  const [info, setInfo] = React.useState<SelfRegistrationInfo | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  const [name, setName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [done, setDone] = React.useState(false);

  React.useEffect(() => {
    apiFetch<SelfRegistrationInfo>(`/public/self-registration/${token}`)
      .then(setInfo)
      .catch((err) =>
        setLoadError(
          err instanceof ApiError ? err.message : 'This registration link is invalid or has expired.',
        ),
      )
      .finally(() => setLoading(false));
  }, [token]);

  async function onSubmit() {
    setError(null);
    if (!name.trim()) return setError('Name is required.');
    if (!email.trim()) return setError('Email is required.');
    if (password.length < 8) return setError('Password must be at least 8 characters.');
    setBusy(true);
    try {
      await apiFetch(`/public/self-registration/${token}`, {
        method: 'POST',
        body: JSON.stringify({ name, email, password }),
      });
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to complete registration.');
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-app-bg text-ink-400">
        Loading…
      </div>
    );
  }

  if (loadError) {
    return (
      <CardShell>
        <div className="text-center">
          <div className="mx-auto flex h-[68px] w-[68px] items-center justify-center rounded-full bg-[rgba(229,72,77,.12)]">
            <Unlink size={30} className="text-danger" />
          </div>
          <div className="mt-[22px] text-2xl font-bold tracking-[-.4px]">Link unavailable</div>
          <div className="mt-[10px] text-sm leading-[1.6] text-ink-400">{loadError}</div>
          <Link to="/login" className="mt-7 block">
            <Button fullWidth>Go to login</Button>
          </Link>
        </div>
      </CardShell>
    );
  }

  if (done) {
    return (
      <CardShell>
        <div className="text-center">
          <div className="mx-auto flex h-[68px] w-[68px] items-center justify-center rounded-full bg-[rgb(236,245,246)]">
            <CheckCircle2 size={32} className="text-brand" />
          </div>
          <div className="mt-[22px] text-2xl font-bold tracking-[-.4px]">Request submitted</div>
          <div className="mt-[10px] text-sm leading-[1.6] text-ink-400">
            Your request to join <strong className="text-ink-700">{info?.tenantName}</strong> has
            been submitted. An administrator will review it — you&apos;ll be able to log in with the
            email and password you just set once it&apos;s approved.
          </div>
          <Link to="/login" className="mt-7 block">
            <Button fullWidth>Go to login</Button>
          </Link>
        </div>
      </CardShell>
    );
  }

  return (
    <CardShell>
      <div className="flex items-center gap-3">
        <LogoMark />
        <span className="text-[17px] font-bold">
          Smart<span className="font-medium text-ink-400"> Enterprise</span>
        </span>
      </div>

      <div className="mt-6 text-2xl font-bold tracking-[-.4px]">Join {info?.tenantName}</div>
      <div className="mt-2 text-[13.5px] leading-[1.6] text-ink-400">
        Create your employee account. Choose a password you&apos;ll use to sign in.
      </div>

      <form
        className="mt-6 flex flex-col gap-[18px]"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        <AuthField label="Full name" type="text" value={name} onChange={setName} icon={<User size={18} />} />
        <AuthField
          label="Email"
          type="email"
          value={email}
          onChange={setEmail}
          placeholder="you@company.com"
          icon={<Mail size={18} />}
        />
        <AuthField
          label="Password"
          type="password"
          value={password}
          onChange={setPassword}
          placeholder="At least 8 characters"
          icon={<Lock size={18} />}
        />

        {error && <div className="text-sm font-medium text-danger">{error}</div>}

        <Button type="submit" size="lg" fullWidth className="h-12" disabled={busy}>
          {busy ? 'Creating account…' : 'Create account'}
        </Button>
      </form>

      <div className="mt-[18px] flex items-start gap-[10px] rounded-sm bg-[rgb(236,245,246)] px-[15px] py-[13px]">
        <ShieldCheck size={18} className="mt-[1px] flex-none text-brand" />
        <span className="text-[12.5px] leading-[1.5] text-ink-500">
          You&apos;ll join as an Employee. Your password is stored hashed, and an administrator
          reviews your request before you can log in.
        </span>
      </div>
    </CardShell>
  );
}
