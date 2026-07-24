import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../../prisma.js';
import { HttpError } from '../../lib/http-error.js';
import { getEnterpriseDetails, updateEnterpriseDetails } from './enterprise-profile.service.js';

/**
 * Prisma delegate stubs (forms.service.test.ts pattern: PrismaClient's proxy `get` trap defeats
 * `mock.method`, so the delegates + `$transaction` this service reads/writes are redefined
 * directly). No live DB in CI.
 */
type TenantRow = { id: string; name: string; industry: string | null; size: string | null; website: string | null };

let tenantById = new Map<string, TenantRow>();
const auditCreateCalls: unknown[] = [];
let updateArgs: unknown;

Object.defineProperty(prisma, 'tenant', {
  value: {
    findUnique: async (args: { where: { id: string } }) => tenantById.get(args.where.id) ?? null,
  },
  configurable: true,
});

Object.defineProperty(prisma, '$transaction', {
  value: async (cb: (tx: unknown) => Promise<unknown>) =>
    cb({
      tenant: {
        update: async (args: { where: { id: string }; data: Partial<TenantRow> }) => {
          updateArgs = args;
          const existing = tenantById.get(args.where.id)!;
          const updated = { ...existing, ...args.data };
          tenantById.set(args.where.id, updated);
          return updated;
        },
      },
      auditLog: {
        create: async (args: unknown) => {
          auditCreateCalls.push(args);
          return args;
        },
      },
    }),
  configurable: true,
});

function tenant(overrides: Partial<TenantRow> = {}): TenantRow {
  return { id: 't1', name: 'Acme Corp', industry: 'Manufacturing', size: '51-200', website: 'https://acme.test', ...overrides };
}

beforeEach(() => {
  tenantById = new Map();
  auditCreateCalls.length = 0;
  updateArgs = undefined;
});

describe('getEnterpriseDetails', () => {
  it('throws 404 when the tenant does not exist', async () => {
    await assert.rejects(getEnterpriseDetails('missing'), (err) => {
      assert.ok(err instanceof HttpError);
      assert.equal(err.status, 404);
      assert.equal(err.message, 'Enterprise not found');
      return true;
    });
  });

  it('maps the tenant row to EnterpriseDetailsDto', async () => {
    tenantById.set('t1', tenant());

    const dto = await getEnterpriseDetails('t1');

    assert.deepEqual(dto, {
      id: 't1',
      name: 'Acme Corp',
      industry: 'Manufacturing',
      size: '51-200',
      website: 'https://acme.test',
    });
  });
});

describe('updateEnterpriseDetails', () => {
  it('throws 404 before starting a transaction when the tenant does not exist', async () => {
    await assert.rejects(
      updateEnterpriseDetails('missing', 'actor-1', { name: 'New Name' }),
      (err) => {
        assert.ok(err instanceof HttpError);
        assert.equal(err.status, 404);
        return true;
      },
    );
    assert.equal(auditCreateCalls.length, 0);
  });

  it('defaults omitted optional fields (industry/size/website) to null', async () => {
    tenantById.set('t1', tenant());

    const dto = await updateEnterpriseDetails('t1', 'actor-1', { name: 'Renamed Co' });

    assert.deepEqual(dto, { id: 't1', name: 'Renamed Co', industry: null, size: null, website: null });
    assert.deepEqual((updateArgs as { data: unknown }).data, {
      name: 'Renamed Co',
      industry: null,
      size: null,
      website: null,
    });
  });

  it('persists provided optional fields as-is', async () => {
    tenantById.set('t1', tenant());

    const dto = await updateEnterpriseDetails('t1', 'actor-1', {
      name: 'Renamed Co',
      industry: 'Finance',
      size: '1-50',
      website: 'https://renamed.test',
    });

    assert.deepEqual(dto, {
      id: 't1',
      name: 'Renamed Co',
      industry: 'Finance',
      size: '1-50',
      website: 'https://renamed.test',
    });
  });

  it('records an audit log entry with before/after snapshots', async () => {
    tenantById.set('t1', tenant({ name: 'Old Name' }));

    await updateEnterpriseDetails('t1', 'actor-1', { name: 'New Name' });

    assert.equal(auditCreateCalls.length, 1);
    const { data } = auditCreateCalls[0] as { data: Record<string, unknown> };
    assert.equal(data.tenantId, 't1');
    assert.equal(data.actorId, 'actor-1');
    assert.equal(data.entity, 'Tenant');
    assert.equal(data.entityId, 't1');
    assert.equal(data.action, 'update');
    assert.equal((data.before as { name: string }).name, 'Old Name');
    assert.equal((data.after as { name: string }).name, 'New Name');
  });
});
