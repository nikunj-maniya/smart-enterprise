import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  Bell,
  ClipboardCheck,
  CheckCircle,
  XCircle,
  FileText,
  Plane,
  Home,
  Monitor,
  UserCheck,
  RefreshCw,
  Clock,
  ChevronDown,
  UserRound,
  LogOut,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { NotificationDto } from '@se/shared';
import { useAuth } from '@/lib/auth';
import { apiFetch } from '@/lib/api';
import { formatRelativeTime } from '@/lib/formatRelativeTime';
import { SearchOverlay } from './SearchOverlay';

/** Core form-type icon, per the design (custom/unrecognized forms fall back to a generic doc icon). */
const FORM_KEY_ICON: Record<string, LucideIcon> = {
  leave: Plane,
  wfh: Home,
  it: Monitor,
  visitor: UserCheck,
};

/**
 * Per-type icon/title/target — a `switch` (not a lookup map) so each case narrows `n.payload`
 * to that notification's own variant. Request-event notifications deep-link to the requester's
 * My Requests list or the approver's Approvals Queue (with the request id as a query param so
 * either page can open the matching detail view/card), scoped to the requester/approver roles.
 */
function notifStyle(n: NotificationDto): { icon: LucideIcon; title: string; to: string } {
  switch (n.type) {
    case 'enterprise_registered':
      return {
        icon: ClipboardCheck,
        title: `New enterprise registration — ${n.payload.companyName}`,
        to: '/registrations',
      };
    case 'request_approved':
      return {
        icon: CheckCircle,
        title: `${n.payload.approverName} approved your ${n.payload.formTitle} request`,
        to: `/requests?requestId=${n.payload.requestId}`,
      };
    case 'request_rejected':
      return {
        icon: XCircle,
        title: `${n.payload.approverName} rejected your ${n.payload.formTitle} request`,
        to: `/requests?requestId=${n.payload.requestId}`,
      };
    case 'request_needs_approval':
      return {
        icon: FORM_KEY_ICON[n.payload.formKey] ?? FileText,
        title: `New ${n.payload.formTitle} request from ${n.payload.requesterName} needs your approval`,
        to: `/requests/approvals?requestId=${n.payload.requestId}`,
      };
    case 'request_status_changed':
      return {
        icon: RefreshCw,
        title: `Your ${n.payload.formTitle} request moved to ${n.payload.toState}`,
        to: `/requests?requestId=${n.payload.requestId}`,
      };
    case 'approval_reminder':
      return {
        icon: Clock,
        title: `${n.payload.pendingCount} requests are awaiting your decision`,
        to: '/requests/approvals',
      };
  }
}

const POLL_INTERVAL_MS = 30_000;

function Initials({ name }: { name: string }) {
  const initials = name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <div className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-brand/10 text-xs font-bold text-brand">
      {initials}
    </div>
  );
}

function NotificationsMenu() {
  const navigate = useNavigate();
  const [open, setOpen] = React.useState(false);
  const [notifications, setNotifications] = React.useState<NotificationDto[]>([]);
  const unreadCount = notifications.filter((n) => !n.read).length;

  React.useEffect(() => {
    const load = () => {
      apiFetch<NotificationDto[]>('/notifications')
        .then(setNotifications)
        .catch(() => {});
    };
    load();
    const interval = setInterval(load, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  function markAllRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    apiFetch('/notifications/read-all', { method: 'POST' }).catch(() => {});
  }

  function handleSelect(n: NotificationDto) {
    setOpen(false);
    if (!n.read) {
      setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      apiFetch(`/notifications/${n.id}/read`, { method: 'POST' }).catch(() => {});
    }
    navigate(notifStyle(n).to);
  }

  return (
    <div className="relative">
      <button
        className="relative flex text-ink-500 hover:text-ink-700"
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
        onClick={() => setOpen((v) => !v)}
      >
        <Bell size={21} />
        {unreadCount > 0 && (
          <span
            aria-hidden="true"
            className="absolute -right-[5px] -top-[5px] flex h-4 min-w-[16px] items-center justify-center rounded-full bg-danger px-1 text-[9px] font-bold text-white"
          >
            {unreadCount}
          </span>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-9 z-[41] w-[344px] overflow-hidden rounded-xl border border-line-soft bg-surface shadow-xl">
            <div className="flex items-center justify-between border-b border-line-soft px-[18px] py-[14px]">
              <span className="text-sm font-bold">Notifications</span>
              <button
                type="button"
                className="text-xs font-semibold text-brand-hover"
                onClick={markAllRead}
              >
                Mark all read
              </button>
            </div>
            {notifications.map((n) => {
              const style = notifStyle(n);
              const Icon = style.icon;
              return (
                <button
                  key={n.id}
                  type="button"
                  className="flex w-full gap-3 border-b border-line-soft px-[18px] py-[13px] text-left last:border-b-0"
                  style={{ background: n.read ? 'var(--surface)' : 'rgb(240,248,248)' }}
                  onClick={() => handleSelect(n)}
                >
                  <span
                    className="flex h-8 w-8 flex-none items-center justify-center rounded-sm"
                    style={{ background: 'rgb(236,245,246)' }}
                  >
                    <Icon size={16} className="text-brand" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] leading-[1.4] text-ink-700">{style.title}</div>
                    <div className="mt-[2px] text-[11.5px] text-ink-400">
                      {formatRelativeTime(n.createdAt)}
                    </div>
                  </div>
                  {!n.read && <span className="mt-[5px] h-2 w-2 flex-none rounded-full bg-brand" />}
                </button>
              );
            })}
            {notifications.length === 0 && (
              <div className="px-[18px] py-10 text-center text-[13px] text-ink-400">
                You&rsquo;re all caught up.
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function UserMenu() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = React.useState(false);

  return (
    <div className="relative">
      <button
        className="flex items-center gap-[10px] rounded-md py-1 pl-1 pr-2 hover:bg-surface-muted"
        onClick={() => setOpen((v) => !v)}
      >
        <Initials name={user?.name ?? '?'} />
        <div className="text-left">
          <div className="text-[13px] font-semibold">{user?.name}</div>
          <div className="text-[11px] text-ink-400">{user?.email}</div>
        </div>
        <ChevronDown size={15} className="text-ink-400" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-11 z-[41] w-[220px] overflow-hidden rounded-xl border border-line-soft bg-surface p-[6px] shadow-xl">
            <div
              className="flex cursor-pointer items-center gap-[11px] rounded-sm px-3 py-[10px] text-[13.5px] font-medium text-ink-700 hover:bg-surface-muted"
              onClick={() => {
                setOpen(false);
                navigate('/profile');
              }}
            >
              <UserRound size={17} className="text-ink-500" />
              View profile
            </div>
            <div className="my-[6px] h-px bg-line-soft" />
            <div
              className="flex cursor-pointer items-center gap-[11px] rounded-sm px-3 py-[10px] text-[13.5px] font-medium text-danger hover:bg-danger/[0.08]"
              onClick={logout}
            >
              <LogOut size={17} className="text-danger" />
              Log out
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function Topbar() {
  const [searchOpen, setSearchOpen] = React.useState(false);

  return (
    <div className="flex h-16 flex-none items-center gap-4 border-b border-line-soft bg-surface px-7">
      {/* Search (opens overlay) */}
      <button
        className="flex h-10 w-[340px] items-center gap-[10px] rounded-md border border-line-soft bg-app-bg px-[14px] transition-colors hover:border-brand"
        onClick={() => setSearchOpen(true)}
      >
        <Search size={17} className="text-ink-300" />
        <span className="text-[13px] text-ink-300">Search enterprises, users…</span>
      </button>

      <div className="ml-auto flex items-center gap-[18px]">
        <NotificationsMenu />
        <div className="h-[26px] w-px bg-line-soft" />
        <UserMenu />
      </div>

      <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}
