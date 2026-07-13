import { Router } from 'express';
import { prisma } from '../../prisma.js';
import { verifySlackSignature, decryptSecret } from '../../lib/crypto.js';
import { handleInteraction } from './slack-interactions.service.js';

export const slackWebhookRouter: Router = Router();

/**
 * POST /slack/interactions — Slack's interactivity endpoint. Requires the raw request body (see
 * `express.raw()` mounted ahead of the global JSON parser in index.ts) since the signature is an
 * HMAC over the exact bytes Slack sent, not a reserialized JSON object.
 *
 * `team_id` is read from the unverified body only to select *which* tenant's signing secret to
 * verify against (design.md: each tenant has its own Slack app/credentials, so there is no single
 * platform-wide secret to check first) — nothing from the body is trusted or acted on until the
 * signature check below passes.
 */
slackWebhookRouter.post('/', async (req, res) => {
  const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
  const params = new URLSearchParams(rawBody);
  const payloadStr = params.get('payload');
  if (!payloadStr) return res.status(400).end();

  let payload: { team?: { id?: string } };
  try {
    payload = JSON.parse(payloadStr);
  } catch {
    return res.status(400).end();
  }

  const teamId = payload.team?.id;
  if (!teamId) return res.status(400).end();

  const config = await prisma.slackConfig.findFirst({ where: { slackTeamId: teamId, status: 'connected' } });
  if (!config?.signingSecretEncrypted || !config.botTokenEncrypted) return res.status(401).end();

  const signature = req.header('x-slack-signature');
  const timestamp = req.header('x-slack-request-timestamp');
  if (!signature || !timestamp) return res.status(401).end();

  const signingSecret = decryptSecret(config.signingSecretEncrypted);
  if (!verifySlackSignature(signingSecret, timestamp, rawBody, signature)) return res.status(401).end();

  // Slack requires an ack within 3s; handle the (now-authenticated) action asynchronously.
  res.status(200).end();
  handleInteraction(config, JSON.parse(payloadStr)).catch((err) => {
    // eslint-disable-next-line no-console
    console.error('Slack interaction handling failed', err);
  });
});
