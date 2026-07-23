import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Request, Response, NextFunction } from 'express';
import * as registrationsController from './registrations.controller.js';

/** Controller-level checks with a stubbed request — exercises Zod guards that run before the
 * service reaches Prisma (holidays.routes.test.ts / org-users.controller.test.ts pattern). */
function invoke(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<void>,
  req: Partial<Request>,
): Promise<unknown> {
  return new Promise((resolve) => {
    void handler(req as Request, {} as Response, (err?: unknown) => resolve(err));
  });
}

const SYSTEM_ADMIN = { id: 'u1', email: 'a@b.c', isSystemAdmin: true, tenantId: null, roles: [] };

describe('registrations controller guards', () => {
  it('submit rejects a body missing required fields (Zod error → 400 via errorHandler)', async () => {
    const err = await invoke(registrationsController.submit, { body: { companyName: 'Acme' } });
    assert.ok(err instanceof Error);
    assert.equal(err.name, 'ZodError');
  });

  it('submit rejects a password shorter than 8 characters', async () => {
    const err = await invoke(registrationsController.submit, {
      body: {
        companyName: 'Acme',
        industry: 'Tech',
        size: '1-10',
        contactName: 'Alice',
        contactEmail: 'alice@acme.com',
        password: 'short',
      },
    });
    assert.ok(err instanceof Error);
    assert.equal(err.name, 'ZodError');
  });

  it('submit rejects an invalid contact email', async () => {
    const err = await invoke(registrationsController.submit, {
      body: {
        companyName: 'Acme',
        industry: 'Tech',
        size: '1-10',
        contactName: 'Alice',
        contactEmail: 'not-an-email',
        password: 'password123',
      },
    });
    assert.ok(err instanceof Error);
    assert.equal(err.name, 'ZodError');
  });

  it('list rejects a non-numeric page before calling the service', async () => {
    const err = await invoke(registrationsController.list, { query: { page: 'abc' } });
    assert.ok(err instanceof Error);
    assert.equal(err.name, 'ZodError');
  });

  it('list rejects a pageSize over the max of 100', async () => {
    const err = await invoke(registrationsController.list, { query: { pageSize: '500' } });
    assert.ok(err instanceof Error);
    assert.equal(err.name, 'ZodError');
  });

  it('reject rejects a body with a blank reason before calling the service', async () => {
    const err = await invoke(registrationsController.reject, {
      body: { reason: '' },
      params: { id: 'r1' },
      user: SYSTEM_ADMIN,
    });
    assert.ok(err instanceof Error);
    assert.equal(err.name, 'ZodError');
  });

  it('accept forwards a TypeError to next() when req.user is missing (no Prisma call reached)', async () => {
    const err = await invoke(registrationsController.accept, { params: { id: 'r1' } });
    assert.ok(err instanceof TypeError);
  });
});
