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

function extractLeave(data: Record<string, unknown>): PromotedColumns {
  return {
    startDate: date(data.start_date),
    endDate: date(data.end_date),
    totalDays: num(data.number_of_days),
    halfDayCount: num(data.half_day_count),
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
    halfDayCount: num(data.half_wfh_count),
    departmentId: str(data.department),
    projectId: firstOf(data.project_name),
  };
}

const EXTRACTORS: Record<string, (data: Record<string, unknown>) => PromotedColumns> = {
  leave: extractLeave,
  wfh: extractWfh,
};

export function extractPromotedColumns(formKey: string, data: Record<string, unknown>): PromotedColumns {
  return EXTRACTORS[formKey]?.(data) ?? {};
}
