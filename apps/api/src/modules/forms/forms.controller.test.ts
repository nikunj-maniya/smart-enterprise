import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Request, Response, NextFunction } from 'express';
import * as formsController from './forms.controller.js';

/** Controller-level checks with a stubbed request — exercises guards that run before the service
 *  (holidays.routes.test.ts / enterprises.controller.test.ts pattern). */
function invoke(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<void>,
  req: Partial<Request>,
): Promise<unknown> {
  return new Promise((resolve) => {
    void handler(req as Request, {} as Response, (err?: unknown) => resolve(err));
  });
}

const ADMIN = { id: 'u1', email: 'a@b.c', isSystemAdmin: false, tenantId: 't1', roles: ['enterprise-admin'] };

describe('forms controller guards', () => {
  it('list forwards a TypeError to next() when req.user is missing (no service call reached)', async () => {
    const err = await invoke(formsController.list, {});
    assert.ok(err instanceof TypeError);
  });

  it('getByKey forwards a TypeError to next() when req.user is missing', async () => {
    const err = await invoke(formsController.getByKey, { params: { key: 'leave' } });
    assert.ok(err instanceof TypeError);
  });

  it('publish rejects a blank title (Zod error → 400 via errorHandler)', async () => {
    const err = await invoke(formsController.publish, {
      body: { title: '', sections: [] },
      params: { key: 'leave' },
      user: ADMIN,
    });
    assert.ok(err instanceof Error);
    assert.equal(err.name, 'ZodError');
  });

  it('publish rejects a non-array "sections"', async () => {
    const err = await invoke(formsController.publish, {
      body: { title: 'Leave', sections: 'not-an-array' },
      params: { key: 'leave' },
      user: ADMIN,
    });
    assert.ok(err instanceof Error);
    assert.equal(err.name, 'ZodError');
  });

  it('createDraft rejects a blank title', async () => {
    const err = await invoke(formsController.createDraft, { body: { title: '' }, user: ADMIN });
    assert.ok(err instanceof Error);
    assert.equal(err.name, 'ZodError');
  });

  it('saveDraft rejects a field-set with duplicate keys', async () => {
    const err = await invoke(formsController.saveDraft, {
      body: {
        fields: [
          { key: 'dup', label: 'A', type: 'text', required: false },
          { key: 'dup', label: 'B', type: 'text', required: false },
        ],
      },
      params: { key: 'custom-form' },
      user: ADMIN,
    });
    assert.ok(err instanceof Error);
    assert.equal(err.name, 'ZodError');
  });

  it('saveDraft rejects a field missing a required label', async () => {
    const err = await invoke(formsController.saveDraft, {
      body: { fields: [{ key: 'f1', label: '', type: 'text', required: false }] },
      params: { key: 'custom-form' },
      user: ADMIN,
    });
    assert.ok(err instanceof Error);
    assert.equal(err.name, 'ZodError');
  });

  it('saveDraftRouting rejects a stageRules body missing "approvers"', async () => {
    const err = await invoke(formsController.saveDraftRouting, {
      body: { mode: 'parallel', stageRules: {} },
      params: { key: 'custom-form' },
      user: ADMIN,
    });
    assert.ok(err instanceof Error);
    assert.equal(err.name, 'ZodError');
  });

  it('saveDraftRouting rejects an approver rule with an unsupported source', async () => {
    const err = await invoke(formsController.saveDraftRouting, {
      body: { mode: 'parallel', stageRules: { approvers: [{ source: 'role', field: 'x' }] } },
      params: { key: 'custom-form' },
      user: ADMIN,
    });
    assert.ok(err instanceof Error);
    assert.equal(err.name, 'ZodError');
  });

  it('saveDraftStatusModel rejects an empty "states" array', async () => {
    const err = await invoke(formsController.saveDraftStatusModel, {
      body: { states: [], transitions: [] },
      params: { key: 'custom-form' },
      user: ADMIN,
    });
    assert.ok(err instanceof Error);
    assert.equal(err.name, 'ZodError');
  });

  it('saveDraftStatusModel rejects a transition with an empty "roles" array', async () => {
    const err = await invoke(formsController.saveDraftStatusModel, {
      body: { states: ['Draft', 'Submitted'], transitions: [{ from: 'Draft', to: 'Submitted', roles: [] }] },
      params: { key: 'custom-form' },
      user: ADMIN,
    });
    assert.ok(err instanceof Error);
    assert.equal(err.name, 'ZodError');
  });

  it('publishDraft forwards a TypeError to next() when req.user is missing', async () => {
    const err = await invoke(formsController.publishDraft, { params: { key: 'custom-form' } });
    assert.ok(err instanceof TypeError);
  });

  it('startDraft forwards a TypeError to next() when req.user is missing', async () => {
    const err = await invoke(formsController.startDraft, { params: { key: 'custom-form' } });
    assert.ok(err instanceof TypeError);
  });
});
