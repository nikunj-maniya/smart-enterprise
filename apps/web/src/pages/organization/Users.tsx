import * as React from 'react';
import {
  Search,
  ChevronDown,
  UserPlus,
  UserCheck,
  UserX,
  Building,
  Mail,
  Lock,
  Check,
  KeyRound,
  Copy,
  Link2,
  RefreshCw,
  ShieldCheck,
  PencilLine,
  Trash2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  userStatus,
  type AdminResetPasswordResponse,
  type CreateOrgUserRequest,
  type DepartmentsResponse,
  type OrgUserDto,
  type OrgUsersResponse,
  type OrgUserStats,
  type RegistrationLinkDto,
  type RolesResponse,
  type UpdateOrgUserRequest,
} from '@se/shared';
import { PageHeader } from '@/components/shell/PageHeader';
import { Button } from '@/components/ui/button';
import { Overlay } from '@/components/ui/overlay';
import { apiFetch, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';

const GRID = 'grid-cols-[2fr_1.3fr_1.3fr_1fr_1fr]';

const STATUS_STYLE: Record<string, { label: string; bg: string; fg: string; dot: string }> = {
  Active: { label: 'Active', bg: 'rgb(233,246,233)', fg: 'rgb(33,131,88)', dot: 'rgb(70,167,88)' },
  Inactive: { label: 'Deactivated', bg: 'rgb(241,242,242)', fg: 'var(--ink-500)', dot: 'var(--ink-400)' },
  Pending: { label: 'Pending', bg: 'rgb(255,247,237)', fg: 'rgb(204,78,0)', dot: 'rgb(247,107,21)' },
  Suspended: { label: 'Suspended', bg: 'rgb(254,235,236)', fg: 'rgb(206,44,49)', dot: 'rgb(229,72,77)' },
};

function initials(name: string) {
  return name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function StatusBadge({ status }: { status: string }) {
  const c = STATUS_STYLE[status] ?? STATUS_STYLE.Inactive;
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

function RoleBadge({ name }: { name: string }) {
  const isEmployee = name === 'Employee';
  return (
    <span
      className="inline-flex items-center rounded-full px-[9px] py-[3px] text-[11.5px] font-medium"
      style={
        isEmployee
          ? { background: 'var(--surface-muted)', color: 'var(--ink-700)' }
          : { background: 'rgb(230,244,254)', color: 'rgb(0,144,255)' }
      }
    >
      {name}
    </span>
  );
}

const STAT_TONES = {
  success: { bg: 'rgb(233,246,233)', fg: 'rgb(33,131,88)' },
  danger: { bg: 'rgb(254,235,236)', fg: 'rgb(229,72,77)' },
  brand: { bg: 'rgb(236,245,246)', fg: 'var(--brand)' },
} as const;

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

/** Scrollable checkbox multi-select, matching the role-permission / department-head pickers. */
function MultiSelect({
  options,
  selected,
  onToggle,
  emptyNote,
}: {
  options: { id: string; name: string }[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  emptyNote: string;
}) {
  if (options.length === 0) {
    return (
      <div className="rounded-sm border border-dashed border-line bg-app-bg px-3 py-4 text-center text-[13px] text-ink-400">
        {emptyNote}
      </div>
    );
  }
  return (
    <div className="max-h-[160px] overflow-y-auto rounded-sm border border-line">
      {options.map((o) => {
        const checked = selected.has(o.id);
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onToggle(o.id)}
            className="flex w-full items-center gap-[10px] border-b border-line-soft px-3 py-[9px] text-left last:border-b-0 hover:bg-surface-muted"
          >
            <span
              className={`flex h-[18px] w-[18px] flex-none items-center justify-center rounded-[5px] border ${
                checked ? 'border-brand bg-brand text-white' : 'border-line bg-surface'
              }`}
            >
              {checked && <Check size={13} strokeWidth={3} />}
            </span>
            <span className="text-sm text-ink-900">{o.name}</span>
          </button>
        );
      })}
    </div>
  );
}

function AddUserModal({
  roles,
  departments,
  onClose,
  onSaved,
}: {
  roles: { id: string; name: string }[];
  departments: { id: string; name: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [roleIds, setRoleIds] = React.useState<Set<string>>(new Set());
  const [departmentIds, setDepartmentIds] = React.useState<Set<string>>(new Set());
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  function toggle(set: React.Dispatch<React.SetStateAction<Set<string>>>, id: string) {
    set((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function onSave() {
    setError(null);
    if (!name.trim()) return setError('Name is required.');
    if (!email.trim()) return setError('Email is required.');
    if (password.length < 8) return setError('Password must be at least 8 characters.');
    setBusy(true);
    try {
      const body: CreateOrgUserRequest = {
        name,
        email,
        password,
        roleIds: [...roleIds],
        departmentIds: [...departmentIds],
      };
      await apiFetch('/org-users', { method: 'POST', body: JSON.stringify(body) });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to create the user.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Overlay onClose={onClose} z={60}>
      <div className="mx-auto flex max-h-[88vh] w-full max-w-[480px] flex-col rounded-2xl bg-surface shadow-xl">
        <div className="flex items-center gap-3 px-[26px] pt-[26px]">
          <div className="flex h-[42px] w-[42px] flex-none items-center justify-center rounded-[10px] bg-[rgb(236,245,246)] text-brand">
            <UserPlus size={22} />
          </div>
          <div>
            <div className="text-lg font-bold text-ink-900">Add user</div>
            <div className="text-[12.5px] text-ink-400">
              The account activates immediately — no email step.
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-[26px] py-5">
          <div className="grid grid-cols-2 gap-4">
            <label className="flex flex-col gap-2">
              <span className="text-sm font-semibold text-ink-900">Full name</span>
              <div className="flex h-11 items-center rounded-sm border border-line bg-surface px-3">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Priya Raman"
                  className="min-w-0 flex-1 border-none bg-transparent text-sm text-ink-900 outline-none"
                />
              </div>
            </label>
            <label className="flex flex-col gap-2">
              <span className="text-sm font-semibold text-ink-900">Email</span>
              <div className="flex h-11 items-center gap-2 rounded-sm border border-line bg-surface px-3">
                <Mail size={16} className="flex-none text-ink-300" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="priya@company.com"
                  className="min-w-0 flex-1 border-none bg-transparent text-sm text-ink-900 outline-none"
                />
              </div>
            </label>
          </div>

          <label className="mt-4 flex flex-col gap-2">
            <span className="text-sm font-semibold text-ink-900">Initial password</span>
            <div className="flex h-11 items-center gap-2 rounded-sm border border-line bg-surface px-3">
              <Lock size={16} className="flex-none text-ink-300" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                className="min-w-0 flex-1 border-none bg-transparent text-sm text-ink-900 outline-none"
              />
            </div>
            <span className="text-[12px] text-ink-400">
              The user must change this on first login.
            </span>
          </label>

          <div className="mt-4 grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <span className="text-sm font-semibold text-ink-900">Roles</span>
              <MultiSelect
                options={roles}
                selected={roleIds}
                onToggle={(id) => toggle(setRoleIds, id)}
                emptyNote="No roles yet."
              />
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-sm font-semibold text-ink-900">Departments</span>
              <MultiSelect
                options={departments}
                selected={departmentIds}
                onToggle={(id) => toggle(setDepartmentIds, id)}
                emptyNote="No departments yet."
              />
            </div>
          </div>

          {error && <div className="mt-4 text-sm font-medium text-danger">{error}</div>}
        </div>

        <div className="flex justify-end gap-3 border-t border-line-soft px-[26px] py-[18px]">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={onSave} disabled={busy}>
            <UserPlus size={16} />
            {busy ? 'Sending…' : 'Send Invite'}
          </Button>
        </div>
      </div>
    </Overlay>
  );
}

function EditUserModal({
  user,
  roles,
  departments,
  onClose,
  onSaved,
}: {
  user: OrgUserDto;
  roles: { id: string; name: string }[];
  departments: { id: string; name: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = React.useState(user.name);
  const [roleIds, setRoleIds] = React.useState<Set<string>>(new Set(user.roles.map((r) => r.id)));
  const [departmentIds, setDepartmentIds] = React.useState<Set<string>>(
    new Set(user.departments.map((d) => d.id)),
  );
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  function toggle(set: React.Dispatch<React.SetStateAction<Set<string>>>, id: string) {
    set((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function onSave() {
    setError(null);
    if (!name.trim()) return setError('Name is required.');
    setBusy(true);
    try {
      const body: UpdateOrgUserRequest = {
        name,
        roleIds: [...roleIds],
        departmentIds: [...departmentIds],
      };
      await apiFetch(`/org-users/${user.id}`, { method: 'PUT', body: JSON.stringify(body) });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to update the user.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Overlay onClose={onClose} z={60}>
      <div className="mx-auto flex max-h-[88vh] w-full max-w-[480px] flex-col rounded-2xl bg-surface shadow-xl">
        <div className="flex items-center gap-3 px-[26px] pt-[26px]">
          <div className="flex h-[42px] w-[42px] flex-none items-center justify-center rounded-[10px] bg-[rgb(236,245,246)] text-brand">
            <PencilLine size={20} />
          </div>
          <div className="min-w-0">
            <div className="text-lg font-bold text-ink-900">Edit user</div>
            <div className="truncate text-[12.5px] text-ink-400">{user.email}</div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-[26px] py-5">
          <label className="flex flex-col gap-2">
            <span className="text-sm font-semibold text-ink-900">Full name</span>
            <div className="flex h-11 items-center rounded-sm border border-line bg-surface px-3">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="min-w-0 flex-1 border-none bg-transparent text-sm text-ink-900 outline-none"
              />
            </div>
          </label>

          <div className="mt-4 grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <span className="text-sm font-semibold text-ink-900">Roles</span>
              <MultiSelect
                options={roles}
                selected={roleIds}
                onToggle={(id) => toggle(setRoleIds, id)}
                emptyNote="No roles yet."
              />
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-sm font-semibold text-ink-900">Departments</span>
              <MultiSelect
                options={departments}
                selected={departmentIds}
                onToggle={(id) => toggle(setDepartmentIds, id)}
                emptyNote="No departments yet."
              />
            </div>
          </div>

          {error && <div className="mt-4 text-sm font-medium text-danger">{error}</div>}
        </div>

        <div className="flex justify-end gap-3 border-t border-line-soft px-[26px] py-[18px]">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={onSave} disabled={busy}>
            <Check size={16} />
            {busy ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </div>
    </Overlay>
  );
}

const EXPIRY_OPTIONS = [
  { minutes: 30, label: '30 minutes' },
  { minutes: 120, label: '2 hours' },
  { minutes: 1440, label: '24 hours' },
  { minutes: 10080, label: '7 days' },
];

function InviteLinkModal({ onClose }: { onClose: () => void }) {
  const [link, setLink] = React.useState<RegistrationLinkDto | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [expiryMinutes, setExpiryMinutes] = React.useState(30);
  const [busy, setBusy] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    apiFetch<RegistrationLinkDto | null>('/self-registration')
      .then(setLink)
      .catch(() => setLink(null))
      .finally(() => setLoading(false));
  }, []);

  const active = link && !link.expired;

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch<RegistrationLinkDto>('/self-registration', {
        method: 'POST',
        body: JSON.stringify({ expiryMinutes }),
      });
      setLink(res);
      setCopied(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to generate the link.');
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    setBusy(true);
    setError(null);
    try {
      await apiFetch('/self-registration', { method: 'DELETE' });
      setLink(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to revoke the link.');
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!link) return;
    await navigator.clipboard.writeText(link.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Overlay onClose={onClose} z={60}>
      <div className="mx-auto w-full max-w-[480px] rounded-2xl bg-surface p-[26px] shadow-xl">
        <div className="flex items-center gap-3">
          <div className="flex h-[42px] w-[42px] flex-none items-center justify-center rounded-[10px] bg-[rgb(236,245,246)] text-brand">
            <Link2 size={20} />
          </div>
          <div>
            <div className="text-lg font-bold text-ink-900">Self-registration link</div>
            <div className="text-[12.5px] text-ink-400">
              Anyone with the link joins as an Employee until it expires.
            </div>
          </div>
        </div>

        {loading ? (
          <div className="py-8 text-center text-sm text-ink-400">Loading…</div>
        ) : active ? (
          <div className="mt-5">
            <span className="text-sm font-semibold text-ink-900">Shareable link</span>
            <div className="mt-2 flex items-center gap-2 rounded-sm border border-line bg-app-bg px-3 py-[10px]">
              <span className="min-w-0 flex-1 truncate font-mono text-[13px] text-ink-700">
                {link.url}
              </span>
              <Button variant="secondary" size="sm" onClick={copy}>
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>
            <div className="mt-3 flex items-start gap-[10px] rounded-sm bg-[rgb(236,245,246)] px-[15px] py-[11px]">
              <ShieldCheck size={16} className="mt-[1px] flex-none text-brand" />
              <span className="text-[12.5px] leading-[1.5] text-ink-500">
                Expires {new Date(link.expiresAt).toLocaleString()}. Revoke it anytime, or
                regenerate to replace it.
              </span>
            </div>
            {error && <div className="mt-3 text-sm font-medium text-danger">{error}</div>}
            <div className="mt-[22px] flex justify-end gap-3">
              <Button variant="danger" onClick={revoke} disabled={busy}>
                {busy ? 'Working…' : 'Revoke'}
              </Button>
              <Button variant="secondary" onClick={generate} disabled={busy}>
                <RefreshCw size={15} />
                Regenerate
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-5">
            {link && link.expired && (
              <div className="mb-4 rounded-sm bg-[rgba(247,107,21,.1)] px-[15px] py-[11px] text-[12.5px] leading-[1.5] text-warning">
                The previous link has expired. Generate a new one to invite employees.
              </div>
            )}
            <label className="flex flex-col gap-2">
              <span className="text-sm font-semibold text-ink-900">Link expires after</span>
              <div className="relative flex items-center">
                <select
                  value={expiryMinutes}
                  onChange={(e) => setExpiryMinutes(Number(e.target.value))}
                  className="h-11 w-full appearance-none rounded-sm border border-line bg-surface py-0 pl-3 pr-9 text-sm text-ink-900 outline-none"
                >
                  {EXPIRY_OPTIONS.map((o) => (
                    <option key={o.minutes} value={o.minutes}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <ChevronDown size={18} className="pointer-events-none absolute right-3 text-ink-400" />
              </div>
            </label>
            {error && <div className="mt-3 text-sm font-medium text-danger">{error}</div>}
            <div className="mt-[22px] flex justify-end gap-3">
              <Button variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={generate} disabled={busy}>
                <Link2 size={16} />
                {busy ? 'Generating…' : 'Generate link'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Overlay>
  );
}

export default function OrgUsers() {
  const { user } = useAuth();
  const [rows, setRows] = React.useState<OrgUserDto[]>([]);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [stats, setStats] = React.useState<OrgUserStats | null>(null);
  const [page, setPage] = React.useState(1);
  const [pageSize] = React.useState(20);
  const [search, setSearch] = React.useState('');
  const [debouncedSearch, setDebouncedSearch] = React.useState('');
  const [status, setStatus] = React.useState('');
  const [departmentId, setDepartmentId] = React.useState('');
  const [roles, setRoles] = React.useState<{ id: string; name: string }[]>([]);
  const [departments, setDepartments] = React.useState<{ id: string; name: string }[]>([]);
  const [adding, setAdding] = React.useState(false);
  const [editing, setEditing] = React.useState<OrgUserDto | null>(null);
  const [linkModalOpen, setLinkModalOpen] = React.useState(false);
  const [deactivating, setDeactivating] = React.useState<OrgUserDto | null>(null);
  const [rejecting, setRejecting] = React.useState<OrgUserDto | null>(null);
  const [removing, setRemoving] = React.useState<OrgUserDto | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [resetResult, setResetResult] = React.useState<{ user: OrgUserDto; password: string } | null>(
    null,
  );
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    apiFetch<RolesResponse>('/roles?pageSize=100').then((r) => setRoles(r.rows));
    apiFetch<DepartmentsResponse>('/departments?pageSize=100').then((r) => setDepartments(r.rows));
  }, []);

  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (status) params.set('status', status);
      if (departmentId) params.set('departmentId', departmentId);
      const [res, statsRes] = await Promise.all([
        apiFetch<OrgUsersResponse>(`/org-users?${params.toString()}`),
        apiFetch<OrgUserStats>('/org-users/stats'),
      ]);
      setRows(res.rows);
      setTotal(res.total);
      setStats(statsRes);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, debouncedSearch, status, departmentId]);

  React.useEffect(() => {
    load();
  }, [load]);

  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);
  const hasNextPage = page * pageSize < total;

  async function onConfirmDeactivate() {
    if (!deactivating) return;
    setBusyId(deactivating.id);
    setActionError(null);
    try {
      await apiFetch(`/org-users/${deactivating.id}/deactivate`, { method: 'POST' });
      setDeactivating(null);
      load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Unable to deactivate the user.');
    } finally {
      setBusyId(null);
    }
  }

  async function onConfirmRemove() {
    if (!removing) return;
    setBusyId(removing.id);
    setActionError(null);
    try {
      await apiFetch(`/org-users/${removing.id}`, { method: 'DELETE' });
      setRemoving(null);
      load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Unable to remove the user.');
    } finally {
      setBusyId(null);
    }
  }

  async function onReactivate(u: OrgUserDto) {
    setBusyId(u.id);
    try {
      await apiFetch(`/org-users/${u.id}/reactivate`, { method: 'POST' });
      load();
    } finally {
      setBusyId(null);
    }
  }

  async function onApprove(u: OrgUserDto) {
    setBusyId(u.id);
    try {
      await apiFetch(`/org-users/${u.id}/approve`, { method: 'POST' });
      load();
    } finally {
      setBusyId(null);
    }
  }

  async function onConfirmReject() {
    if (!rejecting) return;
    setBusyId(rejecting.id);
    setActionError(null);
    try {
      await apiFetch(`/org-users/${rejecting.id}/reject`, { method: 'POST' });
      setRejecting(null);
      load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Unable to reject the request.');
    } finally {
      setBusyId(null);
    }
  }

  async function onResetPassword(u: OrgUserDto) {
    setBusyId(u.id);
    try {
      const res = await apiFetch<AdminResetPasswordResponse>(`/org-users/${u.id}/reset-password`, {
        method: 'POST',
      });
      setResetResult({ user: u, password: res.temporaryPassword });
      setCopied(false);
    } finally {
      setBusyId(null);
    }
  }

  const STATUS_FILTERS = [
    { value: '', label: 'All', badge: 0 },
    { value: userStatus.enum.Active, label: 'Active', badge: 0 },
    { value: userStatus.enum.Pending, label: 'Pending', badge: stats?.pending ?? 0 },
    { value: userStatus.enum.Inactive, label: 'Deactivated', badge: 0 },
  ];

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader
          title="Users"
          subtitle="Invite people, assign departments and roles, and deactivate access. Accounts activate without an email step."
          breadcrumb={`Organization · ${user?.tenantName ?? ''}`}
        />
        <div className="flex gap-3">
          <Button variant="secondary" size="lg" onClick={() => setLinkModalOpen(true)}>
            <Link2 size={18} />
            Share invite link
          </Button>
          <Button size="lg" onClick={() => setAdding(true)}>
            <UserPlus size={18} />
            Add User
          </Button>
        </div>
      </div>

      <div className="mt-[22px] grid max-w-[640px] grid-cols-3 gap-[18px]">
        <StatCard icon={UserCheck} tone="success" value={stats?.active ?? 0} label="Active Users" />
        <StatCard icon={UserX} tone="danger" value={stats?.inactive ?? 0} label="Deactivated" />
        <StatCard icon={Building} tone="brand" value={stats?.departments ?? 0} label="Departments" />
      </div>

      <div className="mt-[22px] flex flex-wrap items-center gap-3">
        <div className="flex h-11 w-[280px] items-center gap-2 rounded-sm border border-line bg-surface px-3">
          <Search size={16} className="flex-none text-ink-300" />
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search users…"
            className="min-w-0 flex-1 border-none bg-transparent text-sm text-ink-900 outline-none"
          />
        </div>
        <div className="flex gap-[6px]">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.label}
              onClick={() => {
                setStatus(f.value);
                setPage(1);
              }}
              className={`inline-flex items-center gap-[6px] rounded-lg border px-[13px] py-[7px] text-[12.5px] font-semibold transition-colors ${
                status === f.value
                  ? 'border-brand bg-brand text-white'
                  : 'border-line-soft bg-surface text-ink-500 hover:bg-surface-muted'
              }`}
            >
              {f.label}
              {f.badge > 0 && (
                <span
                  className={`flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-[5px] text-[11px] font-bold ${
                    status === f.value ? 'bg-white/25 text-white' : 'bg-warning/15 text-warning'
                  }`}
                >
                  {f.badge}
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="relative flex items-center">
          <select
            value={departmentId}
            onChange={(e) => {
              setDepartmentId(e.target.value);
              setPage(1);
            }}
            className={`h-11 w-[200px] appearance-none rounded-sm border border-line bg-surface py-0 pl-3 pr-9 text-sm outline-none ${
              departmentId ? 'text-ink-900' : 'text-ink-300'
            }`}
          >
            <option value="">All Departments</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id} className="text-ink-900">
                {d.name}
              </option>
            ))}
          </select>
          <ChevronDown size={18} className="pointer-events-none absolute right-3 text-ink-400" />
        </div>
      </div>

      <div className="mt-[18px] overflow-x-auto rounded-xl border border-line-soft bg-surface shadow-card">
        <div
          className={`grid ${GRID} min-w-[820px] bg-surface-muted px-[22px] py-[13px] text-[11px] font-semibold uppercase tracking-[.4px] text-ink-400`}
        >
          <span>User</span>
          <span>Department</span>
          <span>Role</span>
          <span>Status</span>
          <span className="text-right">Actions</span>
        </div>
        {rows.map((u) => (
          <div
            key={u.id}
            className={`grid ${GRID} min-w-[820px] items-center border-b border-line-soft px-[22px] py-[13px] last:border-b-0`}
          >
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-8 w-8 flex-none items-center justify-center rounded-[9px] bg-[rgb(236,245,246)] text-[13px] font-bold text-brand">
                {initials(u.name)}
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-ink-900">{u.name}</div>
                <div className="truncate text-xs text-ink-400">{u.email}</div>
              </div>
            </div>
            <span className="truncate pr-3 text-[13px] text-ink-700">
              {u.departments.map((d) => d.name).join(', ') || '—'}
            </span>
            <span className="flex flex-wrap gap-1 pr-3">
              {u.roles.length ? (
                u.roles.map((r) => <RoleBadge key={r.id} name={r.name} />)
              ) : (
                <span className="text-[13px] text-ink-400">—</span>
              )}
            </span>
            <span>
              <StatusBadge status={u.status} />
            </span>
            <div className="flex justify-end gap-2">
              {u.status === userStatus.enum.Pending ? (
                <>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setEditing(u)}
                    disabled={busyId === u.id}
                    aria-label={`Edit ${u.name}`}
                  >
                    <PencilLine size={14} />
                  </Button>
                  <Button size="sm" onClick={() => onApprove(u)} disabled={busyId === u.id}>
                    <Check size={14} />
                    {busyId === u.id ? 'Approving…' : 'Approve'}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setRejecting(u);
                      setActionError(null);
                    }}
                    disabled={busyId === u.id}
                  >
                    Reject
                  </Button>
                </>
              ) : u.status === userStatus.enum.Active ? (
                <>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setEditing(u)}
                    disabled={busyId === u.id}
                    aria-label={`Edit ${u.name}`}
                  >
                    <PencilLine size={14} />
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => onResetPassword(u)}
                    disabled={busyId === u.id}
                    aria-label={`Reset password for ${u.name}`}
                  >
                    <KeyRound size={14} />
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setDeactivating(u);
                      setActionError(null);
                    }}
                    disabled={busyId === u.id}
                  >
                    Deactivate
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setRemoving(u);
                      setActionError(null);
                    }}
                    disabled={busyId === u.id}
                    aria-label={`Remove ${u.name}`}
                  >
                    <Trash2 size={14} className="text-danger" />
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onReactivate(u)}
                    disabled={busyId === u.id}
                  >
                    {busyId === u.id ? 'Reactivating…' : 'Reactivate'}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setRemoving(u);
                      setActionError(null);
                    }}
                    disabled={busyId === u.id}
                    aria-label={`Remove ${u.name}`}
                  >
                    <Trash2 size={14} className="text-danger" />
                  </Button>
                </>
              )}
            </div>
          </div>
        ))}
        {!loading && rows.length === 0 && (
          <div className="px-4 py-12 text-center text-sm text-ink-400">
            No users match your search.
          </div>
        )}
        {loading && <div className="px-4 py-12 text-center text-sm text-ink-400">Loading…</div>}
      </div>

      {total > pageSize && (
        <div className="mt-4 flex items-center justify-between">
          <span className="text-[12.5px] text-ink-400">
            Showing {rangeStart}–{rangeEnd} of {total}
          </span>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setPage((p) => p - 1)}
              disabled={page === 1}
            >
              Prev
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setPage((p) => p + 1)}
              disabled={!hasNextPage}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {adding && (
        <AddUserModal
          roles={roles}
          departments={departments}
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            load();
          }}
        />
      )}

      {linkModalOpen && <InviteLinkModal onClose={() => setLinkModalOpen(false)} />}

      {editing && (
        <EditUserModal
          user={editing}
          roles={roles}
          departments={departments}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}

      {removing && (
        <Overlay onClose={() => setRemoving(null)} z={60}>
          <div className="mx-auto w-full max-w-[440px] rounded-xl bg-surface p-[26px] shadow-xl">
            <div className="flex items-center gap-3">
              <div className="flex h-[42px] w-[42px] flex-none items-center justify-center rounded-[10px] bg-danger/[0.12] text-danger">
                <Trash2 size={22} />
              </div>
              <div className="text-lg font-bold text-ink-900">Remove user</div>
            </div>
            <div className="mt-[14px] text-[13.5px] leading-[1.6] text-ink-500">
              Permanently remove <strong>{removing.name}</strong> ({removing.email})? This can&apos;t
              be undone. To keep their history, use Deactivate instead — and a user who heads a
              department or is on a project can&apos;t be removed until reassigned.
            </div>
            {actionError && <div className="mt-3 text-sm font-medium text-danger">{actionError}</div>}
            <div className="mt-[22px] flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setRemoving(null)}>
                Cancel
              </Button>
              <Button variant="danger" onClick={onConfirmRemove} disabled={busyId === removing.id}>
                {busyId === removing.id ? 'Removing…' : 'Remove user'}
              </Button>
            </div>
          </div>
        </Overlay>
      )}

      {deactivating && (
        <Overlay onClose={() => setDeactivating(null)} z={60}>
          <div className="mx-auto w-full max-w-[440px] rounded-xl bg-surface p-[26px] shadow-xl">
            <div className="flex items-center gap-3">
              <div className="flex h-[42px] w-[42px] flex-none items-center justify-center rounded-[10px] bg-danger/[0.12] text-danger">
                <UserX size={22} />
              </div>
              <div className="text-lg font-bold text-ink-900">Deactivate user</div>
            </div>
            <div className="mt-[14px] text-[13.5px] leading-[1.6] text-ink-500">
              Deactivating <strong>{deactivating.name}</strong> blocks them from signing in. Their
              past requests and approvals stay intact, and you can reactivate them later.
            </div>
            {actionError && <div className="mt-3 text-sm font-medium text-danger">{actionError}</div>}
            <div className="mt-[22px] flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setDeactivating(null)}>
                Cancel
              </Button>
              <Button variant="danger" onClick={onConfirmDeactivate} disabled={busyId === deactivating.id}>
                {busyId === deactivating.id ? 'Deactivating…' : 'Deactivate'}
              </Button>
            </div>
          </div>
        </Overlay>
      )}

      {rejecting && (
        <Overlay onClose={() => setRejecting(null)} z={60}>
          <div className="mx-auto w-full max-w-[440px] rounded-xl bg-surface p-[26px] shadow-xl">
            <div className="flex items-center gap-3">
              <div className="flex h-[42px] w-[42px] flex-none items-center justify-center rounded-[10px] bg-danger/[0.12] text-danger">
                <UserX size={22} />
              </div>
              <div className="text-lg font-bold text-ink-900">Reject request</div>
            </div>
            <div className="mt-[14px] text-[13.5px] leading-[1.6] text-ink-500">
              Reject <strong>{rejecting.name}</strong>&apos;s request to join? Their self-registration
              is discarded and the email <strong>{rejecting.email}</strong> is freed to register
              again.
            </div>
            {actionError && <div className="mt-3 text-sm font-medium text-danger">{actionError}</div>}
            <div className="mt-[22px] flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setRejecting(null)}>
                Cancel
              </Button>
              <Button variant="danger" onClick={onConfirmReject} disabled={busyId === rejecting.id}>
                {busyId === rejecting.id ? 'Rejecting…' : 'Reject request'}
              </Button>
            </div>
          </div>
        </Overlay>
      )}

      {resetResult && (
        <Overlay
          onClose={() => {
            setResetResult(null);
            setCopied(false);
          }}
          z={60}
        >
          <div className="mx-auto w-full max-w-[440px] rounded-xl bg-surface p-[26px] shadow-xl">
            <div className="flex items-center gap-3">
              <div className="flex h-[42px] w-[42px] flex-none items-center justify-center rounded-[10px] bg-[rgb(236,245,246)] text-brand">
                <KeyRound size={22} />
              </div>
              <div className="text-lg font-bold text-ink-900">Password reset</div>
            </div>
            <div className="mt-[14px] text-[13.5px] leading-[1.6] text-ink-500">
              Share this temporary password with <strong>{resetResult.user.name}</strong> through a
              secure channel — it won&apos;t be shown again. They&apos;ll change it on next login.
            </div>
            <div className="mt-[18px] flex items-center justify-between gap-3 rounded-sm border border-line bg-app-bg px-[15px] py-[13px]">
              <span className="truncate font-mono text-[15px] font-semibold text-ink-900">
                {resetResult.password}
              </span>
              <Button
                variant="secondary"
                size="sm"
                onClick={async () => {
                  await navigator.clipboard.writeText(resetResult.password);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>
            <div className="mt-[22px] flex justify-end">
              <Button
                onClick={() => {
                  setResetResult(null);
                  setCopied(false);
                }}
              >
                Done
              </Button>
            </div>
          </div>
        </Overlay>
      )}
    </>
  );
}
