import * as React from 'react';
import { Search, PencilLine, Plus, Check, ShieldCheck, Lock, Trash2 } from 'lucide-react';
import {
  PERMISSION_CATALOG,
  permissionScopeSummary,
  type CreateRoleRequest,
  type RoleDto,
  type RolesResponse,
} from '@se/shared';
import { PageHeader } from '@/components/shell/PageHeader';
import { Button } from '@/components/ui/button';
import { Overlay } from '@/components/ui/overlay';
import { apiFetch, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';

type TypeFilter = '' | 'system' | 'custom';

const FILTERS: { value: TypeFilter; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'system', label: 'System' },
  { value: 'custom', label: 'Custom' },
];

function TypeBadge({ isSystem }: { isSystem: boolean }) {
  return isSystem ? (
    <span className="inline-flex items-center gap-[6px] rounded-full bg-[rgb(236,245,246)] px-[10px] py-1 text-xs font-medium text-brand">
      <ShieldCheck size={12} />
      System
    </span>
  ) : (
    <span className="inline-flex items-center rounded-full bg-surface-muted px-[10px] py-1 text-xs font-medium text-ink-700">
      Custom
    </span>
  );
}

function PermissionPicker({
  selected,
  disabled,
  onToggle,
}: {
  selected: Set<string>;
  disabled: boolean;
  onToggle: (key: string) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      {PERMISSION_CATALOG.map((group) => (
        <div key={group.group}>
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[.4px] text-ink-400">
            {group.group}
          </div>
          <div className="flex flex-col gap-1">
            {group.permissions.map((p) => {
              const checked = selected.has(p.key);
              return (
                <button
                  key={p.key}
                  type="button"
                  disabled={disabled}
                  onClick={() => onToggle(p.key)}
                  className={`flex items-center gap-[10px] rounded-sm px-2 py-[7px] text-left text-sm ${
                    disabled ? 'cursor-default' : 'hover:bg-surface-muted'
                  }`}
                >
                  <span
                    className={`flex h-[18px] w-[18px] flex-none items-center justify-center rounded-[5px] border ${
                      checked ? 'border-brand bg-brand text-white' : 'border-line bg-surface'
                    }`}
                  >
                    {checked && <Check size={13} strokeWidth={3} />}
                  </span>
                  <span className={disabled ? 'text-ink-500' : 'text-ink-900'}>{p.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function RoleModal({
  role,
  onClose,
  onSaved,
}: {
  role: RoleDto | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isSystem = role?.isSystem ?? false;
  const [name, setName] = React.useState(role?.name ?? '');
  const [selected, setSelected] = React.useState<Set<string>>(new Set(role?.permissions ?? []));
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function onSave() {
    setError(null);
    if (!name.trim()) return setError('Role name is required.');
    setBusy(true);
    try {
      const body: CreateRoleRequest = { name, permissions: [...selected] };
      if (role) {
        await apiFetch(`/roles/${role.id}`, { method: 'PUT', body: JSON.stringify(body) });
      } else {
        await apiFetch('/roles', { method: 'POST', body: JSON.stringify(body) });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to save the role.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Overlay onClose={onClose} z={60}>
      <div className="mx-auto flex max-h-[85vh] w-full max-w-[480px] flex-col rounded-2xl bg-surface shadow-xl">
        <div className="flex items-center gap-3 px-[26px] pt-[26px]">
          <div className="flex h-[42px] w-[42px] flex-none items-center justify-center rounded-[10px] bg-[rgb(236,245,246)] text-brand">
            <PencilLine size={20} />
          </div>
          <div className="text-lg font-bold text-ink-900">{role ? 'Edit role' : 'New role'}</div>
        </div>

        <div className="flex-1 overflow-y-auto px-[26px] py-5">
          <label className="flex flex-col gap-2">
            <span className="text-sm font-semibold text-ink-900">Role name</span>
            <div className="flex h-11 items-center rounded-sm border border-line bg-surface px-3">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Finance Approver"
                className="min-w-0 flex-1 border-none bg-transparent text-sm text-ink-900 outline-none"
              />
            </div>
          </label>

          <div className="mt-5">
            <div className="mb-3 text-sm font-semibold text-ink-900">Permissions</div>
            {isSystem && (
              <div className="mb-3 flex items-start gap-[10px] rounded-sm bg-[rgb(236,245,246)] px-[13px] py-[10px]">
                <Lock size={15} className="mt-[1px] flex-none text-brand" />
                <span className="text-[12.5px] leading-[1.5] text-ink-500">
                  System role permissions are fixed by the platform. You can rename the role, but
                  its capabilities stay as designed.
                </span>
              </div>
            )}
            <PermissionPicker selected={selected} disabled={isSystem} onToggle={toggle} />
          </div>

          {error && <div className="mt-4 text-sm font-medium text-danger">{error}</div>}
        </div>

        <div className="flex justify-end gap-3 border-t border-line-soft px-[26px] py-[18px]">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={onSave} disabled={busy}>
            <Check size={16} />
            {busy ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>
    </Overlay>
  );
}

export default function Roles() {
  const { user } = useAuth();
  const [rows, setRows] = React.useState<RoleDto[]>([]);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [page, setPage] = React.useState(1);
  const [pageSize] = React.useState(20);
  const [search, setSearch] = React.useState('');
  const [debouncedSearch, setDebouncedSearch] = React.useState('');
  const [type, setType] = React.useState<TypeFilter>('');
  const [editing, setEditing] = React.useState<RoleDto | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [deleting, setDeleting] = React.useState<RoleDto | null>(null);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = React.useState(false);

  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (type) params.set('type', type);
      const res = await apiFetch<RolesResponse>(`/roles?${params.toString()}`);
      setRows(res.rows);
      setTotal(res.total);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, debouncedSearch, type]);

  React.useEffect(() => {
    load();
  }, [load]);

  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);
  const hasNextPage = page * pageSize < total;

  function onSaved() {
    setEditing(null);
    setCreating(false);
    load();
  }

  function openDelete(role: RoleDto) {
    setDeleting(role);
    setDeleteError(null);
  }

  async function onConfirmDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await apiFetch(`/roles/${deleting.id}`, { method: 'DELETE' });
      setDeleting(null);
      load();
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : 'Unable to delete the role.');
    } finally {
      setDeleteBusy(false);
    }
  }

  const GRID = 'grid-cols-[1.4fr_2.4fr_0.8fr_0.8fr_0.8fr]';

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader
          title="Roles & Permissions"
          subtitle="System roles drive approval routing; custom roles group everyone else."
          breadcrumb={`Organization · ${user?.tenantName ?? ''}`}
        />
        <Button size="lg" onClick={() => setCreating(true)}>
          <Plus size={18} />
          New Role
        </Button>
      </div>

      <div className="mt-[22px] flex flex-wrap items-center gap-3">
        <div className="flex h-11 w-[280px] items-center gap-2 rounded-sm border border-line bg-surface px-3">
          <Search size={16} className="flex-none text-ink-300" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search roles…"
            className="min-w-0 flex-1 border-none bg-transparent text-sm text-ink-900 outline-none"
          />
        </div>
        <div className="flex gap-[6px]">
          {FILTERS.map((f) => (
            <button
              key={f.label}
              onClick={() => {
                setType(f.value);
                setPage(1);
              }}
              className={`rounded-lg border px-[13px] py-[7px] text-[12.5px] font-semibold transition-colors ${
                type === f.value
                  ? 'border-brand bg-brand text-white'
                  : 'border-line-soft bg-surface text-ink-500 hover:bg-surface-muted'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-[18px] overflow-x-auto rounded-xl border border-line-soft bg-surface shadow-card">
        <div
          className={`grid ${GRID} min-w-[760px] bg-surface-muted px-[22px] py-[13px] text-[11px] font-semibold uppercase tracking-[.4px] text-ink-400`}
        >
          <span>Role</span>
          <span>Scope</span>
          <span>Members</span>
          <span>Type</span>
          <span className="text-right">Actions</span>
        </div>
        {rows.map((role) => (
          <div
            key={role.id}
            className={`grid ${GRID} min-w-[760px] items-center border-b border-line-soft px-[22px] py-[15px] last:border-b-0`}
          >
            <span className="pr-3 text-sm font-semibold text-ink-900">{role.name}</span>
            <span className="pr-3 text-[13px] text-ink-500">
              {permissionScopeSummary(role.permissions)}
            </span>
            <span className="text-[13px] text-ink-700">{role.memberCount}</span>
            <span>
              <TypeBadge isSystem={role.isSystem} />
            </span>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => setEditing(role)}>
                <PencilLine size={14} />
                Edit
              </Button>
              {!role.isSystem && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => openDelete(role)}
                  aria-label={`Delete ${role.name}`}
                >
                  <Trash2 size={14} className="text-danger" />
                </Button>
              )}
            </div>
          </div>
        ))}
        {!loading && rows.length === 0 && (
          <div className="px-4 py-12 text-center text-sm text-ink-400">
            No roles match your search.
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

      {(creating || editing) && (
        <RoleModal
          role={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={onSaved}
        />
      )}

      {deleting && (
        <Overlay onClose={() => setDeleting(null)} z={70}>
          <div className="mx-auto w-full max-w-[440px] rounded-xl bg-surface p-[26px] shadow-xl">
            <div className="flex items-center gap-3">
              <div className="flex h-[42px] w-[42px] flex-none items-center justify-center rounded-[10px] bg-danger/[0.12] text-danger">
                <Trash2 size={22} />
              </div>
              <div className="text-lg font-bold text-ink-900">Delete role</div>
            </div>
            <div className="mt-[14px] text-[13.5px] leading-[1.6] text-ink-500">
              Delete <strong>{deleting.name}</strong>? This can&apos;t be undone. A role that&apos;s
              still assigned to members can&apos;t be deleted.
            </div>
            {deleteError && <div className="mt-3 text-sm font-medium text-danger">{deleteError}</div>}
            <div className="mt-[22px] flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setDeleting(null)}>
                Cancel
              </Button>
              <Button variant="danger" onClick={onConfirmDelete} disabled={deleteBusy}>
                {deleteBusy ? 'Deleting…' : 'Delete role'}
              </Button>
            </div>
          </div>
        </Overlay>
      )}
    </>
  );
}
