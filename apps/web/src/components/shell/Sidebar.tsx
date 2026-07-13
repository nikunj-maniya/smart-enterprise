import { NavLink } from 'react-router-dom';
import {
  LayoutGrid,
  ClipboardCheck,
  ClipboardList,
  ListChecks,
  Building2,
  Building,
  Users,
  Shield,
  FolderKanban,
  ScrollText,
  Settings,
  LogOut,
  LayoutTemplate,
  CalendarClock,
  DoorOpen,
  Wrench,
  Package,
  CalendarDays,
  CalendarRange,
  MessageSquare,
  BarChart3,
  type LucideIcon,
} from 'lucide-react';
import { SystemRoleKey } from '@se/shared';
import { useAuth } from '@/lib/auth';
import { useRegistrationsCount } from '@/lib/registrationsCount';
import { cn } from '@/lib/utils';

/** Every authenticated user submits/tracks requests and may be routed approvals, regardless of role. */
const requestsNav: { to: string; label: string; icon: LucideIcon; end?: boolean }[] = [
  { to: '/requests', label: 'My Requests', icon: ClipboardList, end: true },
  { to: '/requests/approvals', label: 'Approvals', icon: ListChecks },
  { to: '/requests/hr-signoffs', label: 'HR Sign-offs', icon: ClipboardCheck },
  { to: '/front-desk', label: 'Front Desk', icon: DoorOpen },
  { to: '/requests/fulfilment-queue', label: 'Fulfilment Queue', icon: Wrench },
];

const platformNav: { to: string; label: string; icon: LucideIcon; end?: boolean }[] = [
  { to: '/', label: 'Overview', icon: LayoutGrid, end: true },
  { to: '/registrations', label: 'Registrations', icon: ClipboardCheck },
  { to: '/enterprises', label: 'Enterprises', icon: Building2 },
  { to: '/users', label: 'Platform Users', icon: Users },
  { to: '/audit', label: 'Audit Log', icon: ScrollText },
];

const organizationNav: { to: string; label: string; icon: LucideIcon }[] = [
  { to: '/organization/users', label: 'Users', icon: Users },
  { to: '/organization/departments', label: 'Departments', icon: Building },
  { to: '/organization/roles', label: 'Roles', icon: Shield },
  { to: '/organization/projects', label: 'Projects', icon: FolderKanban },
  { to: '/organization/details', label: 'Company Details', icon: Building2 },
  { to: '/organization/form-builder', label: 'Form Builder', icon: LayoutTemplate },
  { to: '/organization/leave-policy', label: 'Leave Policy', icon: CalendarClock },
  { to: '/organization/item-catalog', label: 'Item Catalog', icon: Package },
  { to: '/organization/absence-calendar', label: 'Absence Calendar', icon: CalendarRange },
  { to: '/organization/slack', label: 'Slack Integration', icon: MessageSquare },
];

function SidebarLink({
  to,
  label,
  icon: Icon,
  end,
  badge,
}: {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
  badge?: number;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          'flex h-[42px] items-center gap-3 rounded-sm px-3 text-sm font-medium transition-colors',
          isActive
            ? 'bg-white/[0.08] text-white'
            : 'text-white/60 hover:bg-white/[0.05] hover:text-white',
        )
      }
    >
      {({ isActive }) => (
        <>
          <Icon size={20} className={isActive ? 'text-accent-cyan' : ''} />
          {label}
          {!!badge && (
            <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full border border-white/25 bg-[#163E3E] px-[7px] text-[11px] font-bold text-white">
              {badge}
            </span>
          )}
        </>
      )}
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
  const { pendingCount } = useRegistrationsCount();
  const isEnterpriseAdmin = user?.roles.includes(SystemRoleKey.EnterpriseAdmin) ?? false;
  const isHrHead = user?.roles.includes(SystemRoleKey.HrHead) ?? false;
  // Same viewer set `resolveAbsenceScope` (reports/absences visibility policy) authorizes.
  const isReportsViewer =
    isEnterpriseAdmin ||
    isHrHead ||
    (user?.roles.includes(SystemRoleKey.ProjectManager) ?? false) ||
    (user?.roles.includes(SystemRoleKey.TechLead) ?? false);
  return (
    <div
      className="flex h-full w-[248px] flex-none flex-col px-[14px] py-[18px]"
      style={{ background: 'var(--brand)' }}
    >
      {/* Brand */}
      <div className="flex flex-none items-center gap-3 px-2 pb-5 pt-[6px]">
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

      {/* Scrollable nav content — everything between the fixed brand header and user footer.
          Scrollbar is hidden (no-scrollbar) — it still scrolls, just without a visible track. */}
      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto">
        {/* Requests — every tenant user (not the platform-level System Admin) */}
        {!user?.isSystemAdmin && (
          <div className="flex flex-col gap-[3px]">
            {requestsNav.map((item) => (
              <SidebarLink key={item.to} {...item} />
            ))}
            {isHrHead && <SidebarLink to="/requests/absences" label="Absences" icon={CalendarDays} />}
            {isReportsViewer && <SidebarLink to="/reports" label="Reports" icon={BarChart3} />}
          </div>
        )}

        {/* Platform section — System Admin only */}
        {user?.isSystemAdmin && (
          <>
            <div className="px-[10px] pb-[6px] pt-2 text-[11px] font-semibold tracking-[.6px] text-white/40">
              PLATFORM
            </div>
            <div className="flex flex-col gap-[3px]">
              {platformNav.map((item) => (
                <SidebarLink
                  key={item.to}
                  {...item}
                  badge={item.to === '/registrations' ? pendingCount : undefined}
                />
              ))}
            </div>
          </>
        )}

        {/* Organization section — Enterprise Admin only */}
        {isEnterpriseAdmin && (
          <>
            <div className="px-[10px] pb-[6px] pt-4 text-[11px] font-semibold tracking-[.6px] text-white/40">
              ORGANIZATION
            </div>
            <div className="flex flex-col gap-[3px]">
              {organizationNav.map((item) => (
                <SidebarLink key={item.to} {...item} />
              ))}
            </div>
          </>
        )}

        {/* System section — System Admin only */}
        {user?.isSystemAdmin && (
          <>
            <div className="px-[10px] pb-[6px] pt-4 text-[11px] font-semibold tracking-[.6px] text-white/40">
              SYSTEM
            </div>
            <SidebarLink to="/settings" label="Settings" icon={Settings} />
          </>
        )}
      </div>

      {/* User */}
      <div className="flex flex-none items-center gap-[11px] border-t border-white/[0.12] p-[10px]">
        <Initials name={user?.name ?? '?'} />
        <div className="min-w-0">
          <div className="whitespace-nowrap text-[13px] font-semibold text-white">{user?.name}</div>
          <div className="truncate text-[11px] text-white/55">
            {user?.isSystemAdmin ? 'System Admin' : isEnterpriseAdmin ? 'Enterprise Admin' : 'User'}
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
