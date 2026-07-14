import { House, Plane, type LucideIcon } from 'lucide-react';
import type { AbsenceEntryDto, AbsenceType } from '@se/shared';

/** Leave = info blue, WFH = success green — reuses existing status-tone tokens (see
 *  pages/requests/shared.tsx STATUS_TONE) so amber stays reserved for the over-cap warning. */
export const ABSENCE_TYPE_META: Record<AbsenceType, { label: string; icon: LucideIcon; bg: string; fg: string; dot: string }> = {
  leave: { label: 'Leave', icon: Plane, bg: 'rgb(230,244,254)', fg: 'rgb(0,144,255)', dot: 'rgb(0,144,255)' },
  wfh: { label: 'WFH', icon: House, bg: 'rgb(233,246,233)', fg: 'rgb(33,131,88)', dot: 'rgb(70,167,88)' },
};

/** Month-grid cell tones — matches the design prototype's calendar exactly: a day cell's
 *  background reflects its *aggregate* state (plain/away/over-cap), not a per-person color. */
export const CALENDAR_TONE = {
  away: { cellBg: 'rgb(236,245,246)', countFg: 'var(--brand)' },
  overCap: { cellBg: 'rgba(229,72,77,.2)', countFg: 'rgb(229,72,77)' },
} as const;

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function addMonths(d: Date, delta: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + delta, 1);
}

export function monthLabel(d: Date): string {
  return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

/** Sun–Sat weeks covering the whole month, plus the ISO range (`from`/`to`) those weeks span —
 *  used to both query `/absences` and render the grid off the same boundaries. */
export function getMonthGrid(month: Date): { from: string; to: string; weeks: Date[][] } {
  const first = startOfMonth(month);
  const last = new Date(month.getFullYear(), month.getMonth() + 1, 0);
  const gridStart = new Date(first);
  gridStart.setDate(first.getDate() - first.getDay());
  const gridEnd = new Date(last);
  gridEnd.setDate(last.getDate() + (6 - last.getDay()));

  const weeks: Date[][] = [];
  const cursor = new Date(gridStart);
  while (cursor <= gridEnd) {
    const week: Date[] = [];
    for (let i = 0; i < 7; i++) {
      week.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(week);
  }
  return { from: toISODate(gridStart), to: toISODate(gridEnd), weeks };
}

export function rowOverlapsDate(row: AbsenceEntryDto, iso: string): boolean {
  return row.startDate <= iso && row.endDate >= iso;
}

/** Reads only the leading `YYYY-MM-DD` and builds a local-time `Date` from its components —
 *  tolerates a plain date or a full ISO datetime alike, and never shifts a calendar day across
 *  the viewer's timezone boundary the way parsing-as-UTC-then-formatting-as-local would. */
export function formatDateShort(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function formatDateRangeShort(startDate: string, endDate: string): string {
  if (startDate === endDate) return formatDateShort(startDate);
  return `${formatDateShort(startDate)} – ${formatDateShort(endDate)}`;
}
