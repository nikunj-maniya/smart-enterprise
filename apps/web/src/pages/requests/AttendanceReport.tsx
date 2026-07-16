import * as React from 'react';
import { ChevronLeft, ChevronRight, Download, Info, Users } from 'lucide-react';
import type { AttendanceReportResponse, DepartmentsResponse } from '@se/shared';
import { PageHeader } from '@/components/shell/PageHeader';
import { Button } from '@/components/ui/button';
import { PaginationBar } from '@/components/ui/pagination';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { addMonths, dateFromDay, monthLabel, startOfMonth } from '@/components/absences/absenceStyle';
import { apiFetch, ApiError, downloadAttendanceCsv, getAttendanceReport } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { EmptyState, ErrorState } from './shared';

const GRID = 'grid-cols-[1.9fr_1.3fr_0.9fr_1fr_0.7fr_0.6fr_0.8fr_0.6fr_0.7fr_0.8fr]';

/** "YYYY-MM" for a month-start date, read off the local calendar fields (a `toISOString`
 *  round-trip could shift day 1 midnight into the previous month for UTC+ viewers). */
function monthParam(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** "26 Jan 2026" — joinedAt is a plain `YYYY-MM-DD`, hence the timezone-safe parse. */
function formatJoined(iso: string): string {
  return dateFromDay(iso).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Attendance report (attendance-report, Finance / Enterprise Admin — the backend enforces
 * access): per-employee working/WFH/leave/payable day figures for one month, with a CSV
 * export feeding payroll. The backend counts working days off the same holiday list the
 * Holidays page manages.
 */
export default function AttendanceReport() {
  const { user } = useAuth();
  const [month, setMonth] = React.useState(() => startOfMonth(new Date()));
  const [departmentId, setDepartmentId] = React.useState('');
  const [includeInactive, setIncludeInactive] = React.useState(false);
  const [page, setPage] = React.useState(1);
  const [pageSize] = React.useState(20);
  const [departments, setDepartments] = React.useState<{ id: string; name: string }[]>([]);
  const [data, setData] = React.useState<AttendanceReportResponse | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [exporting, setExporting] = React.useState(false);
  const [exportError, setExportError] = React.useState<string | null>(null);

  // The backend refuses future months, so Next stops at the current UTC month.
  const nextDisabled = monthParam(month) >= new Date().toISOString().slice(0, 7);

  React.useEffect(() => {
    apiFetch<DepartmentsResponse>('/departments?pageSize=100')
      .then((res) => setDepartments(res.rows.map((d) => ({ id: d.id, name: d.name }))))
      .catch(() => {}); // filter degrades to "All departments"; the report itself still loads
  }, []);

  const load = React.useCallback(() => {
    setError(null);
    setExportError(null); // a failed export's message describes the previous filters
    getAttendanceReport({
      month: monthParam(month),
      departmentId: departmentId || undefined,
      includeInactive,
      page,
      pageSize,
    })
      .then(setData)
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : 'Unable to load the report.'),
      );
  }, [month, departmentId, includeInactive, page, pageSize]);

  React.useEffect(() => {
    load();
  }, [load]);

  async function onExport() {
    setExporting(true);
    setExportError(null);
    try {
      await downloadAttendanceCsv({
        month: monthParam(month),
        departmentId: departmentId || undefined,
        includeInactive,
      });
    } catch (err) {
      setExportError(err instanceof ApiError ? err.message : 'Unable to export.');
    } finally {
      setExporting(false);
    }
  }

  const total = data?.total ?? 0;

  return (
    <>
      <PageHeader
        breadcrumb={`Workspace · ${user?.tenantName ?? ''}`}
        title="Attendance Report"
        subtitle="Per-employee payable days for the month — working days minus leave without pay, ready for payroll."
      />

      <div className="mt-[18px] flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-3">
            <Button
              variant="secondary"
              size="sm"
              aria-label="Previous month"
              onClick={() => {
                setMonth((m) => addMonths(m, -1));
                setPage(1);
              }}
            >
              <ChevronLeft size={14} />
            </Button>
            <span className="w-[130px] text-center text-[14px] font-semibold text-ink-900">
              {monthLabel(month)}
            </span>
            <Button
              variant="secondary"
              size="sm"
              aria-label="Next month"
              disabled={nextDisabled}
              onClick={() => {
                setMonth((m) => addMonths(m, 1));
                setPage(1);
              }}
            >
              <ChevronRight size={14} />
            </Button>
          </div>
          <Select
            value={departmentId}
            onChange={(e) => {
              setDepartmentId(e.target.value);
              setPage(1);
            }}
            aria-label="Department"
          >
            <option value="">All departments</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id} className="text-ink-900">
                {d.name}
              </option>
            ))}
          </Select>
          <div className="flex items-center gap-2">
            <Switch
              checked={includeInactive}
              aria-label="Include inactive"
              onCheckedChange={(v) => {
                setIncludeInactive(v);
                setPage(1);
              }}
            />
            <span className="text-[13px] font-medium text-ink-700">Include inactive</span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Button variant="secondary" onClick={onExport} disabled={exporting}>
            <Download size={14} />
            {exporting ? 'Exporting…' : 'Export CSV'}
          </Button>
          {exportError && <span className="text-xs text-danger">{exportError}</span>}
        </div>
      </div>

      {error ? (
        <div className="mt-[18px]">
          <ErrorState message={error} onRetry={load} />
        </div>
      ) : !data ? (
        <div className="mt-8 text-center text-sm text-ink-400">Loading…</div>
      ) : (
        <>
          {data.isPartialMonth && (
            <div className="mt-[18px] flex items-start gap-[10px] rounded-sm bg-[rgb(236,245,246)] px-[15px] py-[11px]">
              <Info size={16} className="mt-[1px] flex-none text-brand" />
              <span className="text-[12.5px] leading-[1.5] text-ink-500">
                This month is still in progress — figures cover only the days elapsed so far.
              </span>
            </div>
          )}

          <div className="mt-[18px] grid max-w-[640px] grid-cols-4 gap-[18px]">
            {[
              { value: data.calendarDays, label: 'Calendar days' },
              { value: data.weekendDays, label: 'Weekend days' },
              { value: data.holidayCount, label: 'Holidays' },
              { value: data.workingDays, label: 'Working days' },
            ].map((s) => (
              <div
                key={s.label}
                className="rounded-lg border border-line-soft bg-surface p-4 shadow-card"
              >
                <div className="text-[22px] font-bold leading-[1.1] text-ink-900">{s.value}</div>
                <div className="mt-1 text-[13px] text-ink-400">{s.label}</div>
              </div>
            ))}
          </div>

          {data.rows.length === 0 ? (
            <div className="mt-[18px]">
              <EmptyState
                icon={Users}
                heading="No employees to report"
                message="No one matches these filters for this month."
              />
            </div>
          ) : (
            <div className="mt-[18px] overflow-x-auto rounded-xl border border-line-soft bg-surface shadow-card">
              <div
                className={`grid ${GRID} min-w-[1080px] bg-surface-muted px-[22px] py-[13px] text-[11px] font-semibold uppercase tracking-[.4px] text-ink-400`}
              >
                <span>Employee</span>
                <span>Departments</span>
                <span>Status</span>
                <span>Joined</span>
                <span className="text-right">Working</span>
                <span className="text-right">WFH</span>
                <span className="text-right">Paid Leave</span>
                <span className="text-right">LWP</span>
                <span className="text-right">Office</span>
                <span className="text-right">Payable</span>
              </div>
              {data.rows.map((r) => (
                <div
                  key={r.userId}
                  className={`grid ${GRID} min-w-[1080px] items-center border-b border-line-soft px-[22px] py-[13px] last:border-b-0`}
                >
                  <div className="min-w-0 pr-3">
                    <div className="truncate text-sm font-semibold text-ink-900">{r.name}</div>
                    <div className="truncate text-xs text-ink-400">{r.email}</div>
                  </div>
                  <span className="truncate pr-3 text-[13px] text-ink-700">
                    {r.departments.join(', ') || '—'}
                  </span>
                  <span className="pr-3 text-[13px] text-ink-700">{r.status}</span>
                  <span className="pr-3 text-[13px] text-ink-700">{formatJoined(r.joinedAt)}</span>
                  <span className="text-right text-[13px] tabular-nums text-ink-700">
                    {r.workingDays}
                  </span>
                  <span className="text-right text-[13px] tabular-nums text-ink-700">
                    {r.wfhDays}
                  </span>
                  <span className="text-right text-[13px] tabular-nums text-ink-700">
                    {r.paidLeaveDays}
                  </span>
                  <span className="text-right text-[13px] tabular-nums text-ink-700">
                    {r.unpaidLeaveDays}
                  </span>
                  <span className="text-right text-[13px] tabular-nums text-ink-700">
                    {r.officeDays}
                  </span>
                  <span className="text-right text-[13px] font-bold tabular-nums text-ink-900">
                    {r.payableDays}
                  </span>
                </div>
              ))}
            </div>
          )}

          <PaginationBar page={page} pageSize={pageSize} total={total} onPageChange={setPage} />
        </>
      )}
    </>
  );
}
