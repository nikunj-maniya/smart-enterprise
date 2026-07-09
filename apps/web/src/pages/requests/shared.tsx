import * as React from 'react';
import { FileText, House, Monitor, Plane, UserCheck, type LucideIcon } from 'lucide-react';

/** Core form key → icon/short type label (design's Type column). Unknown (custom-form) keys fall back to a generic icon + the form's own title. */
const REQUEST_TYPE_META: Record<string, { icon: LucideIcon; label: string }> = {
  leave: { icon: Plane, label: 'Leave' },
  wfh: { icon: House, label: 'WFH' },
  it: { icon: Monitor, label: 'IT' },
  visitor: { icon: UserCheck, label: 'Visitor' },
};

export function requestTypeMeta(formKey: string, formTitle: string): { icon: LucideIcon; label: string } {
  return REQUEST_TYPE_META[formKey] ?? { icon: FileText, label: formTitle };
}

/** Tile size → icon size, per the design's Type cell (32/17), queue card (44/21), and drawer header (46/22). */
const TILE_ICON_SIZE: Record<number, number> = { 32: 17, 44: 21, 46: 22 };

/** Rounded icon tile in the light-teal chip background used throughout the request UI. */
export function TypeTile({ formKey, formTitle, size = 32 }: { formKey: string; formTitle: string; size?: number }) {
  const { icon: Icon } = requestTypeMeta(formKey, formTitle);
  return (
    <span
      className="flex flex-none items-center justify-center rounded-[11px] bg-[rgb(236,245,246)] text-brand"
      style={{ width: size, height: size }}
    >
      <Icon size={TILE_ICON_SIZE[size] ?? Math.round(size * 0.48)} />
    </span>
  );
}

/** Status → badge tone, per the design's mapping (dot + color, never color-only). */
const STATUS_TONE: Record<string, { bg: string; fg: string; dot: string }> = {
  'Pending Approval': { bg: 'rgb(255,247,237)', fg: 'rgb(204,78,0)', dot: 'rgb(247,107,21)' },
  'Pre-Registered': { bg: 'rgb(255,247,237)', fg: 'rgb(204,78,0)', dot: 'rgb(247,107,21)' },
  Requested: { bg: 'rgb(255,247,237)', fg: 'rgb(204,78,0)', dot: 'rgb(247,107,21)' },
  Submitted: { bg: 'rgb(255,247,237)', fg: 'rgb(204,78,0)', dot: 'rgb(247,107,21)' },
  Approved: { bg: 'rgb(233,246,233)', fg: 'rgb(33,131,88)', dot: 'rgb(70,167,88)' },
  Fulfilled: { bg: 'rgb(233,246,233)', fg: 'rgb(33,131,88)', dot: 'rgb(70,167,88)' },
  'In Progress': { bg: 'rgb(230,244,254)', fg: 'rgb(0,144,255)', dot: 'rgb(0,144,255)' },
  Rejected: { bg: 'rgb(254,235,236)', fg: 'rgb(206,44,49)', dot: 'rgb(229,72,77)' },
  'Checked-Out': { bg: 'rgb(241,242,242)', fg: 'var(--ink-500)', dot: 'var(--ink-400)' },
  Withdrawn: { bg: 'rgb(241,242,242)', fg: 'var(--ink-500)', dot: 'var(--ink-400)' },
};
const DEFAULT_STATUS_TONE = { bg: 'rgb(241,242,242)', fg: 'var(--ink-500)', dot: 'var(--ink-400)' };

export function StatusBadge({ status }: { status: string }) {
  const c = STATUS_TONE[status] ?? DEFAULT_STATUS_TONE;
  return (
    <span
      className="inline-flex items-center gap-[6px] rounded-full px-[10px] py-1 text-xs font-medium"
      style={{ background: c.bg, color: c.fg }}
    >
      <span className="h-[6px] w-[6px] flex-none rounded-full" style={{ background: c.dot }} />
      {status}
    </span>
  );
}

/** Small square initials avatar — matches the convention used across the org-admin pages. */
export function InitialsAvatar({ name, size = 24 }: { name: string; size?: number }) {
  const initials = name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <div
      className="flex flex-none items-center justify-center rounded-[8px] bg-[rgb(236,245,246)] font-bold text-brand"
      style={{ width: size, height: size, fontSize: size <= 24 ? 10 : 12 }}
    >
      {initials}
    </div>
  );
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** "Jul 10 – Jul 12" / "Jul 10" / "—" — forms without dates (e.g. IT, Visitor) show the dash. */
export function dateRange(startDate: string | null, endDate: string | null): string {
  if (!startDate) return '—';
  if (!endDate || endDate === startDate) return formatDate(startDate);
  return `${formatDate(startDate)} – ${formatDate(endDate)}`;
}

export function EmptyState({
  icon: Icon,
  heading,
  message,
}: {
  icon: LucideIcon;
  heading: string;
  message: string;
}) {
  return (
    <div className="rounded-[14px] border border-dashed border-line bg-surface p-14 text-center">
      <Icon size={34} className="mx-auto text-ink-300" />
      <div className="mt-3 text-[15px] font-bold text-ink-900">{heading}</div>
      <div className="mt-[5px] text-[13px] text-ink-400">{message}</div>
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="rounded-[14px] border border-dashed border-line bg-surface p-8 text-center">
      <div className="text-sm text-danger">{message}</div>
      <button
        onClick={onRetry}
        className="mt-3 text-[13px] font-semibold text-brand-hover hover:underline"
      >
        Retry
      </button>
    </div>
  );
}
