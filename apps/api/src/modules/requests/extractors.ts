import type { Prisma } from '@prisma/client';
import { adjustLeaveBalance } from './leave-balance-ledger.js';

// ── Promoted-column extractor map (design.md: "Promoted columns extracted
// server-side, never client-supplied") ─────────────────────────────────────
// Derives the typed `Request` columns used for cross-cutting queries (absence
// calendar, leave balance, dashboards) from a validated payload. Only the
// core forms whose lifecycle needs those columns (Leave, WFH) have entries;
// Visitor/IT return no promoted columns.

export interface PromotedColumns {
  startDate?: Date;
  endDate?: Date;
  totalDays?: number;
  halfDayCount?: number;
  leaveTypeId?: string;
  departmentId?: string;
  projectId?: string;
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}
function num(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}
function date(value: unknown): Date | undefined {
  return typeof value === 'string' ? new Date(value) : undefined;
}
/** Promoted `projectId` is single-valued; a multi-select project-picker's first pick wins. */
function firstOf(value: unknown): string | undefined {
  return Array.isArray(value) && typeof value[0] === 'string' ? value[0] : undefined;
}
/** reporting-and-polish: half-days are now specific dates, not a raw count — the promoted
 *  `halfDayCount` column (balance math, absence calendar) is just how many were picked. */
function countOf(value: unknown): number | undefined {
  return Array.isArray(value) ? value.length : undefined;
}

function extractLeave(data: Record<string, unknown>): PromotedColumns {
  return {
    startDate: date(data.start_date),
    endDate: date(data.end_date),
    totalDays: num(data.number_of_days),
    halfDayCount: countOf(data.half_day_dates),
    leaveTypeId: str(data.leave_type),
    departmentId: str(data.department),
    projectId: firstOf(data.project_name),
  };
}

function extractWfh(data: Record<string, unknown>): PromotedColumns {
  const startDate = date(data.start_date);
  const endDate = date(data.end_date);
  return {
    startDate,
    endDate,
    // WFH has no explicit "number of days" field — derive it from the date range.
    totalDays:
      startDate && endDate
        ? Math.round((endDate.getTime() - startDate.getTime()) / 86_400_000) + 1
        : undefined,
    halfDayCount: countOf(data.half_wfh_dates),
    departmentId: str(data.department),
    projectId: firstOf(data.project_name),
  };
}

/** Promotes `visit_datetime` to `startDate` so the Front Desk's "today" queries (visitor-management
 *  design.md) can use the existing indexed column instead of a JSON-path scan. */
function extractVisitor(data: Record<string, unknown>): PromotedColumns {
  return { startDate: date(data.visit_datetime) };
}

const EXTRACTORS: Record<string, (data: Record<string, unknown>) => PromotedColumns> = {
  leave: extractLeave,
  visitor: extractVisitor,
  wfh: extractWfh,
};

export function extractPromotedColumns(formKey: string, data: Record<string, unknown>): PromotedColumns {
  return EXTRACTORS[formKey]?.(data) ?? {};
}

// ── Balance-restore hook (leave-wfh-requests: "restore on cancel") ──────────
// Only `leave` requests deduct/restore a balance — WFH has no `leave_type` and never
// touches one (`adjustLeaveBalance` no-ops without a leave type name regardless, but the
// gate below skips WFH before even reading the request).

export function requiresBalanceRestore(formKey: string): boolean {
  return formKey === 'leave';
}

/** Identifying/promoted fields the balance ledger needs to credit back a cancelled request. */
export interface BalanceRestoreContext {
  tenantId: string;
  requestId: string;
  requesterId: string;
  formKey: string;
  leaveTypeId: string | null;
  totalDays: number | null;
  halfDayCount: number | null;
}

/**
 * Fired inside the same transition transaction whenever an authorized HR/Enterprise Admin
 * cancels an Approved leave request: credits the previously-deducted days back, under the same
 * row lock the original deduction used (`decisions.service.ts`'s final-approval hook).
 */
export async function restoreBalanceOnCancel(
  tx: Prisma.TransactionClient,
  context: BalanceRestoreContext,
): Promise<void> {
  await adjustLeaveBalance(tx, context.tenantId, context.requesterId, context.leaveTypeId, context.totalDays, context.halfDayCount, 1);
}
