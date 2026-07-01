import * as React from 'react';
import { Search, Bell } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { SearchOverlay } from './SearchOverlay';

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
  const [open, setOpen] = React.useState(false);
  return (
    <div className="relative">
      <button
        className="relative flex text-ink-500 hover:text-ink-700"
        aria-label="Notifications"
        onClick={() => setOpen((v) => !v)}
      >
        <Bell size={21} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-9 z-[41] w-[344px] overflow-hidden rounded-lg border border-line-soft bg-surface shadow-xl">
            <div className="flex items-center justify-between border-b border-line-soft px-[18px] py-[14px]">
              <span className="text-sm font-bold">Notifications</span>
              <span className="cursor-pointer text-xs font-semibold text-brand-hover">
                Mark all read
              </span>
            </div>
            <div className="px-[18px] py-10 text-center text-[13px] text-ink-400">
              You&rsquo;re all caught up.
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function Topbar() {
  const { user } = useAuth();
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
        <div className="flex items-center gap-[10px]">
          <Initials name={user?.name ?? '?'} />
          <div>
            <div className="text-[13px] font-semibold">{user?.name}</div>
            <div className="text-[11px] text-ink-400">{user?.email}</div>
          </div>
        </div>
      </div>

      <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}
