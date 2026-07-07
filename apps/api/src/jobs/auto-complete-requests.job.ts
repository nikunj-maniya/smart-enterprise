import { Queue, Worker } from 'bullmq';
import { redisConnection } from '../lib/redis.js';
import { prisma } from '../prisma.js';
import { systemTransitionRequest } from '../modules/requests/transitions.service.js';

const QUEUE_NAME = 'auto-complete-requests';
const REPEATABLE_JOB_ID = 'daily-auto-complete';
const TO_STATE = 'Completed';

/** Forms whose seeded `StatusModel` declares the system-gated `Approved -> Completed` transition. */
const AUTO_COMPLETE_FORM_KEYS = ['leave', 'wfh'];

/** Midnight of today in Asia/Kolkata (UTC+5:30, no DST), expressed as the equivalent UTC instant. */
function startOfTodayIST(): Date {
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  const istNow = new Date(Date.now() + IST_OFFSET_MS);
  return new Date(
    Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), istNow.getUTCDate()) - IST_OFFSET_MS,
  );
}

/**
 * Auto-completes every Approved Leave/WFH request whose `endDate` is before today
 * (Asia/Kolkata) via `systemTransitionRequest`. Idempotent: only requests still `Approved`
 * are matched, so a request already moved to `Completed` — by a prior run or otherwise —
 * is never revisited.
 */
export async function runAutoCompleteRequests(): Promise<void> {
  const dueRequests = await prisma.request.findMany({
    where: {
      status: 'Approved',
      endDate: { lt: startOfTodayIST() },
      form: { key: { in: AUTO_COMPLETE_FORM_KEYS } },
    },
    select: { id: true, tenantId: true },
  });

  for (const { id, tenantId } of dueRequests) {
    await systemTransitionRequest(tenantId, id, TO_STATE);
  }
}

/**
 * Wires the BullMQ worker for this queue and schedules its repeatable daily run
 * (00:00 Asia/Kolkata). Call once on API boot.
 */
export async function scheduleAutoCompleteRequestsJob(): Promise<void> {
  const queue = new Queue(QUEUE_NAME, { connection: redisConnection });
  new Worker(QUEUE_NAME, runAutoCompleteRequests, { connection: redisConnection });
  await queue.add(
    REPEATABLE_JOB_ID,
    {},
    { repeat: { pattern: '0 0 * * *', tz: 'Asia/Kolkata' }, jobId: REPEATABLE_JOB_ID },
  );
}
