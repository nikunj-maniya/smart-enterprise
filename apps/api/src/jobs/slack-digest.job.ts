import { Queue, Worker } from 'bullmq';
import { redisConnection } from '../lib/redis.js';
import { prisma } from '../prisma.js';
import { decryptSecret } from '../lib/crypto.js';
import * as slackClient from '../modules/slack/slack-client.js';

const QUEUE_NAME = 'slack-digest';
const REPEATABLE_JOB_ID = 'slack-digest-check';

function istNow(): Date {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
}

function hhmm(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function formatAbsenceDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'Asia/Kolkata' });
}

/**
 * Runs every 15 minutes (BullMQ has no native per-tenant cron); each connected, digest-enabled
 * tenant is checked against its own configured `digestTime` in Asia/Kolkata, and `lastDigestSentDate`
 * guards against sending twice within the same day if this tick and the matching minute overlap.
 * Content is availability-level only — name, type, dates — no reason/context (absence-visibility's
 * §11A rule, reused here per design.md: "digest content reuses the absence-visibility rules").
 */
export async function runSlackDigest(): Promise<void> {
  const now = istNow();
  const currentHHMM = hhmm(now);
  const today = now.toISOString().slice(0, 10);

  const configs = await prisma.slackConfig.findMany({
    where: {
      status: 'connected',
      digestEnabled: true,
      digestChannel: { not: null },
      digestTime: currentHHMM,
      botTokenEncrypted: { not: null },
    },
  });

  for (const config of configs) {
    if (config.lastDigestSentDate === today) continue;

    const dayStart = new Date(`${today}T00:00:00.000Z`);
    const dayEnd = new Date(`${today}T23:59:59.999Z`);
    const absences = await prisma.request.findMany({
      where: {
        tenantId: config.tenantId,
        status: 'Approved',
        form: { key: { in: ['leave', 'wfh'] } },
        startDate: { lte: dayEnd },
        endDate: { gte: dayStart },
      },
      include: { requester: { select: { name: true } }, form: { select: { key: true } } },
      orderBy: { requester: { name: 'asc' } },
    });

    const lines = absences.length
      ? absences
          .map(
            (a) =>
              `• ${a.requester.name} — ${a.form.key === 'leave' ? 'Leave' : 'WFH'} (${formatAbsenceDate(a.startDate!)}–${formatAbsenceDate(a.endDate!)})`,
          )
          .join('\n')
      : 'No one is away today.';

    try {
      const token = decryptSecret(config.botTokenEncrypted!);
      await slackClient.postMessage(token, config.digestChannel!, `*Today's absences*\n${lines}`);
    } catch {
      continue; // leave lastDigestSentDate untouched so the next tick can retry today
    }

    await prisma.slackConfig.update({ where: { id: config.id }, data: { lastDigestSentDate: today } });
  }
}

/** Wires the BullMQ worker + a repeatable 15-minute check. Call once on API boot. */
export async function scheduleSlackDigestJob(): Promise<void> {
  const queue = new Queue(QUEUE_NAME, { connection: redisConnection });
  new Worker(QUEUE_NAME, runSlackDigest, { connection: redisConnection });
  await queue.add(REPEATABLE_JOB_ID, {}, { repeat: { every: 15 * 60 * 1000 }, jobId: REPEATABLE_JOB_ID });
}
