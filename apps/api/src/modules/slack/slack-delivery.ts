import { Queue } from 'bullmq';
import type { SlackConfig } from '@prisma/client';
import { redisConnection } from '../../lib/redis.js';
import { prisma } from '../../prisma.js';
import { decryptSecret } from '../../lib/crypto.js';
import * as slackClient from './slack-client.js';

export const SLACK_DELIVERY_QUEUE = 'slack-delivery';

/** Maps a mirrored in-app notification type to the tenant toggle that gates it (design.md:
 *  "mirror in-app notification triggers... each behind its toggle"). Types absent from this map
 *  are in-app only — never mirrored. */
const TRIGGER_TOGGLE: Record<string, keyof Pick<
  SlackConfig,
  'notifyApproversOnNewRequest' | 'notifyRequesterOnDecision' | 'notifyRequesterOnStatusChange' | 'reminderEnabled'
>> = {
  request_needs_approval: 'notifyApproversOnNewRequest',
  request_approved: 'notifyRequesterOnDecision',
  request_rejected: 'notifyRequesterOnDecision',
  request_decision_update: 'notifyRequesterOnDecision',
  request_status_changed: 'notifyRequesterOnStatusChange',
  approval_reminder: 'reminderEnabled',
};

export interface SlackDeliveryJobData {
  tenantId: string;
  userId: string;
  type: string;
  payload: Record<string, unknown>;
}

let queue: Queue<SlackDeliveryJobData> | null = null;
function getQueue(): Queue<SlackDeliveryJobData> {
  queue ??= new Queue(SLACK_DELIVERY_QUEUE, { connection: redisConnection });
  return queue;
}

/**
 * Fire-and-forget mirror of one in-app notification to Slack (called from the notifications
 * module's single write chokepoint). Never throws, never awaited by the caller — enqueue failure
 * must not affect in-app delivery (spec: "Slack delivery failures SHALL NOT block or delay
 * in-app notifications").
 */
export function mirrorToSlack(tenantId: string, userId: string, type: string, payload: unknown): void {
  const toggleKey = TRIGGER_TOGGLE[type];
  if (!toggleKey) return;
  getQueue()
    .add(
      'deliver',
      { tenantId, userId, type, payload: payload as Record<string, unknown> },
      { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
    )
    .catch(() => {});
}

function formatMessage(type: string, payload: Record<string, unknown>): { text: string; blocks?: unknown[] } {
  const formTitle = String(payload.formTitle ?? 'Request');
  switch (type) {
    case 'request_needs_approval': {
      const requesterName = String(payload.requesterName ?? 'Someone');
      const requestId = String(payload.requestId);
      return {
        text: `${formTitle} from ${requesterName} needs your approval.`,
        blocks: [
          { type: 'section', text: { type: 'mrkdwn', text: `*${formTitle}* from *${requesterName}* needs your approval.` } },
          {
            type: 'actions',
            block_id: 'approval_actions',
            elements: [
              { type: 'button', text: { type: 'plain_text', text: 'Approve' }, style: 'primary', action_id: 'approve', value: requestId },
              { type: 'button', text: { type: 'plain_text', text: 'Reject' }, style: 'danger', action_id: 'reject', value: requestId },
            ],
          },
        ],
      };
    }
    case 'request_approved':
      return { text: `Your ${formTitle} was approved by ${String(payload.approverName ?? 'an approver')}.` };
    case 'request_rejected':
      return { text: `Your ${formTitle} was rejected by ${String(payload.approverName ?? 'an approver')}.` };
    case 'request_decision_update':
      return { text: `${String(payload.approverName ?? 'A co-approver')} ${payload.decision === 'approved' ? 'approved' : 'rejected'} your ${formTitle}.` };
    case 'request_status_changed':
      return { text: `Your ${formTitle} is now ${String(payload.toState ?? 'updated')}.` };
    case 'approval_reminder':
      return { text: `You have ${String(payload.pendingCount ?? 0)} request(s) awaiting your approval.` };
    default:
      return { text: `${formTitle} update.` };
  }
}

/** BullMQ worker processor — resolves the tenant's config/toggle, resolves the target user's
 *  Slack DM by verified email, and posts. A dead/misconfigured integration degrades silently
 *  (spec: in-app is unaffected either way); errors here only affect retry/backoff of this job. */
export async function deliverToSlack(data: SlackDeliveryJobData): Promise<void> {
  const config = await prisma.slackConfig.findUnique({ where: { tenantId: data.tenantId } });
  if (!config || config.status !== 'connected' || !config.botTokenEncrypted) return;

  const toggleKey = TRIGGER_TOGGLE[data.type];
  if (!toggleKey || !config[toggleKey]) return;

  const user = await prisma.user.findUnique({ where: { id: data.userId }, select: { email: true, status: true } });
  if (!user || user.status !== 'Active') return;

  const token = decryptSecret(config.botTokenEncrypted);
  const { text, blocks } = formatMessage(data.type, data.payload);

  // `chat.postMessage` accepts a user id as the channel, sending a DM without a separate
  // conversations.open call — but we only have their email, so resolve the Slack user id first.
  const slackUserId = await slackClient.lookupUserIdByEmail(token, user.email);
  if (!slackUserId) return;

  await slackClient.postMessage(token, slackUserId, text, blocks);
}
