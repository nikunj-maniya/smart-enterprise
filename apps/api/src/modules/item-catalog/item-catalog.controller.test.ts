import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Request, Response, NextFunction } from 'express';
import { requireEnterpriseAdmin } from '../../middleware/auth.js';
import * as itemCatalogController from './item-catalog.controller.js';

/** Controller-level checks with a stubbed request — exercises guards that run before the service
 *  reaches Prisma (auth.controller.test.ts / holidays.routes.test.ts pattern). */
function invoke(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<void>,
  req: Partial<Request>,
): Promise<unknown> {
  return new Promise((resolve) => {
    void handler(req as Request, {} as Response, (err?: unknown) => resolve(err));
  });
}

describe('item-catalog requireEnterpriseAdmin guard', () => {
  it('rejects a platform System Admin (no tenant) with 403', () => {
    let outcome: unknown;
    requireEnterpriseAdmin(
      { user: { id: 'u1', email: 'a@b.c', isSystemAdmin: true, tenantId: null, roles: [] } } as Partial<Request> as Request,
      {} as Response,
      (err?: unknown) => {
        outcome = err;
      },
    );
    assert.ok(outcome instanceof Error);
    assert.equal((outcome as { status?: number }).status, 403);
  });

  it('rejects a tenant user without the enterprise-admin role with 403', () => {
    let outcome: unknown;
    requireEnterpriseAdmin(
      { user: { id: 'u1', email: 'a@b.c', isSystemAdmin: false, tenantId: 't1', roles: ['employee'] } } as Partial<Request> as Request,
      {} as Response,
      (err?: unknown) => {
        outcome = err;
      },
    );
    assert.ok(outcome instanceof Error);
    assert.equal((outcome as { status?: number }).status, 403);
  });

  it('passes the tenant Enterprise Admin through', () => {
    let outcome: unknown;
    requireEnterpriseAdmin(
      { user: { id: 'u1', email: 'a@b.c', isSystemAdmin: false, tenantId: 't1', roles: ['enterprise-admin'] } } as Partial<Request> as Request,
      {} as Response,
      (err?: unknown) => {
        outcome = err;
      },
    );
    assert.equal(outcome, undefined);
  });
});

describe('item-catalog controller guards', () => {
  it('create rejects an invalid type before touching Prisma (Zod error → 400 via errorHandler)', async () => {
    const err = await invoke(itemCatalogController.create, {
      body: { type: 'furniture', name: 'Desk' },
      user: { id: 'u1', email: 'a@b.c', isSystemAdmin: false, tenantId: 't1', roles: ['enterprise-admin'] },
    });
    assert.ok(err instanceof Error);
    assert.equal(err.name, 'ZodError');
  });

  it('create rejects a blank name (Zod error)', async () => {
    const err = await invoke(itemCatalogController.create, {
      body: { type: 'software', name: '' },
      user: { id: 'u1', email: 'a@b.c', isSystemAdmin: false, tenantId: 't1', roles: ['enterprise-admin'] },
    });
    assert.ok(err instanceof Error);
    assert.equal(err.name, 'ZodError');
  });

  it('update rejects a blank name (Zod error)', async () => {
    const err = await invoke(itemCatalogController.update, {
      params: { id: 'abc' },
      body: { name: '' },
      user: { id: 'u1', email: 'a@b.c', isSystemAdmin: false, tenantId: 't1', roles: ['enterprise-admin'] },
    });
    assert.ok(err instanceof Error);
    assert.equal(err.name, 'ZodError');
  });

  it('list forwards a synchronous error to next() when req.user is missing (no Prisma call reached)', async () => {
    const err = await invoke(itemCatalogController.list, {});
    assert.ok(err instanceof TypeError);
  });
});
