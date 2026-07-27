import * as React from 'react';
import { useNavigate, Navigate, Link } from 'react-router-dom';
import { Mail, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AuthField } from '@/components/AuthField';
import { useAuth } from '@/lib/auth';
import { ApiError } from '@/lib/api';

/** Brand logo mark (from the design). */
function LogoMark({ size = 42 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <rect width="40" height="40" rx="11" fill="#fff" />
      <path
        d="M10.5 20.5 L17 27 L29.5 12.5"
        stroke="#163E3E"
        strokeWidth="3.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="10.5" cy="20.5" r="3.4" fill="#00A2C7" />
    </svg>
  );
}

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  if (user) {
    return <Navigate to={user.mustChangePassword ? '/change-password' : '/'} replace />;
  }

  async function onSubmit() {
    setError(null);
    setBusy(true);
    try {
      const u = await login(email, password);
      navigate(u.mustChangePassword ? '/change-password' : '/', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to log in.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen">
      {/* Left brand panel */}
      <div
        className="relative flex w-[42%] max-w-[560px] flex-col justify-between overflow-hidden px-[52px] py-[56px]"
        style={{ background: 'linear-gradient(155deg,#1a4a4a 0%,#0f2e2e 100%)' }}
      >
        <div
          className="absolute inset-0"
          style={{
            background:
              'repeating-linear-gradient(122deg,transparent 0 58px,rgba(0,230,230,.05) 58px 59px)',
          }}
        />
        <div className="relative flex items-center gap-[14px]">
          <LogoMark />
          <span className="text-[22px] font-bold tracking-[-.2px] text-white">
            Smart<span className="font-medium text-[#9fe9e9]"> Enterprise</span>
          </span>
        </div>
        <div className="relative">
          <div className="text-[40px] font-bold leading-[1.15] tracking-[-.6px] text-white">
            One platform for
            <br />
            every request.
          </div>
          <div className="mt-5 max-w-[380px] text-[17px] leading-[1.6] text-[#bfe4e4]">
            Routed to the right people, tracked end to end, approved without the spreadsheets.
          </div>
        </div>
        <div className="relative flex items-center gap-[10px] text-[13px] font-medium text-[#7fbcbc]">
          <span className="h-2 w-2 rounded-full bg-[#00E6E6]" />
          Multi-tenant · Role-based routing · Audit-ready
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex flex-1 items-center justify-center p-10">
        <form
          className="w-full max-w-[392px]"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}
        >
          <div className="text-[30px] font-bold tracking-[-.5px]">Welcome back</div>
          <div className="mt-2 text-sm text-ink-400">Log in to your Smart Enterprise account.</div>

          <div className="mt-[30px] flex flex-col gap-[18px]">
            <AuthField
              label="Email"
              type="email"
              value={email}
              onChange={setEmail}
              icon={<Mail size={18} />}
            />
            <AuthField
              label="Password"
              type="password"
              value={password}
              onChange={setPassword}
              placeholder="Enter your password"
              icon={<Lock size={18} />}
            />
          </div>

          {error && <div className="mt-4 text-sm font-medium text-danger">{error}</div>}

          <Link
            to="/forgot-password"
            className="mt-[10px] block text-right text-[13px] font-semibold text-brand-hover"
          >
            Forgot password?
          </Link>

          <div className="mt-[22px]">
            <Button type="submit" size="lg" fullWidth className="h-12" disabled={busy}>
              {busy ? 'Logging in…' : 'Log In'}
            </Button>
          </div>

          <div className="mt-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-line-soft" />
            <span className="text-xs text-ink-300">New to the platform?</span>
            <div className="h-px flex-1 bg-line-soft" />
          </div>

          <div className="mt-[18px]">
            <Link to="/register">
              <Button type="button" variant="outline" fullWidth className="h-10">
                Register your enterprise
              </Button>
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
