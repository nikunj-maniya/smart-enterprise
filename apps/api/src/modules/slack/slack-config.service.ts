import type { ConnectSlackRequest, SlackConfigDto, UpdateSlackSettingsRequest } from '@se/shared';
import type { SlackConfig } from '@prisma/client';
import { prisma } from '../../prisma.js';
import { HttpError } from '../../lib/http-error.js';
import { decryptSecret, encryptSecret } from '../../lib/crypto.js';
import * as slackClient from './slack-client.js';

function toDto(row: SlackConfig): SlackConfigDto {
  return {
    status: row.status as SlackConfigDto['status'],
    workspaceName: row.workspaceName,
    defaultChannel: row.defaultChannel,
    notifyApproversOnNewRequest: row.notifyApproversOnNewRequest,
    notifyRequesterOnDecision: row.notifyRequesterOnDecision,
    notifyRequesterOnStatusChange: row.notifyRequesterOnStatusChange,
    digestEnabled: row.digestEnabled,
    digestChannel: row.digestChannel,
    digestTime: row.digestTime,
    reminderEnabled: row.reminderEnabled,
    lastErrorMessage: row.lastErrorMessage,
  };
}

/** GET /slack/config — the tenant's Slack config, creating the (disconnected) singleton row on first read. */
export async function getConfig(tenantId: string): Promise<SlackConfigDto> {
  const row = await prisma.slackConfig.upsert({ where: { tenantId }, create: { tenantId }, update: {} });
  return toDto(row);
}

/**
 * POST /slack/config/connect — verifies the credentials via `auth.test` before ever persisting
 * them (design.md: "decrypt-on-use only", never trust unverified input); on success, stores both
 * encrypted and captures `slackTeamId` so the interaction webhook can route back to this tenant.
 */
export async function connect(tenantId: string, actorId: string, input: ConnectSlackRequest): Promise<SlackConfigDto> {
  let auth: { team: string; teamId: string };
  try {
    auth = await slackClient.authTest(input.botToken);
  } catch {
    throw new HttpError(400, 'Could not verify these Slack credentials. Check the bot token and try again.');
  }

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.slackConfig.upsert({
      where: { tenantId },
      create: {
        tenantId,
        status: 'connected',
        workspaceName: auth.team,
        slackTeamId: auth.teamId,
        defaultChannel: input.defaultChannel,
        botTokenEncrypted: encryptSecret(input.botToken),
        signingSecretEncrypted: encryptSecret(input.signingSecret),
      },
      update: {
        status: 'connected',
        workspaceName: auth.team,
        slackTeamId: auth.teamId,
        defaultChannel: input.defaultChannel,
        botTokenEncrypted: encryptSecret(input.botToken),
        signingSecretEncrypted: encryptSecret(input.signingSecret),
        lastErrorMessage: null,
      },
    });
    await tx.auditLog.create({
      data: {
        tenantId,
        actorId,
        entity: 'SlackConfig',
        entityId: row.id,
        action: 'connect',
        after: { workspaceName: row.workspaceName, defaultChannel: row.defaultChannel },
      },
    });
    return row;
  });

  return toDto(updated);
}

/** POST /slack/config/disconnect — clears credentials; in-app notifications are unaffected. */
export async function disconnect(tenantId: string, actorId: string): Promise<SlackConfigDto> {
  const existing = await prisma.slackConfig.findUnique({ where: { tenantId } });
  if (!existing) throw new HttpError(404, 'Slack is not configured for this tenant');

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.slackConfig.update({
      where: { tenantId },
      data: {
        status: 'disconnected',
        workspaceName: null,
        slackTeamId: null,
        botTokenEncrypted: null,
        signingSecretEncrypted: null,
        lastErrorMessage: null,
      },
    });
    await tx.auditLog.create({
      data: { tenantId, actorId, entity: 'SlackConfig', entityId: row.id, action: 'disconnect' },
    });
    return row;
  });

  return toDto(updated);
}

/** POST /slack/config/test — sends a real test message to the configured default channel. */
export async function testConnection(tenantId: string, actorId: string): Promise<void> {
  const row = await prisma.slackConfig.findUnique({ where: { tenantId } });
  if (!row || row.status !== 'connected' || !row.botTokenEncrypted || !row.defaultChannel) {
    throw new HttpError(400, 'Connect a Slack workspace and set a default channel first.');
  }

  try {
    const token = decryptSecret(row.botTokenEncrypted);
    await slackClient.postMessage(token, row.defaultChannel, 'This is a test message from Smart Enterprise — your Slack integration is connected.');
  } catch (err) {
    await prisma.slackConfig.update({
      where: { tenantId },
      data: { status: 'error', lastErrorMessage: err instanceof Error ? err.message : 'Test message failed' },
    });
    throw new HttpError(400, 'Could not send a test message. Check the bot token has access to the default channel.');
  }

  await prisma.auditLog.create({
    data: { tenantId, actorId, entity: 'SlackConfig', entityId: row.id, action: 'test-connection' },
  });
}

/** PUT /slack/config/settings — toggles + digest config only; never touches credentials. */
export async function updateSettings(
  tenantId: string,
  actorId: string,
  input: UpdateSlackSettingsRequest,
): Promise<SlackConfigDto> {
  const existing = await prisma.slackConfig.upsert({ where: { tenantId }, create: { tenantId }, update: {} });

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.slackConfig.update({
      where: { tenantId },
      data: {
        defaultChannel: input.defaultChannel ?? existing.defaultChannel,
        notifyApproversOnNewRequest: input.notifyApproversOnNewRequest,
        notifyRequesterOnDecision: input.notifyRequesterOnDecision,
        notifyRequesterOnStatusChange: input.notifyRequesterOnStatusChange,
        digestEnabled: input.digestEnabled,
        digestChannel: input.digestChannel ?? null,
        digestTime: input.digestTime ?? null,
        reminderEnabled: input.reminderEnabled,
      },
    });
    await tx.auditLog.create({
      data: {
        tenantId,
        actorId,
        entity: 'SlackConfig',
        entityId: row.id,
        action: 'update-settings',
        before: toDto(existing),
        after: toDto(row),
      },
    });
    return row;
  });

  return toDto(updated);
}
