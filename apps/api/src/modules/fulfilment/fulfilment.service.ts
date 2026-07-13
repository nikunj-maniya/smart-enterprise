import type { FulfilmentQueueItemDto, FulfilmentQueueResponse, FulfilmentQueueTab } from '@se/shared';
import { prisma } from '../../prisma.js';
import { HttpError } from '../../lib/http-error.js';

/** POST /requests/:id/claim — claim-based assignment (design.md): first IT Admin to claim owns
 *  it; a guarded single-row update so a race between two admins fails cleanly for the loser. */
export async function claimRequest(tenantId: string, actorId: string, requestId: string): Promise<void> {
  const request = await prisma.request.findFirst({
    where: { id: requestId, tenantId, form: { key: 'it' } },
    select: { id: true, status: true, itAssigneeId: true },
  });
  if (!request) throw new HttpError(404, 'Request not found');
  if (request.status !== 'Approved' && request.status !== 'In Progress') {
    throw new HttpError(409, 'Only an approved (or already in-progress) request can be claimed');
  }

  await prisma.$transaction(async (tx) => {
    const { count } = await tx.request.updateMany({
      where: { id: requestId, itAssigneeId: request.itAssigneeId },
      data: { itAssigneeId: actorId },
    });
    if (count === 0) throw new HttpError(409, 'This request was just claimed by someone else — refresh and retry');
    await tx.auditLog.create({
      data: {
        tenantId,
        actorId,
        entity: 'Request',
        entityId: requestId,
        action: 'claim',
        before: { itAssigneeId: request.itAssigneeId },
        after: { itAssigneeId: actorId },
      },
    });
  });
}

const CATEGORY_LABEL: Record<string, string> = { Software: 'Software', Hardware: 'Hardware' };

function itemsFor(payload: Record<string, unknown>, accessType: string | undefined): string[] {
  const key = accessType === 'Hardware' ? 'hardware_items' : 'software_items';
  const value = payload[key];
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

/** GET /requests/fulfilment-queue — the tenant's IT Admin fulfilment queue (it-fulfilment spec):
 *  Open (Approved/In Progress) or Fulfilled tab, plus the three stat counts. */
export async function getFulfilmentQueue(tenantId: string, tab: FulfilmentQueueTab): Promise<FulfilmentQueueResponse> {
  const statusFilter = tab === 'open' ? ['Approved', 'In Progress'] : ['Fulfilled'];

  const [rows, queuedCount, inProgressCount, fulfilledCount] = await Promise.all([
    prisma.request.findMany({
      where: { tenantId, form: { key: 'it' }, status: { in: statusFilter } },
      include: {
        requester: { select: { name: true } },
        statusHistory: { orderBy: { at: 'asc' } },
      },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.request.count({ where: { tenantId, form: { key: 'it' }, status: 'Approved' } }),
    prisma.request.count({ where: { tenantId, form: { key: 'it' }, status: 'In Progress' } }),
    prisma.request.count({ where: { tenantId, form: { key: 'it' }, status: 'Fulfilled' } }),
  ]);

  const assigneeIds = [...new Set(rows.map((r) => r.itAssigneeId).filter((v): v is string => !!v))];
  const assignees = await prisma.user.findMany({ where: { id: { in: assigneeIds } }, select: { id: true, name: true } });
  const nameByAssignee = new Map(assignees.map((a) => [a.id, a.name]));

  const dtos: FulfilmentQueueItemDto[] = rows.map((r) => {
    const payload = r.payload as Record<string, unknown>;
    const accessType = typeof payload.access_type === 'string' ? payload.access_type : undefined;
    const impact = typeof payload.sw_impact === 'string' ? payload.sw_impact : typeof payload.hw_impact === 'string' ? payload.hw_impact : null;
    const approvedAt = r.statusHistory.find((h) => h.toState === 'Approved')?.at ?? null;
    const fulfilledAt = r.statusHistory.find((h) => h.toState === 'Fulfilled')?.at ?? null;
    return {
      requestId: r.id,
      requesterName: r.requester.name,
      departmentId: r.departmentId,
      category: accessType ? (CATEGORY_LABEL[accessType] ?? accessType) : 'Unknown',
      items: itemsFor(payload, accessType),
      impact,
      status: r.status,
      assigneeId: r.itAssigneeId,
      assigneeName: r.itAssigneeId ? (nameByAssignee.get(r.itAssigneeId) ?? 'Unknown') : null,
      approvedAt: approvedAt ? approvedAt.toISOString() : null,
      fulfilledAt: fulfilledAt ? fulfilledAt.toISOString() : null,
    };
  });

  return { rows: dtos, queuedCount, inProgressCount, fulfilledCount };
}
