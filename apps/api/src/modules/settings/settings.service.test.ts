import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../../prisma.js';
import { getSettings, updateSettings } from './settings.service.js';

/**
 * Stubbed-Prisma suite (forms.service.test.ts pattern): PrismaClient exposes its delegates via a
 * proxy `get` trap, so `mock.method` can't see them — redefine the delegates this service reads
 * or writes as stubs backed by the mutable rows below, reset in `beforeEach`.
 */

type SettingsRow = {
  forcePasswordChangeOnFirstLogin: boolean;
  allowPublicRegistration: boolean;
  notifyOnNewRegistration: boolean;
};

let settingsRow: SettingsRow = {
  forcePasswordChangeOnFirstLogin: true,
  allowPublicRegistration: true,
  notifyOnNewRegistration: true,
};

const calls = {
  upsert: [] as unknown[],
  txUpdate: [] as unknown[],
  txAuditLogCreate: [] as unknown[],
  transactions: 0,
};

const txStub = {
  platformSettings: {
    update: async (args: { data: Record<string, unknown> }) => {
      calls.txUpdate.push(args);
      settingsRow = { ...settingsRow, ...(args.data as Partial<SettingsRow>) };
      return settingsRow;
    },
  },
  auditLog: {
    create: async (args: unknown) => {
      calls.txAuditLogCreate.push(args);
    },
  },
};

Object.defineProperty(prisma, 'platformSettings', {
  value: {
    upsert: async (args: unknown) => {
      calls.upsert.push(args);
      return settingsRow;
    },
  },
  configurable: true,
});
Object.defineProperty(prisma, '$transaction', {
  value: async (fn: (tx: typeof txStub) => Promise<unknown>) => {
    calls.transactions += 1;
    return fn(txStub);
  },
  configurable: true,
});

beforeEach(() => {
  settingsRow = {
    forcePasswordChangeOnFirstLogin: true,
    allowPublicRegistration: true,
    notifyOnNewRegistration: true,
  };
  for (const arr of Object.values(calls)) {
    if (Array.isArray(arr)) arr.length = 0;
  }
  calls.transactions = 0;
});

describe('getSettings', () => {
  it('upserts the singleton row and maps it to the DTO', async () => {
    settingsRow = {
      forcePasswordChangeOnFirstLogin: false,
      allowPublicRegistration: true,
      notifyOnNewRegistration: false,
    };

    const dto = await getSettings();

    assert.deepEqual(calls.upsert[0], { where: { id: 'singleton' }, create: {}, update: {} });
    assert.deepEqual(dto, settingsRow);
  });
});

describe('updateSettings', () => {
  it('applies a partial update inside a transaction and returns the updated DTO', async () => {
    const dto = await updateSettings({ allowPublicRegistration: false }, 'admin1');

    assert.equal(calls.transactions, 1);
    assert.deepEqual((calls.txUpdate[0] as { where: unknown; data: unknown }).where, { id: 'singleton' });
    assert.deepEqual((calls.txUpdate[0] as { data: Record<string, unknown> }).data, {
      allowPublicRegistration: false,
      updatedBy: 'admin1',
    });
    assert.equal(dto.allowPublicRegistration, false);
  });

  it('logs a before/after audit entry against the singleton settings entity', async () => {
    await updateSettings({ notifyOnNewRegistration: false }, 'admin1');

    const auditArgs = calls.txAuditLogCreate[0] as { data: Record<string, unknown> };
    assert.equal(auditArgs.data.actorId, 'admin1');
    assert.equal(auditArgs.data.entity, 'PlatformSettings');
    assert.equal(auditArgs.data.entityId, 'singleton');
    assert.equal(auditArgs.data.action, 'update');
    assert.deepEqual(auditArgs.data.before, {
      forcePasswordChangeOnFirstLogin: true,
      allowPublicRegistration: true,
      notifyOnNewRegistration: true,
    });
    assert.deepEqual(auditArgs.data.after, {
      forcePasswordChangeOnFirstLogin: true,
      allowPublicRegistration: true,
      notifyOnNewRegistration: false,
    });
  });

  it('leaves fields not present in the input unchanged', async () => {
    settingsRow = {
      forcePasswordChangeOnFirstLogin: false,
      allowPublicRegistration: true,
      notifyOnNewRegistration: true,
    };

    const dto = await updateSettings({ notifyOnNewRegistration: false }, 'admin1');

    assert.equal(dto.forcePasswordChangeOnFirstLogin, false);
    assert.equal(dto.allowPublicRegistration, true);
  });
});
