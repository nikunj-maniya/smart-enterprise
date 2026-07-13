import type { Prisma } from '@prisma/client';
import type { ReportRangeQuery, ReportSummaryResponse } from '@se/shared';
import { prisma } from '../../prisma.js';
import { resolveAbsenceScope, type AbsenceScope, type Viewer } from '../requests/visibility-policy.js';
import * as absencesService from '../absences/absences.service.js';

/**
 * Reporting & dashboards (design.md: "Exports reuse the visibility policy module from
 * absence-visibility — an export is just a serialized query result; no parallel report-side
 * permission code"). Request volumes/turnaround reuse the exact same scope resolution and
 * project-scoping `GET /absences` uses; the absence trend literally calls `absences.service.ts`'s
 * `listAbsences` rather than re-deriving its query.
 */

function scopeWhere(scope: AbsenceScope): Prisma.RequestWhereInput {
  return scope.role === 'pm-tl' ? { projectId: { in: scope.projectIds } } : {};
}

export async function getSummary(tenantId: string, viewer: Viewer, query: ReportRangeQuery): Promise<ReportSummaryResponse> {
  const scope = await resolveAbsenceScope(tenantId, viewer);
  const from = new Date(query.from);
  const to = new Date(query.to);

  const requests = await prisma.request.findMany({
    where: {
      tenantId,
      createdAt: { gte: from, lte: to },
      ...scopeWhere(scope),
      ...(query.projectId ? { projectId: query.projectId } : {}),
    },
    include: { form: { select: { key: true, title: true } }, statusHistory: { select: { toState: true, at: true } } },
  });

  const volumeByKey = new Map<string, { formKey: string; formTitle: string; status: string; count: number }>();
  const turnaroundsHours: number[] = [];
  for (const r of requests) {
    const key = `${r.form.key}:${r.status}`;
    const existing = volumeByKey.get(key);
    if (existing) existing.count += 1;
    else volumeByKey.set(key, { formKey: r.form.key, formTitle: r.form.title, status: r.status, count: 1 });

    const decided = r.statusHistory.find((h) => h.toState === 'Approved' || h.toState === 'Rejected');
    if (decided) turnaroundsHours.push((decided.at.getTime() - r.createdAt.getTime()) / 3_600_000);
  }
  const avgApprovalTurnaroundHours =
    turnaroundsHours.length > 0 ? turnaroundsHours.reduce((a, b) => a + b, 0) / turnaroundsHours.length : null;

  const { rows: absenceRows } = await absencesService.listAbsences(tenantId, viewer, {
    from: query.from,
    to: query.to,
    projectId: query.projectId,
  });
  const trendByDate = new Map<string, number>();
  for (const row of absenceRows) {
    for (let d = new Date(Math.max(new Date(row.startDate).getTime(), from.getTime())); d <= to && d <= new Date(row.endDate); d.setDate(d.getDate() + 1)) {
      const key = d.toISOString().slice(0, 10);
      trendByDate.set(key, (trendByDate.get(key) ?? 0) + 1);
    }
  }

  return {
    scope: scope.role,
    requestVolumes: [...volumeByKey.values()],
    avgApprovalTurnaroundHours,
    absenceTrend: [...trendByDate.entries()].map(([date, count]) => ({ date, count })).sort((a, b) => a.date.localeCompare(b.date)),
  };
}

function csvEscape(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * CSV export of the visible absence report — deliberately calls the exact same
 * `absences.service.ts` function the calendar screens use, so a Management export can *never*
 * carry a `reason` column: the DTO it serializes already omits that key server-side for any
 * non-HR viewer (absence-visibility's field-stripping, not re-implemented here).
 */
export async function exportAbsencesCsv(tenantId: string, viewer: Viewer, query: ReportRangeQuery): Promise<string> {
  const { rows, scope } = await absencesService.listAbsences(tenantId, viewer, query);
  const headers = ['personName', 'type', 'startDate', 'endDate', 'departmentName', 'projectName', ...(scope === 'hr' ? ['reason'] : [])];

  const lines = [headers.join(',')];
  for (const row of rows) {
    const record = row as unknown as Record<string, unknown>;
    lines.push(headers.map((h) => csvEscape(String(record[h] ?? ''))).join(','));
  }
  return lines.join('\n');
}
