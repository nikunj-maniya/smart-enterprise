/**
 * Pure day-math for the attendance report (attendance-report spec, "Payable-days computation").
 * All math is UTC on date-only values — `Request.startDate`/`Holiday.date` are stored at UTC
 * midnight, so `getUTCDay()`/ISO slicing never crosses a timezone.
 */

export interface MonthContext {
  /** First day of the month (UTC midnight). */
  monthStart: Date;
  /** First day of the NEXT month (UTC midnight, exclusive bound). */
  monthEnd: Date;
  calendarDays: number;
  weekendDays: number;
  /** Tenant holidays falling on a weekday (weekend holidays are no-ops). */
  holidayCount: number;
  workingDays: number;
  /** ISO `YYYY-MM-DD` of every working day in the month. */
  workingDaySet: Set<string>;
}

const DAY_MS = 86_400_000;

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function isWeekend(d: Date): boolean {
  const dow = d.getUTCDay();
  return dow === 0 || dow === 6;
}

/** `month` is `YYYY-MM`; `holidayDates` are the tenant's holidays as `YYYY-MM-DD` (any month — filtered here). */
export function buildMonthContext(month: string, holidayDates: string[]): MonthContext {
  const [year, monthNum] = month.split('-').map(Number);
  const monthStart = new Date(Date.UTC(year, monthNum - 1, 1));
  const monthEnd = new Date(Date.UTC(year, monthNum, 1));
  const holidays = new Set(holidayDates);

  let calendarDays = 0;
  let weekendDays = 0;
  let holidayCount = 0;
  const workingDaySet = new Set<string>();
  for (let d = new Date(monthStart); d < monthEnd; d = new Date(d.getTime() + DAY_MS)) {
    calendarDays += 1;
    if (isWeekend(d)) {
      weekendDays += 1;
    } else if (holidays.has(iso(d))) {
      holidayCount += 1;
    } else {
      workingDaySet.add(iso(d));
    }
  }

  return {
    monthStart,
    monthEnd,
    calendarDays,
    weekendDays,
    holidayCount,
    workingDays: workingDaySet.size,
    workingDaySet,
  };
}

/** One approved leave/WFH request, already resolved by the caller (form key + `LeaveType.isPaid`). */
export interface AttendanceRequestInput {
  kind: 'wfh' | 'paid-leave' | 'unpaid-leave';
  startDate: Date | null;
  endDate: Date | null;
  /** `half_day_dates` / `half_wfh_dates` payload dates as `YYYY-MM-DD`. */
  halfDayDates: string[];
}

export interface EmployeeDayCounts {
  wfhDays: number;
  paidLeaveDays: number;
  unpaidLeaveDays: number;
  officeDays: number;
  payableDays: number;
}

/** Higher wins a day when multiple approved requests overlap it (spec: unpaid > paid > WFH). */
const PRECEDENCE = { 'unpaid-leave': 3, 'paid-leave': 2, wfh: 1 } as const;

/**
 * Per-day set semantics: each working day carries at most one classification (weight 0.5 for a
 * half-day, 1 otherwise), so overlapping approved requests can never double-count a day.
 */
export function computeEmployeeDays(ctx: MonthContext, requests: AttendanceRequestInput[]): EmployeeDayCounts {
  const dayMap = new Map<string, { kind: AttendanceRequestInput['kind']; weight: number }>();

  for (const request of requests) {
    if (!request.startDate || !request.endDate) continue;
    const halfDays = new Set(request.halfDayDates);
    const from = Math.max(request.startDate.getTime(), ctx.monthStart.getTime());
    const to = Math.min(request.endDate.getTime(), ctx.monthEnd.getTime() - DAY_MS);
    for (let t = from; t <= to; t += DAY_MS) {
      const day = iso(new Date(t));
      if (!ctx.workingDaySet.has(day)) continue;
      const weight = halfDays.has(day) ? 0.5 : 1;
      const existing = dayMap.get(day);
      if (!existing || PRECEDENCE[request.kind] > PRECEDENCE[existing.kind]) {
        dayMap.set(day, { kind: request.kind, weight });
      } else if (PRECEDENCE[request.kind] === PRECEDENCE[existing.kind] && weight > existing.weight) {
        dayMap.set(day, { kind: request.kind, weight });
      }
    }
  }

  let wfhDays = 0;
  let paidLeaveDays = 0;
  let unpaidLeaveDays = 0;
  for (const { kind, weight } of dayMap.values()) {
    if (kind === 'wfh') wfhDays += weight;
    else if (kind === 'paid-leave') paidLeaveDays += weight;
    else unpaidLeaveDays += weight;
  }

  return {
    wfhDays,
    paidLeaveDays,
    unpaidLeaveDays,
    officeDays: Math.max(0, ctx.workingDays - paidLeaveDays - unpaidLeaveDays - wfhDays),
    payableDays: ctx.workingDays - unpaidLeaveDays,
  };
}
