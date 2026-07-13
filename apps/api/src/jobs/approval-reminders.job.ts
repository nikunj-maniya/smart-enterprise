import { Queue, Worker } from 'bullmq';
import { redisConnection } from '../lib/redis.js';
import { prisma } from '../prisma.js';
import { notify } from '../modules/notifications/notifications.service.js';

const QUEUE_NAME = 'approval-reminders';
const REPEATABLE_JOB_ID = 'daily-approval-reminders';

/**
 * One reminder per approver who still has at least one pending item, each citing their total
 * pending count. "Still pending" is the same staleness rule `requests.service.listApprovalQueue`
 * applies: a `RequestApprover` row only counts if its request has never transitioned since
 * submission — once any approver has acted, every other snapshotted approver's `pending` row is
 * stale and nothing they do can matter anymore, so they aren't reminded about it. Additive, not
 * stateful (design.md): reminders aren't deduped against a prior day's reminder or a manual read.
 */
export async function runApprovalReminders(): Promise<void> {
  const pendingRows = await prisma.requestApprover.findMany({
    where: {
      decision: 'pending',
      request: { statusHistory: { none: { fromState: { not: null } } } },
    },
    select: { approverId: true, request: { select: { tenantId: true } } },
  });

  const countsByApprover = new Map<string, { tenantId: string; count: number }>();
  for (const row of pendingRows) {
    const existing = countsByApprover.get(row.approverId);
    if (existing) existing.count += 1;
    else countsByApprover.set(row.approverId, { tenantId: row.request.tenantId, count: 1 });
  }

  for (const [approverId, { tenantId, count }] of countsByApprover) {
    await prisma.$transaction((tx) =>
      notify(tx, tenantId, approverId, { type: 'approval_reminder', payload: { pendingCount: count } }),
    );
  }
}

/**
 * Wires the BullMQ worker for this queue and schedules its repeatable daily run
 * (09:00 Asia/Kolkata — a reminder lands better at start-of-day than at midnight). Call once
 * on API boot.
 */
export async function scheduleApprovalRemindersJob(): Promise<void> {
  const queue = new Queue(QUEUE_NAME, { connection: redisConnection });
  new Worker(QUEUE_NAME, runApprovalReminders, { connection: redisConnection });
  await queue.add(
    REPEATABLE_JOB_ID,
    {},
    { repeat: { pattern: '0 9 * * *', tz: 'Asia/Kolkata' }, jobId: REPEATABLE_JOB_ID },
  );
}
