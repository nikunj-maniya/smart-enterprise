import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../prisma.js';
import { HttpError } from '../../lib/http-error.js';
import { getPreferences, isChannelEnabled, updatePreference } from './notification-preferences.js';

/** Minimal fake of the subset of Prisma.TransactionClient that isChannelEnabled actually calls. */
function fakeDb(notificationPreferences: unknown): Prisma.TransactionClient {
  return {
    user: { findUnique: async () => ({ notificationPreferences }) },
  } as unknown as Prisma.TransactionClient;
}

describe('isChannelEnabled', () => {
  it('bypasses the stored preference entirely for a mandatory type', async () => {
    // Even a db that would resolve the channel as disabled must not matter for a mandatory type.
    const db = { user: { findUnique: async () => ({ notificationPreferences: { request_needs_approval: { inApp: false } } }) } } as unknown as Prisma.TransactionClient;
    assert.equal(await isChannelEnabled(db, 'u1', 'request_needs_approval', 'inApp'), true);
    assert.equal(await isChannelEnabled(db, 'u1', 'request_needs_approval', 'slack'), true);
  });

  it('defaults a non-mandatory type/channel with no stored preference to enabled (opt-out model)', async () => {
    const db = fakeDb(null);
    assert.equal(await isChannelEnabled(db, 'u1', 'request_approved', 'inApp'), true);
    assert.equal(await isChannelEnabled(db, 'u1', 'request_approved', 'slack'), true);
  });

  it('honors an explicit false for a non-mandatory type/channel', async () => {
    const db = fakeDb({ request_approved: { inApp: false } });
    assert.equal(await isChannelEnabled(db, 'u1', 'request_approved', 'inApp'), false);
  });

  it('does not cross-apply one channel\'s disable to the other channel', async () => {
    const db = fakeDb({ request_approved: { inApp: false } });
    assert.equal(await isChannelEnabled(db, 'u1', 'request_approved', 'slack'), true);
  });
});

let storedPreferences: unknown = null;
const updateArgs: unknown[] = [];

Object.defineProperty(prisma, 'user', {
  value: {
    findUniqueOrThrow: async () => ({ notificationPreferences: storedPreferences }),
    update: async ({ data }: { data: { notificationPreferences: unknown } }) => {
      updateArgs.push(data);
      storedPreferences = data.notificationPreferences;
      return { notificationPreferences: storedPreferences };
    },
  },
  configurable: true,
});

beforeEach(() => {
  storedPreferences = null;
  updateArgs.length = 0;
});

describe('getPreferences', () => {
  it('lists every catalog type, forcing mandatory rows to inApp/slack true regardless of stored overrides', async () => {
    storedPreferences = { request_needs_approval: { inApp: false, slack: false } };

    const { rows } = await getPreferences('u1');
    const mandatoryRow = rows.find((r) => r.type === 'request_needs_approval')!;

    assert.equal(mandatoryRow.mandatory, true);
    assert.equal(mandatoryRow.inApp, true);
    assert.equal(mandatoryRow.slack, true);
  });

  it('merges a stored override for a non-mandatory type and defaults unset types to enabled', async () => {
    storedPreferences = { request_approved: { inApp: false } };

    const { rows } = await getPreferences('u1');
    const overridden = rows.find((r) => r.type === 'request_approved')!;
    const untouched = rows.find((r) => r.type === 'request_rejected')!;

    assert.equal(overridden.inApp, false);
    assert.equal(overridden.slack, true);
    assert.equal(untouched.inApp, true);
    assert.equal(untouched.slack, true);
  });
});

describe('updatePreference', () => {
  it('rejects an unknown notification type with 400', async () => {
    await assert.rejects(
      updatePreference('u1', { type: 'not_a_real_type', channel: 'inApp', enabled: false }),
      (err: unknown) => err instanceof HttpError && err.status === 400,
    );
  });

  it('rejects muting a mandatory type with 400', async () => {
    await assert.rejects(
      updatePreference('u1', { type: 'request_needs_approval', channel: 'inApp', enabled: false }),
      (err: unknown) => err instanceof HttpError && err.status === 400,
    );
  });

  it('toggles one type/channel, preserving other stored entries, and returns the merged preferences', async () => {
    storedPreferences = { request_rejected: { inApp: false } };

    const response = await updatePreference('u1', { type: 'request_approved', channel: 'slack', enabled: false });

    assert.deepEqual(updateArgs[0], {
      notificationPreferences: {
        request_rejected: { inApp: false },
        request_approved: { slack: false },
      },
    });
    const approved = response.rows.find((r) => r.type === 'request_approved')!;
    assert.equal(approved.slack, false);
    assert.equal(approved.inApp, true);
    const rejected = response.rows.find((r) => r.type === 'request_rejected')!;
    assert.equal(rejected.inApp, false);
  });
});
