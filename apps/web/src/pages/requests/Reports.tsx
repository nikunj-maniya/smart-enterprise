import * as React from 'react';
import { Download } from 'lucide-react';
import type { ReportSummaryResponse } from '@se/shared';
import { PageHeader } from '@/components/shell/PageHeader';
import { Button } from '@/components/ui/button';
import { addMonths, formatDateShort, getMonthGrid, monthLabel, startOfMonth } from '@/components/absences/absenceStyle';
import { ApiError, downloadAbsencesCsv, getReportSummary } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { ErrorState } from './shared';

const STATUS_COLORS: Record<string, string> = {
  'Pending Approval': 'rgb(247,107,21)',
  Approved: 'rgb(33,131,88)',
  Rejected: 'rgb(229,72,77)',
  Withdrawn: 'var(--ink-400)',
  Cancelled: 'var(--ink-400)',
  Completed: 'rgb(0,144,255)',
};

function BarRow({ label, count, max, color }: { label: string; count: number; max: number; color: string }) {
  const pct = max > 0 ? Math.max(4, (count / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3 text-[13px]">
      <span className="w-[160px] flex-none truncate text-ink-700">{label}</span>
      <div className="h-[10px] flex-1 overflow-hidden rounded-full bg-surface-muted">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="w-[28px] flex-none text-right font-semibold text-ink-900">{count}</span>
    </div>
  );
}

/**
 * Reporting dashboard (reporting-and-polish, HR Head / Enterprise Admin / PM / Tech Lead — the
 * backend enforces access via the same visibility policy `/absences` uses): request-volume,
 * approval-turnaround, and absence-trend tiles over a month range, plus a CSV export of the
 * same visibility-scoped absence rows the calendar screens show.
 */
export default function Reports() {
  const { user } = useAuth();
  const [month, setMonth] = React.useState(() => startOfMonth(new Date()));
  const [data, setData] = React.useState<ReportSummaryResponse | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [exporting, setExporting] = React.useState(false);
  const [exportError, setExportError] = React.useState<string | null>(null);

  const grid = React.useMemo(() => getMonthGrid(month), [month]);

  const load = React.useCallback(() => {
    setError(null);
    getReportSummary({ from: grid.from, to: grid.to })
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Unable to load the report.'));
  }, [grid]);

  React.useEffect(() => {
    load();
  }, [load]);

  async function onExport() {
    setExporting(true);
    setExportError(null);
    try {
      await downloadAbsencesCsv({ from: grid.from, to: grid.to });
    } catch (err) {
      setExportError(err instanceof ApiError ? err.message : 'Unable to export.');
    } finally {
      setExporting(false);
    }
  }

  if (error) return <ErrorState message={error} onRetry={load} />;

  const maxVolume = Math.max(1, ...(data?.requestVolumes.map((v) => v.count) ?? [0]));
  const maxTrend = Math.max(1, ...(data?.absenceTrend.map((t) => t.count) ?? [0]));

  return (
    <>
      <PageHeader
        breadcrumb={`Workspace · ${user?.tenantName ?? ''}`}
        title="Reports"
        subtitle="Request volumes, approval turnaround, and absence trends — scoped to what you're authorized to see."
      />

      <div className="mt-[18px] flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="secondary" size="sm" onClick={() => setMonth((m) => addMonths(m, -1))}>
            Prev
          </Button>
          <span className="text-[14px] font-semibold text-ink-900">{monthLabel(month)}</span>
          <Button variant="secondary" size="sm" onClick={() => setMonth((m) => addMonths(m, 1))}>
            Next
          </Button>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Button onClick={onExport} disabled={exporting}>
            <Download size={14} />
            {exporting ? 'Exporting…' : 'Export absences CSV'}
          </Button>
          {exportError && <span className="text-xs text-danger">{exportError}</span>}
        </div>
      </div>

      {!data ? (
        <div className="mt-8 text-center text-sm text-ink-400">Loading…</div>
      ) : (
        <div className="mt-[18px] grid grid-cols-2 gap-[18px]">
          <div className="rounded-[14px] border border-line-soft bg-surface p-5 shadow-card">
            <div className="text-[13px] font-bold text-ink-900">Request volumes</div>
            <div className="mt-1 text-[12px] text-ink-400">By form and status this month</div>
            <div className="mt-4 flex flex-col gap-[10px]">
              {data.requestVolumes.length === 0 ? (
                <div className="text-[13px] text-ink-400">No requests in this range.</div>
              ) : (
                data.requestVolumes.map((v) => (
                  <BarRow
                    key={`${v.formKey}:${v.status}`}
                    label={`${v.formTitle} · ${v.status}`}
                    count={v.count}
                    max={maxVolume}
                    color={STATUS_COLORS[v.status] ?? 'var(--brand)'}
                  />
                ))
              )}
            </div>
          </div>

          <div className="flex flex-col gap-[18px]">
            <div className="rounded-[14px] border border-line-soft bg-surface p-5 shadow-card">
              <div className="text-[13px] font-bold text-ink-900">Avg. approval turnaround</div>
              <div className="mt-2 text-[28px] font-bold text-ink-900">
                {data.avgApprovalTurnaroundHours === null ? '—' : `${data.avgApprovalTurnaroundHours.toFixed(1)}h`}
              </div>
              <div className="text-[12px] text-ink-400">From submission to a final decision</div>
            </div>

            <div className="rounded-[14px] border border-line-soft bg-surface p-5 shadow-card">
              <div className="text-[13px] font-bold text-ink-900">Absence trend</div>
              <div className="mt-4 flex flex-col gap-[8px]">
                {data.absenceTrend.length === 0 ? (
                  <div className="text-[13px] text-ink-400">No absences in this range.</div>
                ) : (
                  data.absenceTrend.map((t) => (
                    <BarRow key={t.date} label={formatDateShort(t.date)} count={t.count} max={maxTrend} color="var(--brand)" />
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
