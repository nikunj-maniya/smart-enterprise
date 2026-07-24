import * as React from 'react';
import { Check, XCircle, Info, Search, ChevronDown } from 'lucide-react';
import {
  RegistrationStatus,
  type EnterpriseRegistrationDto,
  type RegistrationsResponse,
} from '@se/shared';
import { PageHeader } from '@/components/shell/PageHeader';
import { Button } from '@/components/ui/button';
import { Overlay } from '@/components/ui/overlay';
import { apiFetch, ApiError } from '@/lib/api';
import { useRegistrationsCount } from '@/lib/registrationsCount';
import { highlightRingClass, useHighlightRow } from '@/lib/useHighlightRow';

const GRID_COLS = 'grid-cols-[1.7fr_1.9fr_0.8fr_0.9fr_1fr_1.5fr]';

const STATUS_STYLE: Record<
  EnterpriseRegistrationDto['status'],
  { bg: string; fg: string; dot: string }
> = {
  [RegistrationStatus.Pending]: { bg: 'rgb(255,247,237)', fg: 'rgb(204,78,0)', dot: 'rgb(247,107,21)' },
  [RegistrationStatus.Accepted]: { bg: 'rgb(233,246,233)', fg: 'rgb(33,131,88)', dot: 'rgb(70,167,88)' },
  [RegistrationStatus.Rejected]: { bg: 'rgb(254,235,236)', fg: 'rgb(206,44,49)', dot: 'rgb(229,72,77)' },
};

function initials(name: string) {
  return name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function StatusBadge({ status }: { status: EnterpriseRegistrationDto['status'] }) {
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

function Avatar({ name, size }: { name: string; size: number }) {
  return (
    <div
      className="flex flex-none items-center justify-center rounded-[9px] bg-[rgb(236,245,246)] font-bold text-brand"
      style={{ width: size, height: size, fontSize: size === 48 ? 16 : 13 }}
    >
      {initials(name)}
    </div>
  );
}

export default function Registrations() {
  const { highlightId, rowRef } = useHighlightRow();
  // A search deep-link may point at an already-reviewed registration — default to "All" so its
  // row is actually in the list rather than silently filtered out by the default Pending tab.
  const [tab, setTab] = React.useState<typeof RegistrationStatus.Pending | 'All'>(
    highlightId ? 'All' : RegistrationStatus.Pending,
  );
  const [rows, setRows] = React.useState<EnterpriseRegistrationDto[]>([]);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [reviewing, setReviewing] = React.useState<EnterpriseRegistrationDto | null>(null);
  const [rejecting, setRejecting] = React.useState<EnterpriseRegistrationDto | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [reason, setReason] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(20);
  const [search, setSearch] = React.useState('');
  const [debouncedSearch, setDebouncedSearch] = React.useState('');
  const { pendingCount, refresh: refreshSidebarCount } = useRegistrationsCount();

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
      if (tab !== 'All') params.set('status', tab);

      const res = await apiFetch<RegistrationsResponse>(`/registrations?${params.toString()}`);
      setRows(res.rows);
      setTotal(res.total);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Unable to load registrations.');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, debouncedSearch, tab]);

  React.useEffect(() => {
    load();
  }, [load]);

  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);
  const hasNextPage = page * pageSize < total;

  function openReject(reg: EnterpriseRegistrationDto) {
    setRejecting(reg);
    setReason('');
    setError(null);
  }

  async function onAccept(reg: EnterpriseRegistrationDto) {
    setBusyId(reg.id);
    setError(null);
    try {
      await apiFetch(`/registrations/${reg.id}/accept`, { method: 'POST' });
      setReviewing(null);
      load();
      refreshSidebarCount();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to accept registration.');
    } finally {
      setBusyId(null);
    }
  }

  async function onReject() {
    if (!rejecting) return;
    if (!reason.trim()) {
      setError('A reason is required.');
      return;
    }
    setBusyId(rejecting.id);
    setError(null);
    try {
      await apiFetch(`/registrations/${rejecting.id}/reject`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      });
      setRejecting(null);
      setReviewing(null);
      load();
      refreshSidebarCount();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to reject registration.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <PageHeader
        title="Enterprise Registrations"
        subtitle="Review incoming enterprise sign-ups. Accepting activates the pre-created Enterprise Admin account; rejecting captures a reason."
      />

      <div className="mt-[22px] flex w-fit gap-2 rounded-md border border-line-soft bg-surface p-[5px]">
        <button
          onClick={() => {
            setTab(RegistrationStatus.Pending);
            setPage(1);
          }}
          className={`rounded-[7px] px-4 py-2 text-[13px] font-semibold transition-colors ${
            tab === RegistrationStatus.Pending ? 'bg-brand text-white' : 'bg-transparent text-ink-500'
          }`}
        >
          Pending · {pendingCount}
        </button>
        <button
          onClick={() => {
            setTab('All');
            setPage(1);
          }}
          className={`rounded-[7px] px-4 py-2 text-[13px] font-semibold transition-colors ${
            tab === 'All' ? 'bg-brand text-white' : 'bg-transparent text-ink-500'
          }`}
        >
          All registrations
        </button>
      </div>

      <div className="mt-[18px] flex flex-wrap items-center gap-3">
        <div className="flex h-11 w-[280px] items-center gap-2 rounded-sm border border-line bg-surface px-3">
          <Search size={16} className="flex-none text-ink-300" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search by company, contact, or email"
            className="min-w-0 flex-1 border-none bg-transparent text-sm text-ink-900 outline-none"
          />
        </div>
      </div>

      <div className="mt-[18px] overflow-x-auto rounded-lg border border-line-soft bg-surface shadow-card">
        <div
          className={`grid ${GRID_COLS} min-w-[860px] bg-surface-muted px-[22px] py-[13px] text-[11px] font-semibold uppercase tracking-[.4px] text-ink-400`}
        >
          <span>Enterprise</span>
          <span>Admin Contact</span>
          <span>Size</span>
          <span>Submitted</span>
          <span>Status</span>
          <span className="text-right">Actions</span>
        </div>
        {rows.map((reg) => (
          <div
            key={reg.id}
            ref={reg.id === highlightId ? rowRef : undefined}
            onClick={() => setReviewing(reg)}
            className={`grid ${GRID_COLS} min-w-[860px] cursor-pointer items-center border-b border-line-soft px-[22px] py-[15px] last:border-b-0 hover:bg-surface-muted ${highlightRingClass(reg.id, highlightId)}`}
          >
            <div className="flex min-w-0 items-center gap-3">
              <Avatar name={reg.companyName} size={38} />
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-ink-900">
                  {reg.companyName}
                </div>
                <div className="text-xs text-ink-400">{reg.industry ?? '—'}</div>
              </div>
            </div>
            <div className="min-w-0">
              <div className="truncate text-[13px] text-ink-700">{reg.contactName}</div>
              <div className="truncate text-xs text-ink-400">{reg.contactEmail}</div>
            </div>
            <span className="text-[13px] text-ink-700">{reg.size ?? '—'}</span>
            <span className="text-[13px] text-ink-700">
              {new Date(reg.createdAt).toLocaleDateString()}
            </span>
            <span>
              <StatusBadge status={reg.status} />
            </span>
            <div className="flex justify-end gap-2" onClick={(e) => e.stopPropagation()}>
              {reg.status === RegistrationStatus.Pending ? (
                <>
                  <Button size="sm" onClick={() => onAccept(reg)} disabled={busyId === reg.id}>
                    <Check size={16} />
                    {busyId === reg.id ? 'Accepting…' : 'Accept'}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => openReject(reg)}
                    disabled={busyId === reg.id}
                  >
                    Reject
                  </Button>
                </>
              ) : (
                <Button variant="ghost" size="sm" onClick={() => setReviewing(reg)}>
                  View
                </Button>
              )}
            </div>
          </div>
        ))}
        {!loading && loadError && (
          <div className="px-4 py-12 text-center text-sm text-danger">{loadError}</div>
        )}
        {!loading && !loadError && rows.length === 0 && (
          <div className="px-4 py-12 text-center text-sm text-ink-400">
            No registrations in this view.
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

      {reviewing && (
        <Overlay onClose={() => setReviewing(null)} z={50}>
          <div className="mx-auto w-full max-w-[540px] overflow-hidden rounded-xl bg-surface shadow-xl">
            <div className="flex items-center gap-[14px] border-b border-line-soft px-[26px] py-6">
              <Avatar name={reviewing.companyName} size={48} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-lg font-bold text-ink-900">
                  {reviewing.companyName}
                </div>
                <div className="text-[13px] text-ink-400">
                  {reviewing.industry ?? '—'} · {reviewing.size ?? '—'} employees
                </div>
              </div>
              <StatusBadge status={reviewing.status} />
            </div>
            <div className="px-[26px] py-6">
              <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold uppercase tracking-[.4px] text-ink-400">
                    Admin Contact
                  </div>
                  <div className="mt-1 break-words text-sm font-semibold text-ink-900">
                    {reviewing.contactName}
                  </div>
                </div>
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold uppercase tracking-[.4px] text-ink-400">
                    Admin Email (username)
                  </div>
                  <div className="mt-1 break-words text-sm font-semibold text-brand-hover">
                    {reviewing.contactEmail}
                  </div>
                </div>
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold uppercase tracking-[.4px] text-ink-400">
                    Submitted
                  </div>
                  <div className="mt-1 text-sm font-semibold text-ink-900">
                    {new Date(reviewing.createdAt).toLocaleDateString()}
                  </div>
                </div>
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold uppercase tracking-[.4px] text-ink-400">
                    Company Size
                  </div>
                  <div className="mt-1 break-words text-sm font-semibold text-ink-900">
                    {reviewing.size ?? '—'}
                  </div>
                </div>
                {reviewing.status === RegistrationStatus.Rejected && reviewing.reviewNote && (
                  <div className="col-span-2 min-w-0">
                    <div className="text-[11px] font-semibold uppercase tracking-[.4px] text-ink-400">
                      Rejection Reason
                    </div>
                    <div className="mt-1 break-words text-sm font-semibold text-danger">
                      {reviewing.reviewNote}
                    </div>
                  </div>
                )}
              </div>
              <div className="mt-5 flex items-start gap-[11px] rounded-[10px] bg-app-bg p-[14px_16px]">
                <Info size={18} className="flex-none text-brand" />
                <span className="text-[12.5px] leading-[1.55] text-ink-500">
                  On <strong>Accept</strong>, the enterprise becomes Active and the pre-created
                  Enterprise Admin account is activated — they sign in with the password set at
                  registration. No invite email is sent.
                </span>
              </div>
              {error && <div className="mt-3 text-sm font-medium text-danger">{error}</div>}
            </div>
            {reviewing.status === RegistrationStatus.Pending ? (
              <div className="flex justify-end gap-3 border-t border-line-soft px-[26px] py-[18px]">
                <Button variant="secondary" onClick={() => openReject(reviewing)}>
                  Reject
                </Button>
                <Button onClick={() => onAccept(reviewing)} disabled={busyId === reviewing.id}>
                  <Check size={18} />
                  {busyId === reviewing.id ? 'Accepting…' : 'Accept & Activate'}
                </Button>
              </div>
            ) : (
              <div className="flex justify-end border-t border-line-soft px-[26px] py-[18px]">
                <Button variant="secondary" onClick={() => setReviewing(null)}>
                  Close
                </Button>
              </div>
            )}
          </div>
        </Overlay>
      )}

      {rejecting && (
        <Overlay onClose={() => setRejecting(null)} z={60}>
          <div className="mx-auto w-full max-w-[440px] rounded-xl bg-surface p-[26px] shadow-xl">
            <div className="flex items-center gap-3">
              <div className="flex h-[42px] w-[42px] flex-none items-center justify-center rounded-[10px] bg-danger/[0.12] text-danger">
                <XCircle size={22} />
              </div>
              <div className="text-lg font-bold text-ink-900">Reject registration</div>
            </div>
            <div className="mt-[14px] text-[13.5px] leading-[1.6] text-ink-500">
              Rejecting <strong>{rejecting.companyName}</strong> keeps the account inactive.
              Capture a reason for the audit log.
            </div>
            <label className="mt-[18px] flex flex-col gap-2">
              <span className="text-sm font-semibold text-ink-900">Reason for rejection</span>
              <div className="flex h-11 items-center rounded-sm border border-line bg-surface px-3">
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="min-w-0 flex-1 border-none bg-transparent text-sm text-ink-900 outline-none"
                  placeholder="e.g. Incomplete company details"
                />
              </div>
            </label>
            {error && <div className="mt-3 text-sm font-medium text-danger">{error}</div>}
            <div className="mt-[22px] flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setRejecting(null)}>
                Cancel
              </Button>
              <Button variant="danger" onClick={onReject} disabled={busyId === rejecting.id}>
                {busyId === rejecting.id ? 'Rejecting…' : 'Confirm Rejection'}
              </Button>
            </div>
          </div>
        </Overlay>
      )}
    </>
  );
}
