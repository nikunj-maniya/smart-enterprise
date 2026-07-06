import * as React from 'react';
import { Search, Building, PencilLine, Plus, Check, Trash2 } from 'lucide-react';
import type {
  CreateDepartmentRequest,
  DepartmentDto,
  DepartmentsResponse,
  OrgUserPickerDto,
} from '@se/shared';
import { PageHeader } from '@/components/shell/PageHeader';
import { Button } from '@/components/ui/button';
import { Overlay } from '@/components/ui/overlay';
import { apiFetch, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';

function DepartmentCard({
  dept,
  onEdit,
  onDelete,
}: {
  dept: DepartmentDto;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const headNames = dept.heads.map((h) => h.name).join(', ');
  return (
    <div className="rounded-[14px] border border-line-soft bg-surface p-5 shadow-card">
      <div className="flex items-center gap-3">
        <div className="flex h-[42px] w-[42px] flex-none items-center justify-center rounded-[11px] bg-[rgb(236,245,246)]">
          <Building size={20} className="text-brand" />
        </div>
        <div className="min-w-0 flex-1 truncate text-[16px] font-bold text-ink-900">{dept.name}</div>
        <button
          className="flex flex-none rounded-[7px] p-[6px] text-ink-400 hover:bg-surface-muted"
          onClick={onEdit}
          aria-label={`Edit ${dept.name}`}
        >
          <PencilLine size={16} />
        </button>
        <button
          className="flex flex-none rounded-[7px] p-[6px] text-ink-400 hover:bg-danger/10 hover:text-danger"
          onClick={onDelete}
          aria-label={`Delete ${dept.name}`}
        >
          <Trash2 size={16} />
        </button>
      </div>
      <div className="mt-4 flex justify-between gap-3 text-[13px]">
        <span className="flex-none text-ink-400">
          {dept.heads.length > 1 ? 'Department heads' : 'Department head'}
        </span>
        <span className="truncate text-right font-semibold text-ink-700">{headNames || '—'}</span>
      </div>
      <div className="mt-2 flex justify-between text-[13px]">
        <span className="text-ink-400">Members</span>
        <span className="font-semibold text-ink-700">{dept.memberCount}</span>
      </div>
    </div>
  );
}

function DepartmentModal({
  department,
  users,
  onClose,
  onSaved,
}: {
  department: DepartmentDto | null;
  users: OrgUserPickerDto[];
  onClose: () => void;
  onSaved: (dept: DepartmentDto) => void;
}) {
  const [name, setName] = React.useState(department?.name ?? '');
  const [headIds, setHeadIds] = React.useState<Set<string>>(
    new Set(department?.heads.map((h) => h.id) ?? []),
  );
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  function toggleHead(id: string) {
    setHeadIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function onSave() {
    setError(null);
    if (!name.trim()) return setError('Department name is required.');
    setBusy(true);
    try {
      const body: CreateDepartmentRequest = { name, headUserIds: [...headIds] };
      const dept = department
        ? await apiFetch<DepartmentDto>(`/departments/${department.id}`, {
            method: 'PUT',
            body: JSON.stringify(body),
          })
        : await apiFetch<DepartmentDto>('/departments', {
            method: 'POST',
            body: JSON.stringify(body),
          });
      onSaved(dept);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to save the department.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Overlay onClose={onClose} z={60}>
      <div className="mx-auto w-full max-w-[480px] rounded-2xl bg-surface p-[26px] shadow-xl">
        <div className="flex items-center gap-3">
          <div className="flex h-[42px] w-[42px] flex-none items-center justify-center rounded-[10px] bg-[rgb(236,245,246)] text-brand">
            <PencilLine size={20} />
          </div>
          <div className="text-lg font-bold text-ink-900">
            {department ? 'Edit department' : 'New department'}
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-4">
          <label className="flex flex-col gap-2">
            <span className="text-sm font-semibold text-ink-900">Department name</span>
            <div className="flex h-11 items-center rounded-sm border border-line bg-surface px-3">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Design"
                className="min-w-0 flex-1 border-none bg-transparent text-sm text-ink-900 outline-none"
              />
            </div>
          </label>

          <div className="flex flex-col gap-2">
            <span className="text-sm font-semibold text-ink-900">
              Department heads
              <span className="ml-1 font-normal text-ink-400">— select one or more</span>
            </span>
            {users.length === 0 ? (
              <div className="rounded-sm border border-dashed border-line bg-app-bg px-3 py-4 text-center text-[13px] text-ink-400">
                No members yet. Add users first, then assign heads.
              </div>
            ) : (
              <div className="max-h-[220px] overflow-y-auto rounded-sm border border-line">
                {users.map((u) => {
                  const checked = headIds.has(u.id);
                  return (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => toggleHead(u.id)}
                      className="flex w-full items-center gap-[10px] border-b border-line-soft px-3 py-[9px] text-left last:border-b-0 hover:bg-surface-muted"
                    >
                      <span
                        className={`flex h-[18px] w-[18px] flex-none items-center justify-center rounded-[5px] border ${
                          checked ? 'border-brand bg-brand text-white' : 'border-line bg-surface'
                        }`}
                      >
                        {checked && <Check size={13} strokeWidth={3} />}
                      </span>
                      <span className="text-sm text-ink-900">{u.name}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {error && <div className="mt-4 text-sm font-medium text-danger">{error}</div>}

        <div className="mt-[22px] flex justify-end gap-3">
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

export default function Departments() {
  const { user } = useAuth();
  const [rows, setRows] = React.useState<DepartmentDto[]>([]);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [page, setPage] = React.useState(1);
  const [pageSize] = React.useState(20);
  const [search, setSearch] = React.useState('');
  const [debouncedSearch, setDebouncedSearch] = React.useState('');
  const [users, setUsers] = React.useState<OrgUserPickerDto[]>([]);
  const [editing, setEditing] = React.useState<DepartmentDto | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [deleting, setDeleting] = React.useState<DepartmentDto | null>(null);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = React.useState(false);

  React.useEffect(() => {
    apiFetch<OrgUserPickerDto[]>('/org-users/options').then(setUsers);
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
      const res = await apiFetch<DepartmentsResponse>(`/departments?${params.toString()}`);
      setRows(res.rows);
      setTotal(res.total);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, debouncedSearch]);

  React.useEffect(() => {
    load();
  }, [load]);

  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);
  const hasNextPage = page * pageSize < total;

  function onSaved(_dept: DepartmentDto) {
    setEditing(null);
    setCreating(false);
    load();
  }

  async function onConfirmDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await apiFetch(`/departments/${deleting.id}`, { method: 'DELETE' });
      setDeleting(null);
      load();
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : 'Unable to delete the department.');
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader
          title="Departments"
          subtitle="Groups used across request routing. Each has a head and a member count."
          breadcrumb={`Organization · ${user?.tenantName ?? ''}`}
        />
        <Button size="lg" onClick={() => setCreating(true)}>
          <Plus size={18} />
          New Department
        </Button>
      </div>

      <div className="mt-[22px] flex items-center gap-3">
        <div className="flex h-11 w-[280px] items-center gap-2 rounded-sm border border-line bg-surface px-3">
          <Search size={16} className="flex-none text-ink-300" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search departments…"
            className="min-w-0 flex-1 border-none bg-transparent text-sm text-ink-900 outline-none"
          />
        </div>
      </div>

      {!loading && rows.length === 0 ? (
        <div className="mt-[18px] rounded-[14px] border border-dashed border-line bg-surface p-12 text-center text-sm text-ink-400">
          No departments match your search.
        </div>
      ) : (
        <div className="mt-[18px] grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-[18px]">
          {rows.map((dept) => (
            <DepartmentCard
              key={dept.id}
              dept={dept}
              onEdit={() => setEditing(dept)}
              onDelete={() => {
                setDeleting(dept);
                setDeleteError(null);
              }}
            />
          ))}
        </div>
      )}

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
        <DepartmentModal
          department={editing}
          users={users}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={onSaved}
        />
      )}

      {deleting && (
        <Overlay onClose={() => setDeleting(null)} z={60}>
          <div className="mx-auto w-full max-w-[440px] rounded-xl bg-surface p-[26px] shadow-xl">
            <div className="flex items-center gap-3">
              <div className="flex h-[42px] w-[42px] flex-none items-center justify-center rounded-[10px] bg-danger/[0.12] text-danger">
                <Trash2 size={22} />
              </div>
              <div className="text-lg font-bold text-ink-900">Delete department</div>
            </div>
            <div className="mt-[14px] text-[13.5px] leading-[1.6] text-ink-500">
              Delete <strong>{deleting.name}</strong>? This can&apos;t be undone. A department
              that still has members assigned can&apos;t be deleted — reassign them first.
            </div>
            {deleteError && <div className="mt-3 text-sm font-medium text-danger">{deleteError}</div>}
            <div className="mt-[22px] flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setDeleting(null)}>
                Cancel
              </Button>
              <Button variant="danger" onClick={onConfirmDelete} disabled={deleteBusy}>
                {deleteBusy ? 'Deleting…' : 'Delete department'}
              </Button>
            </div>
          </div>
        </Overlay>
      )}
    </>
  );
}
