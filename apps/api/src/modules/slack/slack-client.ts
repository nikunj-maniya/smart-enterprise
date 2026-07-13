const SLACK_API = 'https://slack.com/api';

interface SlackApiResult {
  ok: boolean;
  error?: string;
  [key: string]: unknown;
}

async function callSlack(token: string, method: string, body: Record<string, unknown>): Promise<SlackApiResult> {
  const res = await fetch(`${SLACK_API}/${method}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as SlackApiResult;
  if (!json.ok) throw new Error(`Slack API error (${method}): ${json.error ?? 'unknown_error'}`);
  return json;
}

/** Verifies a bot token and returns the connected workspace's name + team id. */
export async function authTest(token: string): Promise<{ team: string; teamId: string }> {
  const res = await callSlack(token, 'auth.test', {});
  return { team: String(res.team), teamId: String(res.team_id) };
}

export async function postMessage(
  token: string,
  channel: string,
  text: string,
  blocks?: unknown[],
): Promise<{ ts: string; channel: string }> {
  const res = await callSlack(token, 'chat.postMessage', { channel, text, ...(blocks ? { blocks } : {}) });
  return { ts: String(res.ts), channel: String(res.channel) };
}

export async function updateMessage(token: string, channel: string, ts: string, text: string, blocks?: unknown[]): Promise<void> {
  await callSlack(token, 'chat.update', { channel, ts, text, blocks: blocks ?? [] });
}

export async function postEphemeral(token: string, channel: string, user: string, text: string): Promise<void> {
  await callSlack(token, 'chat.postEphemeral', { channel, user, text });
}

/** Resolves a Slack user id to their verified Slack profile email, if any. */
export async function getUserEmail(token: string, slackUserId: string): Promise<string | null> {
  const res = await callSlack(token, 'users.info', { user: slackUserId });
  const profile = res.user as { profile?: { email?: string } } | undefined;
  return profile?.profile?.email ?? null;
}

/** The inverse lookup — a platform user's email to their Slack user id, so a mirrored
 *  notification can DM them without a prior `conversations.open` call. */
export async function lookupUserIdByEmail(token: string, email: string): Promise<string | null> {
  try {
    const res = await callSlack(token, 'users.lookupByEmail', { email });
    const user = res.user as { id?: string } | undefined;
    return user?.id ?? null;
  } catch {
    return null;
  }
}

export async function openView(token: string, triggerId: string, view: Record<string, unknown>): Promise<void> {
  await callSlack(token, 'views.open', { trigger_id: triggerId, view });
}
