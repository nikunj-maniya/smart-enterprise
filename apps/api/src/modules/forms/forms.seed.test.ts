import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CORE_FORMS } from './core-forms.js';
import { seedTenantCoreForms } from './forms.seed.js';

/**
 * `seedTenantCoreForms` and `publishDefinition` (which it calls) take their `tx` as a plain
 * parameter rather than reaching for the `prisma` singleton, so this suite fakes that
 * `Prisma.TransactionClient` directly in-memory instead of stubbing `prisma`'s delegates
 * (forms.service.test.ts / item-catalog.service.test.ts pattern otherwise) — no live Postgres
 * needed either way. Nested `sections: { create: [...] }` / `fields: { create: [...] }` writes are
 * modeled structurally, matching what `insertDefinition` (forms.service.ts) actually sends.
 */

type FakeDefinition = {
  id: string;
  tenantId: string;
  key: string;
  title: string;
  version: number;
  status: string;
};

let definitions: FakeDefinition[] = [];
let nextId = 1;
const auditLogs: unknown[] = [];
const createdKeys: string[] = [];

function fakeTx() {
  return {
    formDefinition: {
      findFirst: async ({
        where,
        orderBy,
      }: {
        where: { tenantId: string; key: string; status?: string };
        orderBy?: { version: 'desc' };
      }) => {
        let rows = definitions.filter(
          (d) => d.tenantId === where.tenantId && d.key === where.key && (where.status === undefined || d.status === where.status),
        );
        if (orderBy?.version === 'desc') rows = [...rows].sort((a, b) => b.version - a.version);
        return rows[0] ?? null;
      },
      create: async ({
        data,
      }: {
        data: { tenantId: string; key: string; title: string; version: number; status: string };
      }) => {
        createdKeys.push(data.key);
        const def: FakeDefinition = {
          id: `def${nextId++}`,
          tenantId: data.tenantId,
          key: data.key,
          title: data.title,
          version: data.version,
          status: data.status,
        };
        definitions.push(def);
        // insertDefinition's `include: fullInclude` shape — empty relations are fine, since
        // `seedTenantCoreForms` never reads the returned DTO's body.
        return { ...def, sections: [], approvalWorkflow: null, statusModel: null };
      },
    },
    auditLog: { create: async ({ data }: { data: unknown }) => void auditLogs.push(data) },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

beforeEach(() => {
  definitions = [];
  nextId = 1;
  auditLogs.length = 0;
  createdKeys.length = 0;
});

describe('seedTenantCoreForms', () => {
  it('publishes all four core forms (leave, wfh, visitor, it) for a fresh tenant', async () => {
    await seedTenantCoreForms(fakeTx(), 't1', 'actor-1');

    assert.deepEqual(createdKeys, ['leave', 'wfh', 'visitor', 'it']);
    assert.equal(definitions.length, 4);
    assert.ok(definitions.every((d) => d.tenantId === 't1' && d.status === 'published' && d.version === 1));
    assert.equal(auditLogs.length, 4);
  });

  it('is idempotent: skips a key that already has a published version, creating none of it again', async () => {
    definitions = [{ id: 'existing-1', tenantId: 't1', key: 'leave', title: 'Leave Request', version: 1, status: 'published' }];

    await seedTenantCoreForms(fakeTx(), 't1', 'actor-1');

    // Only the other three core forms get created — 'leave' is left untouched.
    assert.deepEqual(createdKeys, ['wfh', 'visitor', 'it']);
    assert.equal(definitions.filter((d) => d.key === 'leave').length, 1);
  });

  it('does not skip a key whose only existing row is a draft (not yet published)', async () => {
    definitions = [{ id: 'draft-1', tenantId: 't1', key: 'leave', title: 'Leave Request', version: 1, status: 'draft' }];

    await seedTenantCoreForms(fakeTx(), 't1', 'actor-1');

    assert.ok(createdKeys.includes('leave'));
    assert.equal(definitions.filter((d) => d.key === 'leave' && d.status === 'published').length, 1);
  });

  it('scopes the idempotency check by tenant — another tenant already having "leave" published does not block this one', async () => {
    definitions = [{ id: 'other-tenant-1', tenantId: 'other-tenant', key: 'leave', title: 'Leave Request', version: 1, status: 'published' }];

    await seedTenantCoreForms(fakeTx(), 't1', 'actor-1');

    assert.ok(createdKeys.includes('leave'));
  });

  it('seeds exactly CORE_FORMS.length forms, none more or fewer', async () => {
    await seedTenantCoreForms(fakeTx(), 't1', 'actor-1');
    assert.equal(createdKeys.length, CORE_FORMS.length);
  });
});
