import * as React from 'react';
import { Mail, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** Brand logo mark (from the design). */
function LogoMark({ size = 42, onDark = true }: { size?: number; onDark?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <rect width="40" height="40" rx="11" fill={onDark ? '#fff' : '#163E3E'} />
      <path
        d="M10.5 20.5 L17 27 L29.5 12.5"
        stroke={onDark ? '#163E3E' : '#fff'}
        strokeWidth="3.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="10.5" cy="20.5" r="3.4" fill="#00A2C7" />
    </svg>
  );
}

/** Icon + input row, matching the design's field styling. */
function Field({
  label,
  icon,
  type,
  defaultValue,
}: {
  label: string;
  icon: React.ReactNode;
  type: string;
  defaultValue?: string;
}) {
  return (
    <label className="flex w-full flex-col gap-2">
      <span className="text-sm font-semibold text-ink-900">{label}</span>
      <div className="flex h-[46px] items-center gap-[9px] rounded-sm border border-line bg-surface px-[13px]">
        <span className="flex flex-none text-ink-300">{icon}</span>
        <input
          type={type}
          defaultValue={defaultValue}
          className="min-w-0 flex-1 border-none bg-transparent text-sm text-ink-900 outline-none"
        />
      </div>
    </label>
  );
}

export default function Login() {
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
        <div className="w-full max-w-[392px]">
          <div className="text-[30px] font-bold tracking-[-.5px]">Welcome back</div>
          <div className="mt-2 text-sm text-ink-400">Log in to your Smart Enterprise account.</div>

          <div className="mt-[30px] flex flex-col gap-[18px]">
            <Field
              label="Email"
              type="email"
              defaultValue="systemadmin@smartenterprise.com"
              icon={<Mail size={18} />}
            />
            <Field label="Password" type="password" defaultValue="Smart@123" icon={<Lock size={18} />} />
          </div>

          <div className="mt-[10px] cursor-pointer text-right text-[13px] font-semibold text-brand-hover">
            Forgot password?
          </div>

          <div className="mt-[22px]">
            <Button size="lg" fullWidth className="h-12">
              Log In
            </Button>
          </div>

          <div className="mt-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-line-soft" />
            <span className="text-xs text-ink-300">New to the platform?</span>
            <div className="h-px flex-1 bg-line-soft" />
          </div>

          <div className="mt-[18px]">
            <Button variant="outline" fullWidth className="h-10">
              Register your enterprise
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
