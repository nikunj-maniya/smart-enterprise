import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../../prisma.js';
import * as overviewController from './overview.controller.js';

/**
 * overview.controller.ts has no validation of its own (no query/body, no user guard) — the
 * aggregation logic is covered by overview.service.test.ts. The only thing worth exercising here
 * is the controller's own success/error wiring, so the six Prisma delegates `getOverview` reads
 * are stubbed to safe empty defaults (forms.service.test.ts pattern: PrismaClient's proxy `get`
 * trap defeats `mock.method`) rather than hitting a live DB.
 */
let tenantCountShouldThrow = false;

Object.defineProperty(prisma, 'tenant', {
  value: {
    count: async () => {
      if (tenantCountShouldThrow) throw new Error('connection refused');
      return 0;
    },
    findMany: async () => [],
  },
  configurable: true,
});
Object.defineProperty(prisma, 'user', {
  value: {
    count: async () => 0,
    findMany: async () => [],
  },
  configurable: true,
});
Object.defineProperty(prisma, 'enterpriseRegistration', {
  value: { findMany: async () => [] },
  configurable: true,
});
Object.defineProperty(prisma, 'auditLog', {
  value: { findMany: async () => [] },
  configurable: true,
});

beforeEach(() => {
  tenantCountShouldThrow = false;
});

function invoke(req: Partial<Request>): Promise<{ jsonBody: unknown; err: unknown }> {
  return new Promise((resolve) => {
    let jsonBody: unknown;
    let settled = false;
    const resolveOnce = (result: { jsonBody: unknown; err: unknown }) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    const res = { json: (body: unknown) => { jsonBody = body; } } as unknown as Response;
    const next = (err?: unknown) => resolveOnce({ jsonBody, err });
    void overviewController.get(req as Request, res, next as NextFunction).then(() => resolveOnce({ jsonBody, err: undefined }));
  });
}

describe('overview controller', () => {
  it('responds with the aggregated overview on success', async () => {
    const { jsonBody, err } = await invoke({});
    assert.equal(err, undefined);
    assert.deepEqual(jsonBody, {
      counts: { pending: 0, active: 0, users: 0, suspended: 0 },
      latestRegistrations: [],
      recentActivity: [],
    });
  });

  it('forwards a service failure to next() rather than throwing', async () => {
    tenantCountShouldThrow = true;

    const { jsonBody, err } = await invoke({});

    assert.ok(err instanceof Error);
    assert.equal((err as Error).message, 'connection refused');
    assert.equal(jsonBody, undefined);
  });
});
