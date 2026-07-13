import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { BellOff, CheckCheck } from 'lucide-react';
import type { NotificationDto, NotificationsResponse } from '@se/shared';
import { PageHeader } from '@/components/shell/PageHeader';
import { Button } from '@/components/ui/button';
import { ApiError, apiFetch } from '@/lib/api';
import { onNewNotification } from '@/lib/socket';
import { notifStyle } from '@/lib/notificationDisplay';
import { formatRelativeTime } from '@/lib/formatRelativeTime';

type Tab = 'all' | 'unread';

/**
 * Notifications Center (notifications-inapp, PRD §11): the full list behind the topbar bell's
 * "View all" link — All/Unread tabs with counts, per-item read state, mark-all-read, matching
 * the design exactly. Reuses `notifStyle` (icon/title/link) from the bell dropdown so the two
 * surfaces render identically.
 */
export default function Notifications() {
  const navigate = useNavigate();
  const [tab, setTab] = React.useState<Tab>('all');
  const [res, setRes] = React.useState<NotificationsResponse | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback((t: Tab) => {
    setError(null);
    apiFetch<NotificationsResponse>(`/notifications?tab=${t}&pageSize=50`)
      .then(setRes)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Unable to load notifications.'));
  }, []);

  React.useEffect(() => {
    load(tab);
  }, [load, tab]);

  // Live push: a new notification updates the Unread count immediately, and — while viewing All
  // or Unread — prepends it to the visible list; the enclosing tab switch above re-fetches anyway.
  React.useEffect(
    () =>
      onNewNotification((n) => {
        setRes((prev) =>
          prev
            ? {
                ...prev,
                rows: tab === 'all' || !n.read ? [n, ...prev.rows] : prev.rows,
                total: tab === 'all' ? prev.total + 1 : prev.total,
                unreadCount: prev.unreadCount + 1,
              }
            : prev,
        );
      }),
    [tab],
  );

  function markAllRead() {
    setRes((prev) => (prev ? { ...prev, unreadCount: 0, rows: prev.rows.map((n) => ({ ...n, read: true })) } : prev));
    apiFetch('/notifications/read-all', { method: 'POST' }).catch(() => {});
  }

  function handleSelect(n: NotificationDto) {
    if (!n.read) {
      setRes((prev) =>
        prev
          ? {
              ...prev,
              unreadCount: Math.max(0, prev.unreadCount - 1),
              rows: prev.rows.map((x) => (x.id === n.id ? { ...x, read: true } : x)),
            }
          : prev,
      );
      apiFetch(`/notifications/${n.id}/read`, { method: 'POST' }).catch(() => {});
    }
    navigate(notifStyle(n).to);
  }

  const unreadCount = res?.unreadCount ?? 0;

  return (
    <div className="mx-auto max-w-[720px]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader breadcrumb="Notifications" title="Notification Center" />
        <Button variant="secondary" onClick={markAllRead} disabled={unreadCount === 0}>
          <CheckCheck size={16} />
          Mark all read
        </Button>
      </div>

      <div className="mt-[22px] flex w-fit gap-2 rounded-[10px] border border-line-soft bg-surface p-[5px]">
        <button
          type="button"
          aria-pressed={tab === 'all'}
          onClick={() => setTab('all')}
          className="rounded-[7px] px-4 py-2 text-[13px] font-semibold transition-colors"
          style={
            tab === 'all'
              ? { background: 'var(--brand)', color: 'var(--brand-ink)' }
              : { background: 'transparent', color: 'var(--ink-500)' }
          }
        >
          All
        </button>
        <button
          type="button"
          aria-pressed={tab === 'unread'}
          onClick={() => setTab('unread')}
          className="rounded-[7px] px-4 py-2 text-[13px] font-semibold transition-colors"
          style={
            tab === 'unread'
              ? { background: 'var(--brand)', color: 'var(--brand-ink)' }
              : { background: 'transparent', color: 'var(--ink-500)' }
          }
        >
          Unread · {unreadCount}
        </button>
      </div>

      <div className="mt-[18px] overflow-hidden rounded-xl border border-line-soft bg-surface shadow-card">
        {error ? (
          <div className="p-8 text-center text-sm text-danger">{error}</div>
        ) : res === null ? (
          <div className="p-12 text-center text-sm text-ink-400">Loading…</div>
        ) : res.rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-14 text-center">
            <BellOff size={30} className="text-ink-300" />
            <div className="text-sm font-semibold text-ink-500">You&rsquo;re all caught up</div>
            <div className="text-[13px] text-ink-400">
              {tab === 'unread' ? 'No unread notifications.' : 'No notifications yet.'}
            </div>
          </div>
        ) : (
          res.rows.map((n) => {
            const style = notifStyle(n);
            const Icon = style.icon;
            return (
              <button
                key={n.id}
                type="button"
                className="flex w-full gap-3 border-b border-line-soft px-5 py-[15px] text-left last:border-b-0"
                style={{ background: n.read ? 'var(--surface)' : 'rgb(240,248,248)' }}
                onClick={() => handleSelect(n)}
              >
                <span
                  className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-[10px]"
                  style={{ background: 'rgb(236,245,246)' }}
                >
                  <Icon size={18} className="text-brand" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm leading-[1.45] text-ink-900">{style.title}</div>
                  <div className="mt-[2px] text-xs text-ink-400">{formatRelativeTime(n.createdAt)}</div>
                </div>
                {!n.read && <span className="mt-[6px] h-[9px] w-[9px] flex-none rounded-full bg-brand" />}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
