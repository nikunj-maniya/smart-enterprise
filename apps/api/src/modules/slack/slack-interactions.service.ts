import type { SlackConfig } from '@prisma/client';
import { prisma } from '../../prisma.js';
import { HttpError } from '../../lib/http-error.js';
import { decryptSecret } from '../../lib/crypto.js';
import { decideOnRequest } from '../requests/decisions.service.js';
import * as slackClient from './slack-client.js';

interface RejectModalMetadata {
  requestId: string;
  channelId: string;
  messageTs: string;
}

/** The subset of Slack's interaction payload shapes (`block_actions` / `view_submission`) this
 *  module reads — Slack's own payload is far larger; only the fields actually used are typed. */
interface SlackInteractionPayload {
  type: 'block_actions' | 'view_submission' | string;
  user?: { id: string };
  channel?: { id: string };
  trigger_id?: string;
  message?: { ts: string };
  actions?: { action_id: string; value: string }[];
  view?: {
    callback_id: string;
    private_metadata: string;
    state: { values: Record<string, Record<string, { value: string }>> };
  };
}

/**
 * Matches the acting Slack user to an active platform account by verified email (design.md:
 * "Authorization is the platform's, not Slack's") — Slack only tells us *who clicked*; whether
 * they may act is entirely `decideOnRequest`'s call once we have a platform user id.
 */
async function matchSlackUserToPlatformUser(
  tenantId: string,
  token: string,
  slackUserId: string,
): Promise<{ id: string; name: string } | null> {
  const email = await slackClient.getUserEmail(token, slackUserId);
  if (!email) return null;
  return prisma.user.findFirst({ where: { tenantId, email, status: 'Active' }, select: { id: true, name: true } });
}

function rejectReasonModal(meta: RejectModalMetadata): Record<string, unknown> {
  return {
    type: 'modal',
    callback_id: 'reject_reason',
    private_metadata: JSON.stringify(meta),
    title: { type: 'plain_text', text: 'Reject request' },
    submit: { type: 'plain_text', text: 'Reject' },
    close: { type: 'plain_text', text: 'Cancel' },
    blocks: [
      {
        type: 'input',
        block_id: 'reason_block',
        label: { type: 'plain_text', text: 'Reason' },
        element: { type: 'plain_text_input', action_id: 'reason_input', multiline: true },
      },
    ],
  };
}

async function handleBlockAction(config: SlackConfig, payload: SlackInteractionPayload): Promise<void> {
  const action = payload.actions?.[0];
  const requestId = action?.value;
  const slackUserId = payload.user?.id;
  const channelId = payload.channel?.id;
  const messageTs = payload.message?.ts;
  if (!action || !requestId || !slackUserId || !channelId || !messageTs) return;

  const token = decryptSecret(config.botTokenEncrypted!);
  const user = await matchSlackUserToPlatformUser(config.tenantId, token, slackUserId);
  if (!user) {
    await slackClient.postEphemeral(
      token,
      channelId,
      slackUserId,
      "Your Slack account isn't linked to a Smart Enterprise user — ask your admin to check your Slack email matches your platform account.",
    );
    return;
  }

  if (action.action_id === 'approve') {
    try {
      await decideOnRequest(config.tenantId, requestId, { id: user.id }, 'approved', undefined);
      await slackClient.updateMessage(token, channelId, messageTs, `:white_check_mark: Approved by ${user.name}.`);
    } catch (err) {
      await slackClient.postEphemeral(
        token,
        channelId,
        slackUserId,
        err instanceof HttpError ? err.message : 'Could not record this approval.',
      );
    }
  } else if (action.action_id === 'reject' && payload.trigger_id) {
    // Reject always needs a reason (spec) — collect it via a modal before calling decideOnRequest.
    await slackClient.openView(token, payload.trigger_id, rejectReasonModal({ requestId, channelId, messageTs }));
  }
}

async function handleViewSubmission(config: SlackConfig, payload: SlackInteractionPayload): Promise<void> {
  if (payload.view?.callback_id !== 'reject_reason') return;
  const meta = JSON.parse(payload.view.private_metadata) as RejectModalMetadata;
  const reason = payload.view.state.values.reason_block.reason_input.value;
  const slackUserId = payload.user?.id;
  if (!slackUserId) return;

  const token = decryptSecret(config.botTokenEncrypted!);
  const user = await matchSlackUserToPlatformUser(config.tenantId, token, slackUserId);
  if (!user) return; // can only reach here after an already-authorized initial click; defensive no-op.

  try {
    await decideOnRequest(config.tenantId, meta.requestId, { id: user.id }, 'rejected', reason);
    await slackClient.updateMessage(token, meta.channelId, meta.messageTs, `:x: Rejected by ${user.name}: ${reason}`);
  } catch (err) {
    // Modal submissions have no request-scoped channel to report a failure into beyond a DM.
    await slackClient
      .postEphemeral(token, meta.channelId, slackUserId, err instanceof HttpError ? err.message : 'Could not record this rejection.')
      .catch(() => {});
  }
}

/** Dispatches an already-signature-verified Slack interaction payload. Never throws — Slack
 *  already received its 200 ack before this runs; failures are reported back into Slack itself. */
export async function handleInteraction(config: SlackConfig, payload: SlackInteractionPayload): Promise<void> {
  if (payload.type === 'block_actions') {
    await handleBlockAction(config, payload);
  } else if (payload.type === 'view_submission') {
    await handleViewSubmission(config, payload);
  }
}
