import { Queue, Worker } from 'bullmq';
import { redisConnection } from '../lib/redis.js';
import { prisma } from '../prisma.js';
import { getEscalationRule, resolveEscalationTarget } from '../modules/requests/escalation.service.js';
import * as notificationsService from '../modules/notifications/notifications.service.js';

const QUEUE_NAME = 'escalation-sweep';
const REPEATABLE_JOB_ID = 'hourly-escalation-sweep';

/** Forms whose absence calendar the "approver on approved leave" check reads. */
const ABSENCE_FORM_KEYS = ['leave', 'wfh'];

async function isOnApprovedLeaveToday(approverId: string): Promise<boolean> {
  const now = new Date();
  const count = await prisma.request.count({
    where: {
      requesterId: approverId,
      status: 'Approved',
      form: { key: { in: ABSENCE_FORM_KEYS } },
      startDate: { lte: now },
      endDate: { gte: now },
    },
  });
  return count > 0;
}

/**
 * Hourly sweep (escalation spec): auto-escalates a pending approval whose approver is on
 * approved leave covering today, has been deactivated, or hasn't acted within the tenant's
 * configured action window. Reassigns the existing `RequestApprover` row (design.md — keeps
 * "all must approve" arithmetic trivial), records the annotation, and notifies both the
 * original approver and the requester. At most one hop per run; the target resolver's
 * Enterprise-Admin fallback keeps a repeatedly-unavailable chain from looping (escalation.service.ts).
 */
export async function runEscalationSweep(): Promise<void> {
  const pendingRows = await prisma.requestApprover.findMany({
    where: {
      decision: 'pending',
      request: { statusHistory: { none: { fromState: { not: null } } } },
    },
    include: {
      request: { select: { id: true, tenantId: true, requesterId: true, createdAt: true, form: { select: { title: true, key: true } } } },
    },
  });

  for (const row of pendingRows) {
    const { request } = row;
    const rule = await getEscalationRule(prisma, request.tenantId, row.roleContext);
    if (!rule) continue; // no matrix entry for this stage — not escalatable

    const [onLeave, approver] = await Promise.all([
      isOnApprovedLeaveToday(row.approverId),
      prisma.user.findUnique({ where: { id: row.approverId }, select: { status: true, name: true } }),
    ]);
    const inactive = !approver || approver.status !== 'Active';
    const pendingSince = row.escalatedAt ?? request.createdAt;
    const hoursPending = (Date.now() - pendingSince.getTime()) / (1000 * 60 * 60);
    const timedOut = hoursPending >= rule.actionWindowHours;

    const cause: 'on_leave' | 'inactive' | 'timeout' | null = onLeave
      ? 'on_leave'
      : inactive
        ? 'inactive'
        : timedOut
          ? 'timeout'
          : null;
    if (!cause) continue;

    await prisma.$transaction(async (tx) => {
      const targetUserId = await resolveEscalationTarget(tx, request.tenantId, row.roleContext, [
        request.requesterId,
        row.approverId,
      ]);
      if (!targetUserId || targetUserId === row.approverId) return;

      await tx.requestApprover.update({
        where: { id: row.id },
        data: {
          approverId: targetUserId,
          escalatedFromId: row.approverId,
          escalationCause: cause,
          escalatedAt: new Date(),
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId: request.tenantId,
          actorId: null,
          entity: 'RequestApprover',
          entityId: row.id,
          action: 'escalate',
          before: { approverId: row.approverId },
          after: { approverId: targetUserId, cause },
        },
      });
      const basePayload = { requestId: request.id, formKey: request.form.key, formTitle: request.form.title, cause };
      await notificationsService.notify(tx, request.tenantId, row.approverId, {
        type: 'approval_escalated',
        payload: basePayload,
      });
      await notificationsService.notify(tx, request.tenantId, request.requesterId, {
        type: 'approval_escalated',
        payload: basePayload,
      });
    });
  }
}

/** Wires the BullMQ worker for this queue and schedules its hourly repeatable run (design.md). */
export async function scheduleEscalationSweepJob(): Promise<void> {
  const queue = new Queue(QUEUE_NAME, { connection: redisConnection });
  new Worker(QUEUE_NAME, runEscalationSweep, { connection: redisConnection });
  await queue.add(REPEATABLE_JOB_ID, {}, { repeat: { every: 60 * 60 * 1000 }, jobId: REPEATABLE_JOB_ID });
}
