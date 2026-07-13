import { Worker } from 'bullmq';
import { redisConnection } from '../lib/redis.js';
import { SLACK_DELIVERY_QUEUE, deliverToSlack, type SlackDeliveryJobData } from '../modules/slack/slack-delivery.js';

/** Wires the BullMQ worker that consumes jobs `mirrorToSlack` enqueues — retries on failure
 *  (BullMQ default backoff), never affects in-app delivery either way. Call once on API boot. */
export function startSlackDeliveryWorker(): void {
  new Worker<SlackDeliveryJobData>(SLACK_DELIVERY_QUEUE, (job) => deliverToSlack(job.data), {
    connection: redisConnection,
  });
}
