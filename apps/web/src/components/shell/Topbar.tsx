import { Search, Bell } from 'lucide-react';
import { useAuth } from '@/lib/auth';

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

export function Topbar() {
  const { user } = useAuth();
  return (
    <div className="flex h-16 flex-none items-center gap-4 border-b border-line-soft bg-surface px-7">
      {/* Search (visual only for now) */}
      <div className="flex h-10 w-[340px] items-center gap-[10px] rounded-md border border-line-soft bg-app-bg px-[14px]">
        <Search size={17} className="text-ink-300" />
        <span className="text-[13px] text-ink-300">Search enterprises, users…</span>
      </div>

      <div className="ml-auto flex items-center gap-[18px]">
        <button className="relative flex text-ink-500 hover:text-ink-700" aria-label="Notifications">
          <Bell size={21} />
        </button>
        <div className="h-[26px] w-px bg-line-soft" />
        <div className="flex items-center gap-[10px]">
          <Initials name={user?.name ?? '?'} />
          <div>
            <div className="text-[13px] font-semibold">{user?.name}</div>
            <div className="text-[11px] text-ink-400">{user?.email}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
