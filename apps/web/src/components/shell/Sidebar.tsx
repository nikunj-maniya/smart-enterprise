import { NavLink } from 'react-router-dom';
import {
  LayoutGrid,
  ClipboardCheck,
  Building2,
  Users,
  ScrollText,
  Settings,
  LogOut,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';

const platformNav: { to: string; label: string; icon: LucideIcon; end?: boolean }[] = [
  { to: '/', label: 'Overview', icon: LayoutGrid, end: true },
  { to: '/registrations', label: 'Registrations', icon: ClipboardCheck },
  { to: '/enterprises', label: 'Enterprises', icon: Building2 },
  { to: '/users', label: 'Platform Users', icon: Users },
  { to: '/audit', label: 'Audit Log', icon: ScrollText },
];

function SidebarLink({
  to,
  label,
  icon: Icon,
  end,
}: {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          'flex h-[42px] items-center gap-3 rounded-md px-[10px] text-sm font-medium transition-colors',
          isActive
            ? 'bg-white/[0.08] text-white'
            : 'text-white/60 hover:bg-white/[0.05] hover:text-white',
        )
      }
    >
      <Icon size={18} />
      {label}
    </NavLink>
  );
}

function Initials({ name }: { name: string }) {
  const initials = name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <div className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-white/15 text-xs font-bold text-white">
      {initials}
    </div>
  );
}

export function Sidebar() {
  const { user, logout } = useAuth();
  return (
    <div
      className="flex w-[248px] flex-none flex-col px-[14px] py-[18px]"
      style={{ background: 'var(--nav-bg)' }}
    >
      {/* Brand */}
      <div className="flex items-center gap-3 px-2 pb-5 pt-[6px]">
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
        <span className="text-[17px] font-bold text-white">
          Smart<span className="font-medium text-[#9fe9e9]"> Enterprise</span>
        </span>
      </div>

      {/* Platform section */}
      <div className="px-[10px] pb-[6px] pt-2 text-[11px] font-semibold tracking-[.6px] text-white/40">
        PLATFORM
      </div>
      <div className="flex flex-col gap-[3px]">
        {platformNav.map((item) => (
          <SidebarLink key={item.to} {...item} />
        ))}
      </div>

      {/* System section */}
      <div className="px-[10px] pb-[6px] pt-4 text-[11px] font-semibold tracking-[.6px] text-white/40">
        SYSTEM
      </div>
      <SidebarLink to="/settings" label="Settings" icon={Settings} />

      {/* User */}
      <div className="mt-auto flex items-center gap-[11px] border-t border-white/[0.12] p-[10px]">
        <Initials name={user?.name ?? '?'} />
        <div className="min-w-0">
          <div className="whitespace-nowrap text-[13px] font-semibold text-white">{user?.name}</div>
          <div className="truncate text-[11px] text-white/55">
            {user?.isSystemAdmin ? 'System Admin' : 'User'}
          </div>
        </div>
        <button
          className="ml-auto text-white/60 hover:text-white"
          onClick={logout}
          aria-label="Log out"
        >
          <LogOut size={18} />
        </button>
      </div>
    </div>
  );
}
