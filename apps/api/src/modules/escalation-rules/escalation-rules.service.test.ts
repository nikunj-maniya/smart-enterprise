import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../../prisma.js';
import { HttpError } from '../../lib/http-error.js';
import { listEscalationRules, updateEscalationRule } from './escalation-rules.service.js';

/**
 * Stubbed-Prisma unit tests (holidays.service.test.ts pattern): CI has no live Postgres, so the
 * `escalationRule` and `role` delegates are redefined as in-memory stubs, plus `$transaction` runs
 * the callback against a stub `tx` exposing `escalationRule` and `auditLog`.
 */

type RuleRow = { id: string; tenantId: string; fromContext: string; toRoleId: string; actionWindowHours: number };
type RoleRow = { id: string; tenantId: string; name: string };

let ruleRows: RuleRow[] = [];
let roleRows: RoleRow[] = [];
const auditLogs: unknown[] = [];

function withToRole(row: RuleRow) {
  return { ...row, toRole: { name: roleRows.find((r) => r.id === row.toRoleId)?.name ?? '' } };
}

Object.defineProperty(prisma, 'escalationRule', {
  value: {
    findMany: async ({ where }: { where: { tenantId: string } }) =>
      ruleRows
        .filter((r) => r.tenantId === where.tenantId)
        .sort((a, b) => a.fromContext.localeCompare(b.fromContext))
        .map(withToRole),
    findFirst: async ({ where }: { where: { id: string; tenantId: string } }) => {
      const row = ruleRows.find((r) => r.id === where.id && r.tenantId === where.tenantId);
      return row ? { ...row } : null;
    },
  },
  configurable: true,
});
Object.defineProperty(prisma, 'role', {
  value: {
    findFirst: async ({ where }: { where: { id: string; tenantId: string } }) => {
      const row = roleRows.find((r) => r.id === where.id && r.tenantId === where.tenantId);
      return row ? { ...row } : null;
    },
  },
  configurable: true,
});
Object.defineProperty(prisma, '$transaction', {
  value: async (fn: (tx: unknown) => Promise<unknown>) =>
    fn({
      escalationRule: {
        update: async ({
          where,
          data,
        }: {
          where: { id: string };
          data: { toRoleId: string; actionWindowHours: number };
        }) => {
          const row = ruleRows.find((r) => r.id === where.id)!;
          row.toRoleId = data.toRoleId;
          row.actionWindowHours = data.actionWindowHours;
          return withToRole(row);
        },
      },
      auditLog: { create: async ({ data }: { data: unknown }) => void auditLogs.push(data) },
    }),
  configurable: true,
});

beforeEach(() => {
  ruleRows = [];
  roleRows = [
    { id: 'role-hr-head', tenantId: 't1', name: 'HR Head' },
    { id: 'role-tech-lead', tenantId: 't1', name: 'Tech Lead' },
    { id: 'role-other-tenant', tenantId: 'other-tenant', name: 'Other Tenant Role' },
  ];
  auditLogs.length = 0;
});

describe('listEscalationRules', () => {
  it('scopes to the tenant, ordered by fromContext ascending, with the resolved role name', async () => {
    ruleRows = [
      { id: 'r1', tenantId: 't1', fromContext: 'tech-lead', toRoleId: 'role-hr-head', actionWindowHours: 48 },
      { id: 'r2', tenantId: 't1', fromContext: 'department-head', toRoleId: 'role-tech-lead', actionWindowHours: 24 },
      { id: 'r3', tenantId: 'other-tenant', fromContext: 'aaa', toRoleId: 'role-other-tenant', actionWindowHours: 12 },
    ];

    const dtos = await listEscalationRules('t1');

    assert.deepEqual(
      dtos.map((d) => d.fromContext),
      ['department-head', 'tech-lead'],
    );
    assert.equal(dtos[0].toRoleName, 'Tech Lead');
    assert.equal(dtos[1].toRoleName, 'HR Head');
  });

  it('returns an empty list for a tenant with no configured rows', async () => {
    assert.deepEqual(await listEscalationRules('t1'), []);
  });
});

describe('updateEscalationRule', () => {
  it('rejects an unknown id with 404', async () => {
    await assert.rejects(
      updateEscalationRule('t1', 'actor-1', 'missing', { toRoleId: 'role-hr-head', actionWindowHours: 24 }),
      (err: unknown) => err instanceof HttpError && err.status === 404,
    );
  });

  it("does not leak another tenant's rule (findFirst is tenant-scoped) — 404", async () => {
    ruleRows = [
      { id: 'r1', tenantId: 'other-tenant', fromContext: 'tech-lead', toRoleId: 'role-other-tenant', actionWindowHours: 48 },
    ];

    await assert.rejects(
      updateEscalationRule('t1', 'actor-1', 'r1', { toRoleId: 'role-hr-head', actionWindowHours: 24 }),
      (err: unknown) => err instanceof HttpError && err.status === 404,
    );
  });

  it('rejects an unknown target role with 400', async () => {
    ruleRows = [{ id: 'r1', tenantId: 't1', fromContext: 'tech-lead', toRoleId: 'role-hr-head', actionWindowHours: 48 }];

    await assert.rejects(
      updateEscalationRule('t1', 'actor-1', 'r1', { toRoleId: 'missing-role', actionWindowHours: 24 }),
      (err: unknown) => err instanceof HttpError && err.status === 400,
    );
  });

  it("rejects a target role that belongs to another tenant with 400 (role lookup is tenant-scoped)", async () => {
    ruleRows = [{ id: 'r1', tenantId: 't1', fromContext: 'tech-lead', toRoleId: 'role-hr-head', actionWindowHours: 48 }];

    await assert.rejects(
      updateEscalationRule('t1', 'actor-1', 'r1', { toRoleId: 'role-other-tenant', actionWindowHours: 24 }),
      (err: unknown) => err instanceof HttpError && err.status === 400,
    );
  });

  it('updates the target role and action window, and audit-logs before/after', async () => {
    ruleRows = [{ id: 'r1', tenantId: 't1', fromContext: 'tech-lead', toRoleId: 'role-hr-head', actionWindowHours: 48 }];

    const dto = await updateEscalationRule('t1', 'actor-1', 'r1', { toRoleId: 'role-tech-lead', actionWindowHours: 96 });

    assert.equal(dto.toRoleId, 'role-tech-lead');
    assert.equal(dto.toRoleName, 'Tech Lead');
    assert.equal(dto.actionWindowHours, 96);
    assert.deepEqual(auditLogs[0], {
      tenantId: 't1',
      actorId: 'actor-1',
      entity: 'EscalationRule',
      entityId: 'r1',
      action: 'update',
      before: { toRoleId: 'role-hr-head', actionWindowHours: 48 },
      after: { toRoleId: 'role-tech-lead', actionWindowHours: 96 },
    });
  });
});
