import { UserStatus, type Prisma } from '@prisma/client';
import type { AttendanceReportQuery, AttendanceReportResponse, AttendanceReportRow } from '@se/shared';
import { prisma } from '../../prisma.js';
import { HttpError } from '../../lib/http-error.js';
import {
  buildMonthContext,
  computeEmployeeDays,
  type AttendanceRequestInput,
  type MonthContext,
} from './attendance-math.js';

/** UTC `YYYY-MM` of now — the report's "current month" (design.md: UTC-pinned, documented edge). */
function currentMonthUtc(): string {
  return new Date().toISOString().slice(0, 7);
}

function userStatusFilter(includeInactive: boolean | undefined): UserStatus[] {
  return includeInactive
    ? [UserStatus.Active, UserStatus.Inactive, UserStatus.Suspended]
    : [UserStatus.Active];
}

/** `half_day_dates` / `half_wfh_dates` payload values, normalized to `YYYY-MM-DD`. Exported for tests. */
export function halfDayDatesOf(payload: unknown, formKey: string): string[] {
  const data = (payload ?? {}) as Record<string, unknown>;
  const raw = formKey === 'wfh' ? data.half_wfh_dates : data.half_day_dates;
  if (!Array.isArray(raw)) return [];
  return raw.filter((v): v is string => typeof v === 'string').map((v) => v.slice(0, 10));
}

interface ReportScope {
  ctx: MonthContext;
  isPartialMonth: boolean;
  userWhere: Prisma.UserWhereInput;
}

async function resolveScope(tenantId: string, query: AttendanceReportQuery): Promise<ReportScope> {
  const nowMonth = currentMonthUtc();
  if (query.month > nowMonth) throw new HttpError(400, 'Cannot report on a future month');

  if (query.departmentId) {
    const department = await prisma.department.findFirst({ where: { id: query.departmentId, tenantId } });
    if (!department) throw new HttpError(400, 'Unknown department');
  }

  const holidays = await prisma.holiday.findMany({ where: { tenantId }, select: { date: true } });
  const ctx = buildMonthContext(
    query.month,
    holidays.map((h) => h.date.toISOString().slice(0, 10)),
  );

  return {
    ctx,
    isPartialMonth: query.month === nowMonth,
    userWhere: {
      tenantId,
      status: { in: userStatusFilter(query.includeInactive) },
      ...(query.departmentId ? { departments: { some: { departmentId: query.departmentId } } } : {}),
    },
  };
}

type PageUser = {
  id: string;
  name: string;
  email: string;
  status: string;
  createdAt: Date;
  departments: { department: { name: string } }[];
};

/**
 * One batched query for the page's users (no N+1): every approved leave/WFH request overlapping
 * the month. `leaveTypeId` is matched against both LeaveType ids and names — the promoted column
 * carries whatever the form's `leave_type` field held (the ledger matches by name). Unresolvable
 * types count as paid: payroll must not dock salary on a lookup miss.
 */
async function computeRows(tenantId: string, ctx: MonthContext, users: PageUser[]): Promise<AttendanceReportRow[]> {
  if (users.length === 0) return [];

  const [requests, leaveTypes] = await Promise.all([
    prisma.request.findMany({
      where: {
        tenantId,
        requesterId: { in: users.map((u) => u.id) },
        status: 'Approved',
        form: { key: { in: ['leave', 'wfh'] } },
        startDate: { lt: ctx.monthEnd },
        endDate: { gte: ctx.monthStart },
      },
      select: {
        requesterId: true,
        startDate: true,
        endDate: true,
        leaveTypeId: true,
        payload: true,
        form: { select: { key: true } },
      },
    }),
    prisma.leaveType.findMany({ where: { tenantId }, select: { id: true, name: true, isPaid: true } }),
  ]);

  const isPaidByKey = new Map<string, boolean>();
  for (const lt of leaveTypes) {
    isPaidByKey.set(lt.id, lt.isPaid);
    isPaidByKey.set(lt.name, lt.isPaid);
  }

  const requestsByUser = new Map<string, AttendanceRequestInput[]>();
  for (const r of requests) {
    const kind =
      r.form.key === 'wfh'
        ? 'wfh'
        : (isPaidByKey.get(r.leaveTypeId ?? '') ?? true)
          ? 'paid-leave'
          : 'unpaid-leave';
    const list = requestsByUser.get(r.requesterId) ?? [];
    list.push({
      kind,
      startDate: r.startDate,
      endDate: r.endDate,
      halfDayDates: halfDayDatesOf(r.payload, r.form.key),
    });
    requestsByUser.set(r.requesterId, list);
  }

  return users.map((user) => ({
    userId: user.id,
    name: user.name,
    email: user.email,
    departments: user.departments.map((d) => d.department.name),
    status: user.status,
    joinedAt: user.createdAt.toISOString().slice(0, 10),
    workingDays: ctx.workingDays,
    ...computeEmployeeDays(ctx, requestsByUser.get(user.id) ?? []),
  }));
}

const USER_SELECT = {
  id: true,
  name: true,
  email: true,
  status: true,
  createdAt: true,
  departments: { select: { department: { select: { name: true } } } },
} satisfies Prisma.UserSelect;

/** GET /reports/attendance — paginated per-employee payable days for a month. */
export async function getAttendanceReport(
  tenantId: string,
  query: AttendanceReportQuery,
): Promise<AttendanceReportResponse> {
  const { ctx, isPartialMonth, userWhere } = await resolveScope(tenantId, query);

  const [total, users] = await Promise.all([
    prisma.user.count({ where: userWhere }),
    prisma.user.findMany({
      where: userWhere,
      orderBy: { name: 'asc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      select: USER_SELECT,
    }),
  ]);

  return {
    month: query.month,
    isPartialMonth,
    calendarDays: ctx.calendarDays,
    weekendDays: ctx.weekendDays,
    holidayCount: ctx.holidayCount,
    workingDays: ctx.workingDays,
    rows: await computeRows(tenantId, ctx, users),
    total,
    page: query.page,
    pageSize: query.pageSize,
  };
}

/** Cell guard for a payroll CSV opened in Excel: quote per RFC and neutralize formula prefixes. Exported for tests. */
export function csvCell(value: string): string {
  const guarded = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return /[",\n]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}

const CSV_HEADERS = [
  'Employee',
  'Email',
  'Departments',
  'Status',
  'Joined',
  'Working Days',
  'WFH Days',
  'Paid Leave',
  'Unpaid Leave (LWP)',
  'Office Days',
  'Payable Days',
];

/** GET /reports/attendance/export — the same figures as the JSON view, all rows, no pagination. */
export async function exportAttendanceCsv(tenantId: string, query: AttendanceReportQuery): Promise<string> {
  const { ctx, userWhere } = await resolveScope(tenantId, query);
  const users = await prisma.user.findMany({ where: userWhere, orderBy: { name: 'asc' }, select: USER_SELECT });
  const rows = await computeRows(tenantId, ctx, users);

  const lines = [CSV_HEADERS.join(',')];
  for (const row of rows) {
    lines.push(
      [
        row.name,
        row.email,
        row.departments.join(', '),
        row.status,
        row.joinedAt,
        String(row.workingDays),
        String(row.wfhDays),
        String(row.paidLeaveDays),
        String(row.unpaidLeaveDays),
        String(row.officeDays),
        String(row.payableDays),
      ]
        .map(csvCell)
        .join(','),
    );
  }
  return lines.join('\n');
}
