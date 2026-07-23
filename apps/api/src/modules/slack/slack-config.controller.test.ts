import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { NextFunction, Request, Response } from 'express';
import * as slackConfigController from './slack-config.controller.js';

/**
 * enterprise-profile.controller.test.ts pattern: only the two handlers that validate their own
 * body with Zod before calling the service (connect, updateSettings) can be exercised without a
 * live DB — get/disconnect/test call the service immediately with no validation of their own, so
 * they're only covered pre-DB via the 401 route check in slack-config.routes.test.ts.
 */
function invoke(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<void>,
  req: Partial<Request>,
): Promise<unknown> {
  return new Promise((resolve) => {
    void handler(req as Request, {} as Response, (err?: unknown) => resolve(err));
  });
}

const ADMIN = { id: 'u1', email: 'a@b.c', isSystemAdmin: false, tenantId: 't1', roles: ['enterprise-admin'] };

describe('slack-config controller guards', () => {
  it('connect rejects a body missing every field (Zod error)', async () => {
    const err = await invoke(slackConfigController.connect, { body: {}, user: ADMIN });
    assert.ok(err instanceof Error);
    assert.equal(err.name, 'ZodError');
  });

  it('connect rejects a blank bot token (Zod min-length error)', async () => {
    const err = await invoke(slackConfigController.connect, {
      body: { botToken: '', signingSecret: 'secret', defaultChannel: '#general' },
      user: ADMIN,
    });
    assert.ok(err instanceof Error);
    assert.equal(err.name, 'ZodError');
  });

  it('connect rejects a blank default channel (Zod min-length error)', async () => {
    const err = await invoke(slackConfigController.connect, {
      body: { botToken: 'xoxb-x', signingSecret: 'secret', defaultChannel: '' },
      user: ADMIN,
    });
    assert.ok(err instanceof Error);
    assert.equal(err.name, 'ZodError');
  });

  it('updateSettings rejects a body missing the required toggle fields (Zod error)', async () => {
    const err = await invoke(slackConfigController.updateSettings, { body: {}, user: ADMIN });
    assert.ok(err instanceof Error);
    assert.equal(err.name, 'ZodError');
  });

  it('updateSettings rejects a non-boolean toggle value (Zod type error)', async () => {
    const err = await invoke(slackConfigController.updateSettings, {
      body: {
        notifyApproversOnNewRequest: 'yes',
        notifyRequesterOnDecision: true,
        notifyRequesterOnStatusChange: true,
        digestEnabled: false,
        reminderEnabled: false,
      },
      user: ADMIN,
    });
    assert.ok(err instanceof Error);
    assert.equal(err.name, 'ZodError');
  });
});
