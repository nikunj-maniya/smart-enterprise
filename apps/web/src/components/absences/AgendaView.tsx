import { CalendarClock } from 'lucide-react';
import type { AbsenceEntryDto } from '@se/shared';
import { EmptyState, ErrorState } from '@/pages/requests/shared';
import { ABSENCE_TYPE_META, formatDateRangeShort } from './absenceStyle';

/** Chronological list alternative to the Month grid — same filtered rows, sorted by start date. */
export function AgendaView({
  rows,
  loading,
  error,
  onRetry,
  showReason,
}: {
  rows: AbsenceEntryDto[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  showReason: boolean;
}) {
  if (error) return <ErrorState message={error} onRetry={onRetry} />;

  if (loading && rows.length === 0) {
    return (
      <div className="rounded-[14px] border border-line-soft bg-surface p-12 text-center text-sm text-ink-400 shadow-card">
        Loading absences…
      </div>
    );
  }

  if (rows.length === 0) {
    return <EmptyState icon={CalendarClock} heading="No absences" message="No leave or WFH matches the current filters." />;
  }

  const sorted = [...rows].sort((a, b) => a.startDate.localeCompare(b.startDate));

  return (
    <div className="flex flex-col gap-[10px]">
      {sorted.map((row) => {
        const meta = ABSENCE_TYPE_META[row.type];
        const Icon = meta.icon;
        return (
          <div key={row.requestId} className="rounded-[14px] border border-line-soft bg-surface p-[16px_18px] shadow-card">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="text-[14.5px] font-bold text-ink-900">{row.personName}</span>
                <span
                  className="inline-flex flex-none items-center gap-[6px] rounded-full px-[10px] py-1 text-xs font-medium"
                  style={{ background: meta.bg, color: meta.fg }}
                >
                  <Icon size={12} />
                  {meta.label}
                </span>
              </div>
              <span className="text-[13px] font-semibold text-ink-700">{formatDateRangeShort(row.startDate, row.endDate)}</span>
            </div>
            <div className="mt-[6px] text-[13px] text-ink-400">
              {row.departmentName ?? '—'}
              {row.projectName ? ` · ${row.projectName}` : ''}
              {row.halfDayCount ? ` · ${row.halfDayCount} half-day${row.halfDayCount === 1 ? '' : 's'}` : ''}
            </div>
            {showReason && row.reason && (
              <div className="mt-2 rounded-[8px] bg-app-bg p-[9px_11px] text-[12.5px] text-ink-700">
                <strong>Reason:</strong> {row.reason}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
