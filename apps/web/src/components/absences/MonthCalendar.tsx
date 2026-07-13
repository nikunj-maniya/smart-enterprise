import type { AbsenceEntryDto } from '@se/shared';
import { ErrorState } from '@/pages/requests/shared';
import { CALENDAR_TONE, rowOverlapsDate, toISODate } from './absenceStyle';

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Sun–Sat month grid matching the design prototype exactly: each day cell's background reflects
 *  its aggregate state (plain / away / over-cap) with a small dot + count badge — not per-person
 *  chips. Clicking a day opens the day-detail panel (an addition beyond the prototype, needed
 *  since the cell itself no longer names anyone) for the §11A.3 per-person breakdown. */
export function MonthCalendar({
  month,
  weeks,
  rows,
  loading,
  error,
  onRetry,
  overCapDates,
  onSelectDay,
}: {
  month: Date;
  weeks: Date[][];
  rows: AbsenceEntryDto[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  overCapDates?: Set<string>;
  onSelectDay: (dateIso: string, dayRows: AbsenceEntryDto[]) => void;
}) {
  if (error) return <ErrorState message={error} onRetry={onRetry} />;

  const today = toISODate(new Date());

  return (
    <div className="overflow-hidden rounded-xl border border-line-soft bg-surface shadow-card">
      <div className="flex items-center justify-between border-b border-line-soft px-[10px] py-[9px] text-[12px] text-ink-500">
        <span className="text-[11px] font-semibold uppercase tracking-[.4px] text-ink-400">Calendar</span>
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-[6px]">
            <span className="h-[10px] w-[10px] rounded-sm" style={{ background: CALENDAR_TONE.away.cellBg }} />
            Away
          </span>
          <span className="flex items-center gap-[6px]">
            <span className="h-[10px] w-[10px] rounded-sm" style={{ background: CALENDAR_TONE.overCap.cellBg }} />
            Over cap
          </span>
        </div>
      </div>
      <div className="grid grid-cols-7 bg-surface-muted text-[11px] font-semibold uppercase tracking-[.4px] text-ink-400">
        {WEEKDAY_LABELS.map((d) => (
          <div key={d} className="px-[10px] py-[9px]">
            {d}
          </div>
        ))}
      </div>

      {loading && rows.length === 0 ? (
        <div className="px-4 py-16 text-center text-sm text-ink-400">Loading calendar…</div>
      ) : (
        weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7">
            {week.map((date) => {
              const dayIso = toISODate(date);
              const inMonth = date.getMonth() === month.getMonth();
              const isToday = dayIso === today;
              const isOverCap = overCapDates?.has(dayIso) ?? false;
              const dayRows = rows.filter((r) => rowOverlapsDate(r, dayIso));
              const hasAbsence = dayRows.length > 0;
              const tone = isOverCap ? CALENDAR_TONE.overCap : CALENDAR_TONE.away;

              return (
                <button
                  key={dayIso}
                  type="button"
                  onClick={() => onSelectDay(dayIso, dayRows)}
                  disabled={!hasAbsence}
                  className="flex aspect-square min-h-[92px] flex-col border-b border-r border-line-soft p-[6px] text-left last:border-r-0 disabled:cursor-default"
                  style={{ opacity: inMonth ? 1 : 0.45, background: hasAbsence ? tone.cellBg : undefined }}
                >
                  <span
                    className="flex h-[20px] w-[20px] items-center justify-center rounded-full text-[12px] font-semibold"
                    style={isToday ? { background: 'var(--brand)', color: 'var(--brand-ink)' } : { color: 'var(--ink-700)' }}
                  >
                    {date.getDate()}
                  </span>
                  {hasAbsence && (
                    <span
                      className="mt-auto flex items-center gap-[4px] self-start text-[11px] font-bold"
                      style={{ color: tone.countFg }}
                    >
                      <span className="h-[6px] w-[6px] rounded-full" style={{ background: tone.countFg }} />
                      {dayRows.length}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))
      )}
    </div>
  );
}
