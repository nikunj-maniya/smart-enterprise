import * as React from 'react';
import { Link } from 'react-router-dom';
import { Clock, Building2, Users, PauseCircle, CheckCircle, XCircle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { OverviewResponse, RegistrationStatus, AuditAction } from '@se/shared';
import { PageHeader } from '@/components/shell/PageHeader';
import { apiFetch } from '@/lib/api';
import { formatRelativeTime } from '@/lib/formatRelativeTime';

const STATUS_STYLE: Record<RegistrationStatus, { bg: string; fg: string; dot: string; label: string }> = {
  Pending: { bg: 'rgb(255,247,237)', fg: 'rgb(204,78,0)', dot: 'rgb(247,107,21)', label: 'Pending' },
  Accepted: { bg: 'rgb(233,246,233)', fg: 'rgb(33,131,88)', dot: 'rgb(70,167,88)', label: 'Accepted' },
  Rejected: { bg: 'rgb(254,235,236)', fg: 'rgb(206,44,49)', dot: 'rgb(229,72,77)', label: 'Rejected' },
};

const ACTIVITY_STYLE: Record<AuditAction, { label: string; icon: LucideIcon }> = {
  accept: { label: 'Accepted registration', icon: CheckCircle },
  reject: { label: 'Rejected registration', icon: XCircle },
};

const STAT_TONES = {
  warning: { bg: 'rgb(255,247,237)', fg: 'rgb(247,107,21)' },
  brand: { bg: 'rgb(236,245,246)', fg: 'rgb(22,62,62)' },
  blue: { bg: 'rgb(230,244,254)', fg: 'rgb(0,144,255)' },
  danger: { bg: 'rgb(254,235,236)', fg: 'rgb(229,72,77)' },
} as const;

function initials(name: string) {
  return name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function StatusBadge({ status }: { status: RegistrationStatus }) {
  const c = STATUS_STYLE[status];
  return (
    <span
      className="inline-flex items-center gap-[6px] rounded-full px-[10px] py-1 text-xs font-medium"
      style={{ background: c.bg, color: c.fg }}
    >
      <span className="h-[6px] w-[6px] flex-none rounded-full" style={{ background: c.dot }} />
      {c.label}
    </span>
  );
}

function StatCard({
  icon: Icon,
  tone,
  value,
  label,
}: {
  icon: LucideIcon;
  tone: keyof typeof STAT_TONES;
  value: number;
  label: string;
}) {
  const c = STAT_TONES[tone];
  return (
    <div className="flex flex-col gap-[10px] rounded-lg border border-line-soft bg-surface p-4 shadow-card">
      <div
        className="flex h-8 w-8 items-center justify-center rounded-sm"
        style={{ background: c.bg, color: c.fg }}
      >
        <Icon size={18} />
      </div>
      <div className="text-[28px] font-bold leading-[1.1] text-ink-900">{value}</div>
      <div className="text-[13px] text-ink-400">{label}</div>
    </div>
  );
}

export default function Overview() {
  const [data, setData] = React.useState<OverviewResponse | null>(null);

  React.useEffect(() => {
    apiFetch<OverviewResponse>('/overview').then(setData);
  }, []);

  return (
    <>
      <PageHeader title="Platform Overview" />

      <div className="mt-[22px] grid grid-cols-4 gap-[18px]">
        <StatCard icon={Clock} tone="warning" value={data?.counts.pending ?? 0} label="Pending Review" />
        <StatCard
          icon={Building2}
          tone="brand"
          value={data?.counts.active ?? 0}
          label="Active Enterprises"
        />
        <StatCard icon={Users} tone="blue" value={data?.counts.users ?? 0} label="Platform Users" />
        <StatCard
          icon={PauseCircle}
          tone="danger"
          value={data?.counts.suspended ?? 0}
          label="Suspended"
        />
      </div>

      <div className="mt-[22px] grid grid-cols-[1.5fr_1fr] gap-5">
        <div className="overflow-hidden rounded-lg border border-line-soft bg-surface shadow-card">
          <div className="flex items-center border-b border-line-soft px-5 py-4">
            <span className="text-[15px] font-bold">Latest Registrations</span>
            <Link
              to="/registrations"
              className="ml-auto text-[13px] font-semibold text-brand-hover"
            >
              Review queue →
            </Link>
          </div>
          {data?.latestRegistrations.map((r) => (
            <div
              key={r.id}
              className="flex items-center gap-[14px] border-b border-line-soft px-5 py-[14px] last:border-b-0"
            >
              <div className="flex h-10 w-10 flex-none items-center justify-center rounded-[10px] bg-[rgb(236,245,246)] text-sm font-bold text-brand">
                {initials(r.companyName)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-ink-900">{r.companyName}</div>
                <div className="text-xs text-ink-400">
                  {r.contactName} · {new Date(r.createdAt).toLocaleDateString()}
                </div>
              </div>
              <StatusBadge status={r.status} />
            </div>
          ))}
          {data && data.latestRegistrations.length === 0 && (
            <div className="px-5 py-8 text-center text-sm text-ink-400">No registrations yet.</div>
          )}
        </div>

        <div className="overflow-hidden rounded-lg border border-line-soft bg-surface shadow-card">
          <div className="flex items-center border-b border-line-soft px-5 py-4">
            <span className="text-[15px] font-bold">Recent Activity</span>
          </div>
          {data?.recentActivity.map((a) => {
            const style = ACTIVITY_STYLE[a.action];
            const Icon = style.icon;
            return (
              <div
                key={a.id}
                className="flex gap-3 border-b border-line-soft px-5 py-[13px] last:border-b-0"
              >
                <div className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-sm bg-app-bg">
                  <Icon size={15} className="text-ink-500" />
                </div>
                <div className="min-w-0">
                  <div className="text-[13px] leading-[1.45] text-ink-700">
                    <strong>{style.label}</strong> · {a.target}
                  </div>
                  <div className="text-[11.5px] text-ink-400">
                    {a.actor} · {formatRelativeTime(a.at)}
                  </div>
                </div>
              </div>
            );
          })}
          {data && data.recentActivity.length === 0 && (
            <div className="px-5 py-8 text-center text-sm text-ink-400">No activity yet.</div>
          )}
        </div>
      </div>
    </>
  );
}
