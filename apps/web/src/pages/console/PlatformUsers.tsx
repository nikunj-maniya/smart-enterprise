import * as React from 'react';
import { Search, ChevronDown, KeyRound, Copy, Check } from 'lucide-react';
import {
  userStatus,
  type AdminResetPasswordResponse,
  type EnterpriseDto,
  type EnterprisesResponse,
  type PlatformUserDto,
  type PlatformUsersResponse,
} from '@se/shared';
import { PageHeader } from '@/components/shell/PageHeader';
import { Button } from '@/components/ui/button';
import { Overlay } from '@/components/ui/overlay';
import { apiFetch, ApiError } from '@/lib/api';
import { highlightRingClass, useHighlightRow } from '@/lib/useHighlightRow';

const GRID_COLS = 'grid-cols-[1.6fr_1.4fr_1.1fr_0.9fr_1fr]';

const STATUS_STYLE: Record<PlatformUserDto['status'], { bg: string; fg: string; dot: string }> = {
  Active: { bg: 'rgb(233,246,233)', fg: 'rgb(33,131,88)', dot: 'rgb(70,167,88)' },
  Suspended: { bg: 'rgb(254,235,236)', fg: 'rgb(206,44,49)', dot: 'rgb(229,72,77)' },
  Pending: { bg: 'rgb(255,247,237)', fg: 'rgb(204,78,0)', dot: 'rgb(247,107,21)' },
  Inactive: { bg: 'rgb(241,242,242)', fg: 'var(--ink-500)', dot: 'var(--ink-400)' },
};

function initials(name: string) {
  return name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function StatusBadge({ status }: { status: PlatformUserDto['status'] }) {
  const c = STATUS_STYLE[status];
  return (
    <span
      className="inline-flex items-center gap-[6px] rounded-full px-[10px] py-1 text-xs font-medium"
      style={{ background: c.bg, color: c.fg }}
    >
      <span className="h-[6px] w-[6px] flex-none rounded-full" style={{ background: c.dot }} />
      {status}
    </span>
  );
}

function RoleBadge({ role }: { role: string }) {
  return (
    <span className="inline-flex items-center rounded-full bg-surface-muted px-[10px] py-1 text-xs font-medium text-ink-700">
      {role}
    </span>
  );
}

export default function PlatformUsers() {
  const [rows, setRows] = React.useState<PlatformUserDto[]>([]);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(20);
  const [search, setSearch] = React.useState('');
  const [debouncedSearch, setDebouncedSearch] = React.useState('');
  const [status, setStatus] = React.useState('');
  const [tenantId, setTenantId] = React.useState('');
  const { highlightId, rowRef } = useHighlightRow();
  const [enterprises, setEnterprises] = React.useState<EnterpriseDto[]>([]);
  const [enterprisesError, setEnterprisesError] = React.useState<string | null>(null);
  const [resetting, setResetting] = React.useState<PlatformUserDto | null>(null);
  const [resetResult, setResetResult] = React.useState<{
    user: PlatformUserDto;
    temporaryPassword: string;
  } | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [resetError, setResetError] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    apiFetch<EnterprisesResponse>('/enterprises?pageSize=200')
      .then((res) => setEnterprises(res.rows))
      .catch((err) =>
        setEnterprisesError(err instanceof ApiError ? err.message : 'Unable to load enterprises.'),
      );
  }, []);

  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  React.useEffect(() => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (debouncedSearch) params.set('search', debouncedSearch);
    if (status) params.set('status', status);
    if (tenantId) params.set('tenantId', tenantId);

    setLoading(true);
    setLoadError(null);
    apiFetch<PlatformUsersResponse>(`/users?${params.toString()}`)
      .then((res) => {
        setRows(res.rows);
        setTotal(res.total);
      })
      .catch((err) => {
        setLoadError(err instanceof ApiError ? err.message : 'Unable to load users.');
      })
      .finally(() => setLoading(false));
  }, [page, pageSize, debouncedSearch, status, tenantId]);

  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);
  const hasNextPage = page * pageSize < total;

  function openReset(user: PlatformUserDto) {
    setResetting(user);
    setResetError(null);
  }

  async function onConfirmReset() {
    if (!resetting) return;
    setBusyId(resetting.id);
    setResetError(null);
    try {
      const res = await apiFetch<AdminResetPasswordResponse>(
        `/users/${resetting.id}/reset-password`,
        { method: 'POST' },
      );
      setResetResult({ user: resetting, temporaryPassword: res.temporaryPassword });
      setResetting(null);
    } catch (err) {
      setResetError(err instanceof ApiError ? err.message : 'Unable to reset the password.');
    } finally {
      setBusyId(null);
    }
  }

  async function onCopyTemporaryPassword() {
    if (!resetResult) return;
    await navigator.clipboard.writeText(resetResult.temporaryPassword);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <>
      <PageHeader
        title="Platform Users"
        subtitle="Notable accounts across all enterprises. Enterprise Admins manage their own user directories."
      />

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
            placeholder="Search by name or email"
            className="min-w-0 flex-1 border-none bg-transparent text-sm text-ink-900 outline-none"
          />
        </div>
        <div className="relative flex items-center">
          <select
            value={tenantId}
            onChange={(e) => {
              setTenantId(e.target.value);
              setPage(1);
            }}
            className={`h-11 w-[220px] appearance-none rounded-sm border border-line bg-surface py-0 pl-3 pr-9 text-sm outline-none ${
              tenantId ? 'text-ink-900' : 'text-ink-300'
            }`}
          >
            <option value="">All Enterprises</option>
            {enterprises.map((e) => (
              <option key={e.id} value={e.id} className="text-ink-900">
                {e.name}
              </option>
            ))}
          </select>
          <ChevronDown size={18} className="pointer-events-none absolute right-3 text-ink-400" />
        </div>
        {enterprisesError && <span className="text-xs text-danger">{enterprisesError}</span>}
        <div className="relative flex items-center">
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            className={`h-11 w-[180px] appearance-none rounded-sm border border-line bg-surface py-0 pl-3 pr-9 text-sm outline-none ${
              status ? 'text-ink-900' : 'text-ink-300'
            }`}
          >
            <option value="">All Statuses</option>
            {userStatus.options.map((s) => (
              <option key={s} value={s} className="text-ink-900">
                {s}
              </option>
            ))}
          </select>
          <ChevronDown size={18} className="pointer-events-none absolute right-3 text-ink-400" />
        </div>
      </div>

      <div className="mt-[22px] overflow-x-auto rounded-lg border border-line-soft bg-surface shadow-card">
        <div
          className={`grid ${GRID_COLS} min-w-[720px] bg-surface-muted px-[22px] py-[13px] text-[11px] font-semibold uppercase tracking-[.4px] text-ink-400`}
        >
          <span>User</span>
          <span>Enterprise</span>
          <span>Role</span>
          <span>Status</span>
          <span className="text-right">Actions</span>
        </div>
        {rows.map((user) => (
          <div
            key={user.id}
            ref={user.id === highlightId ? rowRef : undefined}
            className={`grid ${GRID_COLS} min-w-[720px] items-center border-b border-line-soft px-[22px] py-[15px] last:border-b-0 ${highlightRingClass(user.id, highlightId)}`}
          >
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-8 w-8 flex-none items-center justify-center rounded-[9px] bg-[rgb(236,245,246)] text-[13px] font-bold text-brand">
                {initials(user.name)}
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-ink-900">{user.name}</div>
                <div className="truncate text-xs text-ink-400">{user.email}</div>
              </div>
            </div>
            <span className="truncate text-[13px] text-ink-700">{user.enterpriseName}</span>
            <span>
              <RoleBadge role={user.role} />
            </span>
            <span>
              <StatusBadge status={user.status} />
            </span>
            <div className="flex justify-end">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => openReset(user)}
                disabled={busyId === user.id}
              >
                <KeyRound size={14} />
                Reset Password
              </Button>
            </div>
          </div>
        ))}
        {!loading && loadError && (
          <div className="px-4 py-12 text-center text-sm text-danger">{loadError}</div>
        )}
        {!loading && !loadError && rows.length === 0 && (
          <div className="px-4 py-12 text-center text-sm text-ink-400">
            No users match your filters.
          </div>
        )}
        {loading && <div className="px-4 py-12 text-center text-sm text-ink-400">Loading…</div>}
      </div>

      <div className="mt-[18px] flex items-center justify-between">
        <div className="flex items-center gap-4">
          <span className="text-[13px] text-ink-400">
            Showing {rangeStart}–{rangeEnd} of {total}
          </span>
          <div className="flex items-center gap-2">
            <span className="text-[13px] text-ink-400">Rows per page</span>
            <div className="relative flex items-center">
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
                className="h-8 appearance-none rounded-sm border border-line bg-surface py-0 pl-2 pr-7 text-[13px] text-ink-900 outline-none"
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
              <ChevronDown size={14} className="pointer-events-none absolute right-2 text-ink-400" />
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => p - 1)}
            disabled={page === 1}
          >
            Prev
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => p + 1)}
            disabled={!hasNextPage}
          >
            Next
          </Button>
        </div>
      </div>

      {resetting && (
        <Overlay onClose={() => setResetting(null)}>
          <div className="mx-auto w-full max-w-[440px] rounded-xl bg-surface p-[26px] shadow-xl">
            <div className="flex items-center gap-3">
              <div className="flex h-[42px] w-[42px] flex-none items-center justify-center rounded-[10px] bg-[rgba(236,245,246,1)] text-brand">
                <KeyRound size={22} />
              </div>
              <div className="text-lg font-bold text-ink-900">Reset password</div>
            </div>
            <div className="mt-[14px] text-[13.5px] leading-[1.6] text-ink-500">
              This issues a new temporary password for <strong>{resetting.name}</strong> and
              signs them out of any existing session. They&apos;ll be required to change it on
              next login.
            </div>
            {resetError && <div className="mt-3 text-sm font-medium text-danger">{resetError}</div>}
            <div className="mt-[22px] flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setResetting(null)}>
                Cancel
              </Button>
              <Button onClick={onConfirmReset} disabled={busyId === resetting.id}>
                {busyId === resetting.id ? 'Resetting…' : 'Reset Password'}
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
        >
          <div className="mx-auto w-full max-w-[440px] rounded-xl bg-surface p-[26px] shadow-xl">
            <div className="flex items-center gap-3">
              <div className="flex h-[42px] w-[42px] flex-none items-center justify-center rounded-[10px] bg-[rgba(236,245,246,1)] text-brand">
                <KeyRound size={22} />
              </div>
              <div className="text-lg font-bold text-ink-900">Password reset</div>
            </div>
            <div className="mt-[14px] text-[13.5px] leading-[1.6] text-ink-500">
              Share this temporary password with <strong>{resetResult.user.name}</strong> through
              a secure channel — it won&apos;t be shown again.
            </div>
            <div className="mt-[18px] flex items-center justify-between gap-3 rounded-sm border border-line bg-app-bg px-[15px] py-[13px]">
              <span className="truncate font-mono text-[15px] font-semibold text-ink-900">
                {resetResult.temporaryPassword}
              </span>
              <Button variant="secondary" size="sm" onClick={onCopyTemporaryPassword}>
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
