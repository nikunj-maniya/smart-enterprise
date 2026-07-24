import * as React from 'react';
import {
  Search,
  ChevronDown,
  Clock,
  CheckCircle,
  XCircle,
  PauseCircle,
  PlayCircle,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { AuditAction, type AuditLogEntry, type AuditLogResponse } from '@se/shared';
import { PageHeader } from '@/components/shell/PageHeader';
import { Button } from '@/components/ui/button';
import { apiFetch, ApiError } from '@/lib/api';
import { formatRelativeTime } from '@/lib/formatRelativeTime';

const ACTIVITY_STYLE: Record<string, { label: string; icon: LucideIcon }> = {
  [AuditAction.Accept]: { label: 'Accepted registration', icon: CheckCircle },
  [AuditAction.Reject]: { label: 'Rejected registration', icon: XCircle },
  [AuditAction.Suspend]: { label: 'Suspended enterprise', icon: PauseCircle },
  [AuditAction.Reactivate]: { label: 'Reactivated enterprise', icon: PlayCircle },
};

const ACTION_FILTER_OPTIONS: { value: AuditAction; label: string }[] = [
  { value: AuditAction.Accept, label: 'Accepted' },
  { value: AuditAction.Reject, label: 'Rejected' },
  { value: AuditAction.Suspend, label: 'Suspended' },
  { value: AuditAction.Reactivate, label: 'Reactivated' },
];

function detailEntries(value: unknown): [string, unknown][] {
  return value && typeof value === 'object' ? Object.entries(value as Record<string, unknown>) : [];
}

export default function AuditLog() {
  const [rows, setRows] = React.useState<AuditLogEntry[]>([]);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(20);
  const [search, setSearch] = React.useState('');
  const [debouncedSearch, setDebouncedSearch] = React.useState('');
  const [action, setAction] = React.useState('');
  const [expandedId, setExpandedId] = React.useState<string | null>(null);

  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  React.useEffect(() => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (debouncedSearch) params.set('search', debouncedSearch);
    if (action) params.set('action', action);

    setLoading(true);
    setLoadError(null);
    apiFetch<AuditLogResponse>(`/audit-log?${params.toString()}`)
      .then((res) => {
        setRows(res.rows);
        setTotal(res.total);
      })
      .catch((err) => {
        setLoadError(err instanceof ApiError ? err.message : 'Unable to load audit log.');
      })
      .finally(() => setLoading(false));
  }, [page, pageSize, debouncedSearch, action]);

  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);
  const hasNextPage = page * pageSize < total;

  return (
    <>
      <PageHeader
        title="Audit Log"
        subtitle="Immutable record of platform actions. Every accept, reject, and status change is captured."
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
            placeholder="Search by entity or tenant"
            className="min-w-0 flex-1 border-none bg-transparent text-sm text-ink-900 outline-none"
          />
        </div>
        <div className="relative flex items-center">
          <select
            value={action}
            onChange={(e) => {
              setAction(e.target.value);
              setPage(1);
            }}
            className={`h-11 w-[180px] appearance-none rounded-sm border border-line bg-surface py-0 pl-3 pr-9 text-sm outline-none ${
              action ? 'text-ink-900' : 'text-ink-300'
            }`}
          >
            <option value="">All Actions</option>
            {ACTION_FILTER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value} className="text-ink-900">
                {o.label}
              </option>
            ))}
          </select>
          <ChevronDown size={18} className="pointer-events-none absolute right-3 text-ink-400" />
        </div>
      </div>

      <div className="mt-[22px] overflow-x-auto rounded-lg border border-line-soft bg-surface shadow-card">
        {rows.map((row) => {
          const style = ACTIVITY_STYLE[row.action] ?? { label: row.action, icon: Clock };
          const Icon = style.icon;
          const hasDetails = row.before !== null || row.after !== null;
          const expanded = expandedId === row.id;
          return (
            <div key={row.id} className="border-b border-line-soft last:border-b-0">
              <div
                className={`flex items-center gap-[14px] px-[22px] py-[15px] ${hasDetails ? 'cursor-pointer' : ''}`}
                onClick={hasDetails ? () => setExpandedId(expanded ? null : row.id) : undefined}
              >
                <div className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-[9px] bg-app-bg">
                  <Icon size={17} className="text-ink-500" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-ink-900">
                    <strong>{row.actor ?? 'System'}</strong> {style.label.toLowerCase()}{' '}
                    <strong>{row.tenant ?? row.entityId}</strong>
                  </div>
                  <div className="mt-[2px] text-xs text-ink-400">{row.entity}</div>
                </div>
                <span
                  className="flex-none whitespace-nowrap text-xs text-ink-400"
                  title={new Date(row.at).toLocaleString()}
                >
                  {formatRelativeTime(row.at)}
                </span>
                {hasDetails && (
                  <ChevronDown
                    size={16}
                    className={`flex-none text-ink-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
                  />
                )}
              </div>
              {expanded && hasDetails && (
                <div className="grid grid-cols-2 gap-4 bg-app-bg px-[22px] py-3">
                  <div>
                    <div className="mb-1 text-[11px] font-semibold uppercase tracking-[.4px] text-ink-400">
                      Before
                    </div>
                    <div className="space-y-[2px] text-xs text-ink-700">
                      {detailEntries(row.before).length === 0 && <div>No data</div>}
                      {detailEntries(row.before).map(([key, value]) => (
                        <div key={key}>
                          {key}: {String(value)}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="mb-1 text-[11px] font-semibold uppercase tracking-[.4px] text-ink-400">
                      After
                    </div>
                    <div className="space-y-[2px] text-xs text-ink-700">
                      {detailEntries(row.after).length === 0 && <div>No data</div>}
                      {detailEntries(row.after).map(([key, value]) => (
                        <div key={key}>
                          {key}: {String(value)}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {!loading && loadError && (
          <div className="px-4 py-12 text-center text-sm text-danger">{loadError}</div>
        )}
        {!loading && !loadError && rows.length === 0 && (
          <div className="px-4 py-12 text-center text-sm text-ink-400">
            No audit entries match your filters.
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
    </>
  );
}
