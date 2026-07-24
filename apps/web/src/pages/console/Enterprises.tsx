import * as React from 'react';
import { PauseCircle, Search, ChevronDown } from 'lucide-react';
import { EnterpriseStatus, type EnterpriseDto, type EnterprisesResponse } from '@se/shared';
import { PageHeader } from '@/components/shell/PageHeader';
import { Button } from '@/components/ui/button';
import { Overlay } from '@/components/ui/overlay';
import { apiFetch, ApiError } from '@/lib/api';
import { highlightRingClass, useHighlightRow } from '@/lib/useHighlightRow';

const GRID_COLS = 'grid-cols-[2fr_1.2fr_1fr_1fr_1fr_1.3fr]';

const STATUS_STYLE: Record<EnterpriseDto['status'], { bg: string; fg: string; dot: string }> = {
  [EnterpriseStatus.Active]: { bg: 'rgb(233,246,233)', fg: 'rgb(33,131,88)', dot: 'rgb(70,167,88)' },
  [EnterpriseStatus.Suspended]: { bg: 'rgb(254,235,236)', fg: 'rgb(206,44,49)', dot: 'rgb(229,72,77)' },
};

function initials(name: string) {
  return name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function StatusBadge({ status }: { status: EnterpriseDto['status'] }) {
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

export default function Enterprises() {
  const [rows, setRows] = React.useState<EnterpriseDto[]>([]);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [confirming, setConfirming] = React.useState<EnterpriseDto | null>(null);
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(20);
  const { highlightId, rowRef } = useHighlightRow();
  const [search, setSearch] = React.useState('');
  const [debouncedSearch, setDebouncedSearch] = React.useState('');
  const [status, setStatus] = React.useState('');

  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const load = React.useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (status) params.set('status', status);

      const res = await apiFetch<EnterprisesResponse>(`/enterprises?${params.toString()}`);
      setRows(res.rows);
      setTotal(res.total);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Unable to load enterprises.');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, debouncedSearch, status]);

  React.useEffect(() => {
    load();
  }, [load]);

  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);
  const hasNextPage = page * pageSize < total;

  async function onConfirmSuspend() {
    if (!confirming) return;
    setBusyId(confirming.id);
    try {
      await apiFetch(`/enterprises/${confirming.id}/suspend`, { method: 'POST' });
      setConfirming(null);
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function onReactivate(enterprise: EnterpriseDto) {
    setBusyId(enterprise.id);
    try {
      await apiFetch(`/enterprises/${enterprise.id}/reactivate`, { method: 'POST' });
      await load();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <PageHeader
        title="Enterprises"
        subtitle="All onboarded tenants. Suspend an enterprise to block its users from signing in."
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
            placeholder="Search by name or industry"
            className="min-w-0 flex-1 border-none bg-transparent text-sm text-ink-900 outline-none"
          />
        </div>
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
            <option value={EnterpriseStatus.Active} className="text-ink-900">
              Active
            </option>
            <option value={EnterpriseStatus.Suspended} className="text-ink-900">
              Suspended
            </option>
          </select>
          <ChevronDown size={18} className="pointer-events-none absolute right-3 text-ink-400" />
        </div>
      </div>

      <div className="mt-[22px] overflow-x-auto rounded-lg border border-line-soft bg-surface shadow-card">
        <div
          className={`grid ${GRID_COLS} min-w-[820px] bg-surface-muted px-[22px] py-[13px] text-[11px] font-semibold uppercase tracking-[.4px] text-ink-400`}
        >
          <span>Enterprise</span>
          <span>Industry</span>
          <span>Users</span>
          <span>Onboarded</span>
          <span>Status</span>
          <span className="text-right">Actions</span>
        </div>
        {rows.map((enterprise) => (
          <div
            key={enterprise.id}
            ref={enterprise.id === highlightId ? rowRef : undefined}
            className={`grid ${GRID_COLS} min-w-[820px] items-center border-b border-line-soft px-[22px] py-[15px] last:border-b-0 ${highlightRingClass(enterprise.id, highlightId)}`}
          >
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-[9px] bg-[rgb(236,245,246)] text-[13px] font-bold text-brand">
                {initials(enterprise.name)}
              </div>
              <div className="truncate text-sm font-semibold text-ink-900">{enterprise.name}</div>
            </div>
            <span className="text-[13px] text-ink-700">{enterprise.industry ?? '—'}</span>
            <span className="text-[13px] text-ink-700">{enterprise.users}</span>
            <span className="text-[13px] text-ink-700">
              {new Date(enterprise.since).toLocaleDateString()}
            </span>
            <span>
              <StatusBadge status={enterprise.status} />
            </span>
            <div className="flex justify-end">
              {enterprise.status === EnterpriseStatus.Active ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setConfirming(enterprise)}
                  disabled={busyId === enterprise.id}
                >
                  Suspend
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onReactivate(enterprise)}
                  disabled={busyId === enterprise.id}
                >
                  {busyId === enterprise.id ? 'Reactivating…' : 'Reactivate'}
                </Button>
              )}
            </div>
          </div>
        ))}
        {!loading && loadError && (
          <div className="px-4 py-12 text-center text-sm text-danger">{loadError}</div>
        )}
        {!loading && !loadError && rows.length === 0 && (
          <div className="px-4 py-12 text-center text-sm text-ink-400">No enterprises yet.</div>
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

      {confirming && (
        <Overlay onClose={() => setConfirming(null)}>
          <div className="mx-auto w-full max-w-[440px] rounded-xl bg-surface p-[26px] shadow-xl">
            <div className="flex items-center gap-3">
              <div className="flex h-[42px] w-[42px] flex-none items-center justify-center rounded-[10px] bg-danger/[0.12] text-danger">
                <PauseCircle size={22} />
              </div>
              <div className="text-lg font-bold text-ink-900">Suspend enterprise</div>
            </div>
            <div className="mt-[14px] text-[13.5px] leading-[1.6] text-ink-500">
              Suspending <strong>{confirming.name}</strong> immediately blocks all its users from
              signing in. You can reactivate it at any time.
            </div>
            <div className="mt-[22px] flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setConfirming(null)}>
                Cancel
              </Button>
              <Button variant="danger" onClick={onConfirmSuspend} disabled={busyId === confirming.id}>
                {busyId === confirming.id ? 'Suspending…' : 'Confirm Suspend'}
              </Button>
            </div>
          </div>
        </Overlay>
      )}
    </>
  );
}
