import * as React from 'react';
import { Link, Navigate } from 'react-router-dom';
import { Mail, Lock, ShieldCheck, ArrowRight, ChevronDown, MailCheck } from 'lucide-react';
import { COMPANY_SIZE_OPTIONS, INDUSTRY_OPTIONS } from '@se/shared';
import { Button } from '@/components/ui/button';
import { apiFetch, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';

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

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[12px] font-bold uppercase tracking-[.5px] text-ink-400">{children}</div>
  );
}

/** Matches the design system's Input component (44px, 12px padding, 8px gap). */
function RegField({
  label,
  required,
  icon,
  ...rest
}: {
  label: string;
  required?: boolean;
  icon?: React.ReactNode;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'className'>) {
  return (
    <label className="flex w-full flex-col gap-2">
      <span className="text-sm font-semibold text-ink-900">
        {label}
        {required && ' *'}
      </span>
      <div className="flex h-11 items-center gap-2 rounded-sm border border-line bg-surface px-3">
        {icon && <span className="flex flex-none text-ink-300">{icon}</span>}
        <input
          {...rest}
          className="min-w-0 flex-1 border-none bg-transparent text-sm text-ink-900 outline-none"
        />
      </div>
    </label>
  );
}

/** Matches the design system's Select component. */
function RegSelect({
  label,
  required,
  value,
  onChange,
  options,
  placeholder = 'Select…',
}: {
  label: string;
  required?: boolean;
  value: string;
  onChange: (v: string) => void;
  options: readonly string[];
  placeholder?: string;
}) {
  return (
    <label className="flex w-full flex-col gap-2">
      <span className="text-sm font-semibold text-ink-900">
        {label}
        {required && ' *'}
      </span>
      <div className="relative flex items-center">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`h-11 w-full appearance-none rounded-sm border border-line bg-surface py-0 pl-3 pr-9 text-sm outline-none ${
            value ? 'text-ink-900' : 'text-ink-300'
          }`}
        >
          <option value="" disabled hidden>
            {placeholder}
          </option>
          {options.map((o) => (
            <option key={o} value={o} className="text-ink-900">
              {o}
            </option>
          ))}
        </select>
        <ChevronDown size={18} className="pointer-events-none absolute right-3 text-ink-400" />
      </div>
    </label>
  );
}

export default function Register() {
  const { user } = useAuth();
  const [companyName, setCompanyName] = React.useState('');
  const [industry, setIndustry] = React.useState('');
  const [size, setSize] = React.useState('');
  const [website, setWebsite] = React.useState('');
  const [contactName, setContactName] = React.useState('');
  const [contactEmail, setContactEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(false);

  if (user) {
    return <Navigate to={user.mustChangePassword ? '/change-password' : '/'} replace />;
  }

  async function onSubmit() {
    setError(null);
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      await apiFetch('/registrations', {
        method: 'POST',
        body: JSON.stringify({
          companyName,
          industry,
          size,
          website: website || undefined,
          contactName,
          contactEmail,
          password,
        }),
      });
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to submit registration.');
    } finally {
      setBusy(false);
    }
  }

  if (submitted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-app-bg p-10">
        <div className="w-full max-w-[480px] rounded-xl border border-line-soft bg-surface p-11 text-center shadow-card">
          <div className="mx-auto flex h-[68px] w-[68px] items-center justify-center rounded-full bg-[rgba(70,167,88,.14)]">
            <MailCheck size={32} className="text-success" />
          </div>
          <div className="mt-[22px] text-2xl font-bold tracking-[-.4px]">Registration submitted</div>
          <div className="mt-[10px] text-sm leading-[1.6] text-ink-400">
            <strong className="text-ink-700">{companyName}</strong> is now pending review. A
            platform System Admin will accept or reject it. Once accepted, sign in with the admin
            credentials you set.
          </div>
          <Link to="/login" className="mt-7 block">
            <Button fullWidth>Back to login</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-app-bg px-5 py-10">
      <div className="mx-auto max-w-[680px]">
        <Link to="/login" className="flex items-center gap-3">
          <LogoMark />
          <span className="text-lg font-bold text-ink-900">
            Smart<span className="font-medium text-ink-400"> Enterprise</span>
          </span>
        </Link>

        <form
          className="mt-7 rounded-xl border border-line-soft bg-surface p-9 shadow-card"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}
        >
          <div className="text-[26px] font-bold tracking-[-.4px]">Register your enterprise</div>
          <div className="mt-2 max-w-[520px] text-sm leading-[1.6] text-ink-400">
            Submit your organization for review. A platform System Admin approves new enterprises
            — once accepted, you log in with the admin credentials you set below. No invite email
            needed.
          </div>

          <div className="mt-7">
            <SectionLabel>Company details</SectionLabel>
            <div className="mt-[14px] grid grid-cols-2 gap-4">
              <RegField
                label="Company name"
                required
                placeholder="Acme Corporation"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
              />
              <RegSelect
                label="Industry"
                required
                value={industry}
                onChange={setIndustry}
                options={INDUSTRY_OPTIONS}
              />
              <RegSelect
                label="Company size"
                required
                value={size}
                onChange={setSize}
                options={COMPANY_SIZE_OPTIONS}
              />
              <RegField
                label="Website"
                placeholder="acme.com"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
              />
            </div>
          </div>

          <div className="mt-[26px]">
            <SectionLabel>Enterprise Admin account</SectionLabel>
            <div className="mt-[14px] grid grid-cols-2 gap-4">
              <RegField
                label="Admin full name"
                required
                placeholder="Jane Doe"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
              />
              <RegField
                label="Admin email (username)"
                required
                type="email"
                icon={<Mail size={18} />}
                placeholder="jane@acme.com"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
              />
              <RegField
                label="Password"
                required
                type="password"
                icon={<Lock size={18} />}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <RegField
                label="Confirm password"
                required
                type="password"
                icon={<Lock size={18} />}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
          </div>

          <div className="mt-[22px] flex items-start gap-[10px] rounded-sm bg-[rgb(236,245,246)] px-[15px] py-[13px]">
            <span className="flex-none text-brand">
              <ShieldCheck size={18} />
            </span>
            <span className="text-[12.5px] leading-[1.5] text-ink-500">
              Your password is stored hashed and the account stays inactive until a System Admin
              accepts the registration.
            </span>
          </div>

          {error && <div className="mt-4 text-sm font-medium text-danger">{error}</div>}

          <div className="mt-[26px] flex items-center justify-between">
            <Link to="/login">
              <Button type="button" variant="ghost">
                Back to login
              </Button>
            </Link>
            <Button type="submit" size="lg" disabled={busy}>
              {busy ? 'Submitting…' : 'Submit for review'}
              {!busy && <ArrowRight size={20} />}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
