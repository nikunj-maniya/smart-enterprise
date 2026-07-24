import * as React from 'react';
import { Search, ChevronDown, Plus, PencilLine, Check, Trash2 } from 'lucide-react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  SystemRoleKey,
  type CreateProjectRequest,
  type OrgUserPickerDto,
  type OrgUserRef,
  type ProjectDto,
  type ProjectsResponse,
} from '@se/shared';
import { PageHeader } from '@/components/shell/PageHeader';
import { Button } from '@/components/ui/button';
import { Overlay } from '@/components/ui/overlay';
import { apiFetch, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { highlightRingClass, useHighlightRow } from '@/lib/useHighlightRow';

type StatusFilter = '' | 'active' | 'archived';

const FILTERS: { value: StatusFilter; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'archived', label: 'Archived' },
];

const STATUS_STYLE: Record<ProjectDto['status'], { label: string; bg: string; fg: string; dot: string }> = {
  active: { label: 'Active', bg: 'rgb(233,246,233)', fg: 'rgb(33,131,88)', dot: 'rgb(70,167,88)' },
  archived: { label: 'Archived', bg: 'rgb(241,242,242)', fg: 'var(--ink-500)', dot: 'var(--ink-400)' },
};

/** Ensures the currently-assigned person stays selectable even if they no longer hold the role. */
function mergeCurrent(
  options: OrgUserPickerDto[],
  current: OrgUserRef | null | undefined,
): OrgUserPickerDto[] {
  if (!current || options.some((o) => o.id === current.id)) return options;
  return [{ id: current.id, name: current.name }, ...options];
}

/** Inline, colored status pill that doubles as a dropdown to change the project's status. */
function StatusSelect({
  value,
  busy,
  onChange,
}: {
  value: ProjectDto['status'];
  busy: boolean;
  onChange: (s: ProjectDto['status']) => void;
}) {
  const c = STATUS_STYLE[value];
  return (
    <div
      className="relative inline-flex items-center gap-[6px] rounded-full py-1 pl-[10px] pr-[22px] text-xs font-medium"
      style={{ background: c.bg, color: c.fg, opacity: busy ? 0.6 : 1 }}
    >
      <span className="h-[6px] w-[6px] flex-none rounded-full" style={{ background: c.dot }} />
      <select
        value={value}
        disabled={busy}
        onChange={(e) => onChange(e.target.value as ProjectDto['status'])}
        aria-label="Project status"
        className="cursor-pointer appearance-none bg-transparent text-xs font-medium outline-none"
        style={{ color: c.fg }}
      >
        <option value="active" className="text-ink-900">
          Active
        </option>
        <option value="archived" className="text-ink-900">
          Archived
        </option>
      </select>
      <ChevronDown
        size={12}
        className="pointer-events-none absolute right-[7px]"
        style={{ color: c.fg }}
      />
    </div>
  );
}

function UserSelect({
  label,
  value,
  users,
  onChange,
}: {
  label: string;
  value: string;
  users: OrgUserPickerDto[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-sm font-semibold text-ink-900">{label}</span>
      <div className="relative flex items-center">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`h-11 w-full appearance-none rounded-sm border border-line bg-surface py-0 pl-3 pr-9 text-sm outline-none ${
            value ? 'text-ink-900' : 'text-ink-300'
          }`}
        >
          <option value="">None</option>
          {users.map((u) => (
            <option key={u.id} value={u.id} className="text-ink-900">
              {u.name}
            </option>
          ))}
        </select>
        <ChevronDown size={18} className="pointer-events-none absolute right-3 text-ink-400" />
      </div>
    </label>
  );
}

function ProjectModal({
  project,
  pmOptions,
  tlOptions,
  allUsers,
  onClose,
  onSaved,
}: {
  project: ProjectDto | null;
  pmOptions: OrgUserPickerDto[];
  tlOptions: OrgUserPickerDto[];
  allUsers: OrgUserPickerDto[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = React.useState(project?.name ?? '');
  const [status, setStatus] = React.useState<ProjectDto['status']>(project?.status ?? 'active');
  const [pmUserId, setPmUserId] = React.useState(project?.pm?.id ?? '');
  const [techLeadUserId, setTechLeadUserId] = React.useState(project?.techLead?.id ?? '');
  const [memberIds, setMemberIds] = React.useState<Set<string>>(
    new Set(project?.members.map((m) => m.id) ?? []),
  );
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  // Only role-holders are eligible for PM / Tech Lead. Keep the current holder in the list
  // even if their role was later removed, so editing doesn't silently drop the assignment.
  const pmChoices = mergeCurrent(pmOptions, project?.pm);
  const tlChoices = mergeCurrent(tlOptions, project?.techLead);

  // A person can hold only one slot per project; hide the chosen PM/TL from the member list.
  const memberOptions = allUsers.filter((u) => u.id !== pmUserId && u.id !== techLeadUserId);

  function toggleMember(id: string) {
    setMemberIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function onSave() {
    setError(null);
    if (!name.trim()) return setError('Project name is required.');
    if (pmUserId && pmUserId === techLeadUserId) {
      return setError('The PM and Tech Lead must be different people.');
    }
    setBusy(true);
    try {
      const body: CreateProjectRequest = {
        name,
        status,
        pmUserId: pmUserId || null,
        techLeadUserId: techLeadUserId || null,
        memberIds: [...memberIds].filter((id) => id !== pmUserId && id !== techLeadUserId),
      };
      if (project) {
        await apiFetch(`/projects/${project.id}`, { method: 'PUT', body: JSON.stringify(body) });
      } else {
        await apiFetch('/projects', { method: 'POST', body: JSON.stringify(body) });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to save the project.');
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
          <div className="text-lg font-bold text-ink-900">
            {project ? 'Edit project' : 'New project'}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-[26px] py-5">
          <div className="grid grid-cols-2 gap-4">
            <label className="flex flex-col gap-2">
              <span className="text-sm font-semibold text-ink-900">Project name</span>
              <div className="flex h-11 items-center rounded-sm border border-line bg-surface px-3">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Apollo Platform"
                  className="min-w-0 flex-1 border-none bg-transparent text-sm text-ink-900 outline-none"
                />
              </div>
            </label>
            <label className="flex flex-col gap-2">
              <span className="text-sm font-semibold text-ink-900">Status</span>
              <div className="relative flex items-center">
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as ProjectDto['status'])}
                  className="h-11 w-full appearance-none rounded-sm border border-line bg-surface py-0 pl-3 pr-9 text-sm text-ink-900 outline-none"
                >
                  <option value="active">Active</option>
                  <option value="archived">Archived</option>
                </select>
                <ChevronDown size={18} className="pointer-events-none absolute right-3 text-ink-400" />
              </div>
            </label>
            <UserSelect
              label="Project Manager"
              value={pmUserId}
              users={pmChoices}
              onChange={setPmUserId}
            />
            <UserSelect
              label="Tech Lead"
              value={techLeadUserId}
              users={tlChoices}
              onChange={setTechLeadUserId}
            />
          </div>

          <div className="mt-4 flex flex-col gap-2">
            <span className="text-sm font-semibold text-ink-900">Members</span>
            {memberOptions.length === 0 ? (
              <div className="rounded-sm border border-dashed border-line bg-app-bg px-3 py-4 text-center text-[13px] text-ink-400">
                No other users to add. Create users first.
              </div>
            ) : (
              <div className="max-h-[180px] overflow-y-auto rounded-sm border border-line">
                {memberOptions.map((u) => {
                  const checked = memberIds.has(u.id);
                  return (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => toggleMember(u.id)}
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

export default function Projects() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [page, setPage] = React.useState(1);
  const [pageSize] = React.useState(20);
  const [search, setSearch] = React.useState('');
  const [debouncedSearch, setDebouncedSearch] = React.useState('');
  const [status, setStatus] = React.useState<StatusFilter>('');
  const [editing, setEditing] = React.useState<ProjectDto | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [statusBusyId, setStatusBusyId] = React.useState<string | null>(null);
  const [deleting, setDeleting] = React.useState<ProjectDto | null>(null);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);
  const { highlightId, rowRef } = useHighlightRow();
  const [deleteBusy, setDeleteBusy] = React.useState(false);

  // Members can be anyone; PM/Tech Lead are limited to holders of the matching system role.
  const { data: allUsers = [] } = useQuery({
    queryKey: ['org-users-options'],
    queryFn: () => apiFetch<OrgUserPickerDto[]>('/org-users/options'),
  });
  const { data: pmOptions = [] } = useQuery({
    queryKey: ['org-users-options', 'pm'],
    queryFn: () =>
      apiFetch<OrgUserPickerDto[]>(`/org-users/options?role=${SystemRoleKey.ProjectManager}`),
  });
  const { data: tlOptions = [] } = useQuery({
    queryKey: ['org-users-options', 'tl'],
    queryFn: () =>
      apiFetch<OrgUserPickerDto[]>(`/org-users/options?role=${SystemRoleKey.TechLead}`),
  });

  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const { data: projectsData, isFetching: loading } = useQuery({
    queryKey: ['projects', { page, pageSize, search: debouncedSearch, status }],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (status) params.set('status', status);
      return apiFetch<ProjectsResponse>(`/projects?${params.toString()}`);
    },
    placeholderData: keepPreviousData,
  });
  const rows = projectsData?.rows ?? [];
  const total = projectsData?.total ?? 0;

  function invalidateProjects() {
    queryClient.invalidateQueries({ queryKey: ['projects'] });
  }

  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);
  const hasNextPage = page * pageSize < total;

  function onSaved() {
    setEditing(null);
    setCreating(false);
    invalidateProjects();
  }

  async function onConfirmDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await apiFetch(`/projects/${deleting.id}`, { method: 'DELETE' });
      setDeleting(null);
      invalidateProjects();
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : 'Unable to delete the project.');
    } finally {
      setDeleteBusy(false);
    }
  }

  // Inline status change from the table — reuses the update endpoint, keeping assignments intact.
  async function onChangeStatus(p: ProjectDto, next: ProjectDto['status']) {
    if (next === p.status) return;
    setStatusBusyId(p.id);
    try {
      await apiFetch(`/projects/${p.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: p.name,
          status: next,
          pmUserId: p.pm?.id ?? null,
          techLeadUserId: p.techLead?.id ?? null,
          memberIds: p.members.map((m) => m.id),
        } satisfies CreateProjectRequest),
      });
      invalidateProjects();
    } finally {
      setStatusBusyId(null);
    }
  }

  const GRID = 'grid-cols-[1.6fr_1.4fr_1.4fr_0.8fr_1fr_0.8fr]';

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader
          title="Projects"
          subtitle="Each project has a PM and Tech Lead — these populate approver dropdowns on Leave & WFH requests."
          breadcrumb={`Organization · ${user?.tenantName ?? ''}`}
        />
        <Button size="lg" onClick={() => setCreating(true)}>
          <Plus size={18} />
          New Project
        </Button>
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
            placeholder="Search projects…"
            className="min-w-0 flex-1 border-none bg-transparent text-sm text-ink-900 outline-none"
          />
        </div>
        <div className="flex gap-[6px]">
          {FILTERS.map((f) => (
            <button
              key={f.label}
              onClick={() => {
                setStatus(f.value);
                setPage(1);
              }}
              className={`rounded-lg border px-[13px] py-[7px] text-[12.5px] font-semibold transition-colors ${
                status === f.value
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
          className={`grid ${GRID} min-w-[820px] bg-surface-muted px-[22px] py-[13px] text-[11px] font-semibold uppercase tracking-[.4px] text-ink-400`}
        >
          <span>Project</span>
          <span>Project Manager</span>
          <span>Tech Lead</span>
          <span>Members</span>
          <span>Status</span>
          <span className="text-right">Actions</span>
        </div>
        {rows.map((p) => (
          <div
            key={p.id}
            ref={p.id === highlightId ? rowRef : undefined}
            className={`grid ${GRID} min-w-[820px] items-center border-b border-line-soft px-[22px] py-[15px] last:border-b-0 ${highlightRingClass(p.id, highlightId)}`}
          >
            <span className="pr-3 text-sm font-semibold text-ink-900">{p.name}</span>
            <span className="pr-3 text-[13px] text-ink-700">{p.pm?.name ?? '—'}</span>
            <span className="pr-3 text-[13px] text-ink-700">{p.techLead?.name ?? '—'}</span>
            <span className="text-[13px] text-ink-700">{p.memberCount}</span>
            <span>
              <StatusSelect
                value={p.status}
                busy={statusBusyId === p.id}
                onChange={(next) => onChangeStatus(p, next)}
              />
            </span>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => setEditing(p)}>
                <PencilLine size={14} />
                Edit
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setDeleting(p);
                  setDeleteError(null);
                }}
                aria-label={`Delete ${p.name}`}
              >
                <Trash2 size={14} className="text-danger" />
              </Button>
            </div>
          </div>
        ))}
        {!loading && rows.length === 0 && (
          <div className="px-4 py-12 text-center text-sm text-ink-400">
            No projects match your search.
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
        <ProjectModal
          project={editing}
          pmOptions={pmOptions}
          tlOptions={tlOptions}
          allUsers={allUsers}
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
              <div className="text-lg font-bold text-ink-900">Delete project</div>
            </div>
            <div className="mt-[14px] text-[13.5px] leading-[1.6] text-ink-500">
              Delete <strong>{deleting.name}</strong>? This can&apos;t be undone. A project that
              still has an assigned PM, Tech Lead, or members can&apos;t be deleted — clear them
              first, or archive it instead.
            </div>
            {deleteError && <div className="mt-3 text-sm font-medium text-danger">{deleteError}</div>}
            <div className="mt-[22px] flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setDeleting(null)}>
                Cancel
              </Button>
              <Button variant="danger" onClick={onConfirmDelete} disabled={deleteBusy}>
                {deleteBusy ? 'Deleting…' : 'Delete project'}
              </Button>
            </div>
          </div>
        </Overlay>
      )}
    </>
  );
}
