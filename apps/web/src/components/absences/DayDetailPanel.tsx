import { CalendarDays } from 'lucide-react';
import type { AbsenceEntryDto } from '@se/shared';
import { Overlay } from '@/components/ui/overlay';
import { ABSENCE_TYPE_META, formatDateRangeShort } from './absenceStyle';

/** Everyone away on one day — opened from a Month view day cell or its "+N more" affordance.
 *  `showReason` is only ever true for HR (the API omits `reason` entirely for other scopes). */
export function DayDetailPanel({
  dateIso,
  rows,
  showReason,
  onClose,
}: {
  dateIso: string;
  rows: AbsenceEntryDto[];
  showReason: boolean;
  onClose: () => void;
}) {
  const label = new Date(`${dateIso}T00:00:00`).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  return (
    <Overlay onClose={onClose} z={60}>
      <div className="mx-auto flex max-h-[80vh] w-full max-w-[480px] flex-col rounded-2xl bg-surface shadow-xl">
        <div className="flex items-center gap-3 px-[26px] pt-[26px]">
          <div className="flex h-[42px] w-[42px] flex-none items-center justify-center rounded-[10px] bg-[rgb(236,245,246)] text-brand">
            <CalendarDays size={20} />
          </div>
          <div>
            <div className="text-lg font-bold text-ink-900">{label}</div>
            <div className="text-[13px] text-ink-400">
              {rows.length} {rows.length === 1 ? 'person' : 'people'} away
            </div>
          </div>
        </div>

        <div className="mt-4 flex-1 overflow-y-auto px-[26px] pb-[26px]">
          {rows.length === 0 ? (
            <div className="rounded-sm border border-dashed border-line bg-app-bg px-3 py-6 text-center text-[13px] text-ink-400">
              No one is away this day.
            </div>
          ) : (
            <div className="flex flex-col gap-[10px]">
              {rows.map((row) => {
                const meta = ABSENCE_TYPE_META[row.type];
                const Icon = meta.icon;
                return (
                  <div key={row.requestId} className="rounded-[10px] border border-line-soft p-[12px_14px]">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[14px] font-semibold text-ink-900">{row.personName}</span>
                      <span
                        className="inline-flex flex-none items-center gap-[6px] rounded-full px-[10px] py-1 text-xs font-medium"
                        style={{ background: meta.bg, color: meta.fg }}
                      >
                        <Icon size={12} />
                        {meta.label}
                      </span>
                    </div>
                    <div className="mt-1 text-[12.5px] text-ink-400">
                      {formatDateRangeShort(row.startDate, row.endDate)}
                      {row.departmentName ? ` · ${row.departmentName}` : ''}
                      {row.projectName ? ` · ${row.projectName}` : ''}
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
          )}
        </div>
      </div>
    </Overlay>
  );
}
