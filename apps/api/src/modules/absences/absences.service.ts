import type { Prisma } from '@prisma/client';
import type { AbsenceEntryDto, AbsenceQuery, AbsenceRangeResponse, OverCapQuery, OverCapResponse } from '@se/shared';
import { prisma } from '../../prisma.js';
import { HttpError } from '../../lib/http-error.js';
import { resolveAbsenceScope, type AbsenceScope, type Viewer } from '../requests/visibility-policy.js';
import { getAbsenceCap } from '../leave-types/leave-types.service.js';

/** The PRD §11A "reason/context" field per absence-producing form — HR-only. */
const REASON_FIELD_BY_FORM_KEY: Record<string, string> = { leave: 'context', wfh: 'detailed_reason' };

function scopeWhere(scope: AbsenceScope): Prisma.RequestWhereInput {
  return scope.role === 'pm-tl' ? { projectId: { in: scope.projectIds } } : {};
}

/**
 * GET /absences — approved Leave/WFH requests overlapping [from, to], scoped and field-shaped by
 * the viewer's §11A tier. "Absences" are a query shape over `Request`, not a denormalized table
 * (design.md) — no reason/context ever leaves the server for a non-HR viewer.
 */
export async function listAbsences(tenantId: string, viewer: Viewer, query: AbsenceQuery): Promise<AbsenceRangeResponse> {
  const scope = await resolveAbsenceScope(tenantId, viewer);
  const from = new Date(query.from);
  const to = new Date(query.to);
  const formKeys = query.type ? [query.type] : ['leave', 'wfh'];

  const where: Prisma.RequestWhereInput = {
    tenantId,
    status: 'Approved',
    form: { key: { in: formKeys } },
    startDate: { lte: to },
    endDate: { gte: from },
    ...scopeWhere(scope),
    ...(query.projectId ? { projectId: query.projectId } : {}),
    ...(query.departmentId ? { departmentId: query.departmentId } : {}),
    ...(query.personId ? { requesterId: query.personId } : {}),
  };

  const rows = await prisma.request.findMany({
    where,
    include: { form: { select: { key: true } }, requester: { select: { id: true, name: true } } },
    orderBy: { startDate: 'asc' },
  });

  const projectIds = [...new Set(rows.map((r) => r.projectId).filter((v): v is string => !!v))];
  const departmentIds = [...new Set(rows.map((r) => r.departmentId).filter((v): v is string => !!v))];
  const [projects, departments] = await Promise.all([
    projectIds.length
      ? prisma.project.findMany({ where: { id: { in: projectIds }, tenantId }, select: { id: true, name: true } })
      : [],
    departmentIds.length
      ? prisma.department.findMany({ where: { id: { in: departmentIds }, tenantId }, select: { id: true, name: true } })
      : [],
  ]);
  const projectNameById = new Map(projects.map((p) => [p.id, p.name]));
  const departmentNameById = new Map(departments.map((d) => [d.id, d.name]));

  const includeReason = scope.role === 'hr';
  const entries: AbsenceEntryDto[] = rows.map((r) => {
    const payload = r.payload as Record<string, unknown>;
    const reasonField = REASON_FIELD_BY_FORM_KEY[r.form.key];
    const reason = includeReason && reasonField && typeof payload[reasonField] === 'string' ? (payload[reasonField] as string) : null;
    return {
      requestId: r.id,
      personId: r.requester.id,
      personName: r.requester.name,
      departmentId: r.departmentId,
      departmentName: r.departmentId ? (departmentNameById.get(r.departmentId) ?? null) : null,
      projectId: r.projectId,
      projectName: r.projectId ? (projectNameById.get(r.projectId) ?? null) : null,
      type: r.form.key as 'leave' | 'wfh',
      startDate: r.startDate!.toISOString().slice(0, 10),
      endDate: r.endDate!.toISOString().slice(0, 10),
      halfDayCount: r.halfDayCount ?? null,
      ...(includeReason ? { reason } : {}),
    };
  });

  return { rows: entries, scope: scope.role };
}

/**
 * GET /absences/over-cap — HR/Admin only (design.md: the warning panel belongs to the two
 * Management-tier calendar screens, not the PM/TL view). Walks each day in range, counting
 * concurrent absences against the tenant's configured cap.
 */
export async function getOverCapDays(tenantId: string, viewer: Viewer, query: OverCapQuery): Promise<OverCapResponse> {
  const scope = await resolveAbsenceScope(tenantId, viewer);
  if (scope.role === 'pm-tl') throw new HttpError(403, 'Over-cap panel is HR/Admin only');

  const cap = (await getAbsenceCap(tenantId)).cap;
  const from = new Date(query.from);
  const to = new Date(query.to);

  const rows = await prisma.request.findMany({
    where: {
      tenantId,
      status: 'Approved',
      form: { key: { in: ['leave', 'wfh'] } },
      startDate: { lte: to },
      endDate: { gte: from },
      ...(query.projectId ? { projectId: query.projectId } : {}),
    },
    include: { requester: { select: { id: true, name: true } } },
  });

  const byDay = new Map<string, { personId: string; personName: string }[]>();
  for (const r of rows) {
    if (!r.startDate || !r.endDate) continue;
    const spanStart = r.startDate > from ? r.startDate : from;
    const spanEnd = r.endDate < to ? r.endDate : to;
    for (const d = new Date(spanStart); d <= spanEnd; d.setDate(d.getDate() + 1)) {
      const key = d.toISOString().slice(0, 10);
      const people = byDay.get(key) ?? [];
      people.push({ personId: r.requester.id, personName: r.requester.name });
      byDay.set(key, people);
    }
  }

  const days = [...byDay.entries()]
    .filter(([, people]) => people.length > cap)
    .map(([date, people]) => ({ date, count: people.length, cap, people }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return { cap, days };
}
