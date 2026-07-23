import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Prisma } from '@prisma/client';
import { prisma } from '../../prisma.js';
import { HttpError } from '../../lib/http-error.js';
import { createHoliday, deleteHoliday, listHolidays, updateHoliday } from './holidays.service.js';

/**
 * Stubbed-Prisma unit tests (item-catalog.service.test.ts pattern): CI has no live Postgres, so
 * the `holiday` delegate is redefined as an in-memory stub, plus `$transaction` runs the callback
 * against a stub `tx` exposing the same delegate plus `auditLog`.
 */

type HolidayRow = { id: string; tenantId: string; date: Date; name: string };

let holidayRows: HolidayRow[] = [];
let nextId = 1;
const auditLogs: unknown[] = [];
const findManyArgs: unknown[] = [];

function uniqueViolation(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test' });
}

Object.defineProperty(prisma, 'holiday', {
  value: {
    findMany: async (args: { where: { tenantId: string; date: { gte: Date; lt: Date } } }) => {
      findManyArgs.push(args);
      const { tenantId, date } = args.where;
      return holidayRows
        .filter((r) => r.tenantId === tenantId && r.date >= date.gte && r.date < date.lt)
        .sort((a, b) => a.date.getTime() - b.date.getTime());
    },
    findFirst: async ({ where }: { where: { id: string; tenantId: string } }) => {
      const row = holidayRows.find((r) => r.id === where.id && r.tenantId === where.tenantId);
      return row ? { ...row } : null;
    },
  },
  configurable: true,
});
Object.defineProperty(prisma, '$transaction', {
  value: async (fn: (tx: unknown) => Promise<unknown>) =>
    fn({
      holiday: {
        create: async ({ data }: { data: { tenantId: string; date: Date; name: string } }) => {
          if (holidayRows.some((r) => r.tenantId === data.tenantId && r.date.getTime() === data.date.getTime())) {
            throw uniqueViolation();
          }
          const row: HolidayRow = { id: `h${nextId++}`, ...data };
          holidayRows.push(row);
          return row;
        },
        update: async ({ where, data }: { where: { id: string }; data: { date?: Date; name?: string } }) => {
          const row = holidayRows.find((r) => r.id === where.id)!;
          if (
            data.date !== undefined &&
            holidayRows.some((r) => r.id !== row.id && r.tenantId === row.tenantId && r.date.getTime() === data.date!.getTime())
          ) {
            throw uniqueViolation();
          }
          if (data.date !== undefined) row.date = data.date;
          if (data.name !== undefined) row.name = data.name;
          return row;
        },
        delete: async ({ where }: { where: { id: string } }) => {
          holidayRows = holidayRows.filter((r) => r.id !== where.id);
        },
      },
      auditLog: { create: async ({ data }: { data: unknown }) => void auditLogs.push(data) },
    }),
  configurable: true,
});

beforeEach(() => {
  holidayRows = [];
  nextId = 1;
  auditLogs.length = 0;
  findManyArgs.length = 0;
});

describe('listHolidays', () => {
  it('scopes to the tenant and calendar year, ascending by date', async () => {
    holidayRows = [
      { id: 'h1', tenantId: 't1', date: new Date('2026-08-15T00:00:00.000Z'), name: 'Independence Day' },
      { id: 'h2', tenantId: 't1', date: new Date('2026-01-26T00:00:00.000Z'), name: 'Republic Day' },
      { id: 'h3', tenantId: 't1', date: new Date('2025-12-25T00:00:00.000Z'), name: 'Christmas (prior year)' },
    ];

    const dtos = await listHolidays('t1', 2026);

    assert.deepEqual(
      dtos.map((d) => d.name),
      ['Republic Day', 'Independence Day'],
    );
    assert.equal(dtos[0].date, '2026-01-26');
  });

  it('returns an empty list for a year with no holidays', async () => {
    assert.deepEqual(await listHolidays('t1', 2030), []);
  });
});

describe('createHoliday', () => {
  it('creates a holiday and writes an audit log', async () => {
    const dto = await createHoliday('t1', 'actor-1', { date: '2026-01-26', name: 'Republic Day' });

    assert.equal(dto.date, '2026-01-26');
    assert.equal(dto.name, 'Republic Day');
    assert.deepEqual(auditLogs[0], {
      tenantId: 't1',
      actorId: 'actor-1',
      entity: 'Holiday',
      entityId: dto.id,
      action: 'create',
      after: { date: '2026-01-26', name: 'Republic Day' },
    });
  });

  it('rejects a duplicate (tenant, date) with 409', async () => {
    holidayRows = [{ id: 'h1', tenantId: 't1', date: new Date('2026-01-26T00:00:00.000Z'), name: 'Existing' }];

    await assert.rejects(
      createHoliday('t1', 'actor-1', { date: '2026-01-26', name: 'Republic Day' }),
      (err: unknown) => err instanceof HttpError && err.status === 409,
    );
  });
});

describe('updateHoliday', () => {
  it('rejects an unknown id with 404', async () => {
    await assert.rejects(
      updateHoliday('t1', 'actor-1', 'missing', { name: 'X' }),
      (err: unknown) => err instanceof HttpError && err.status === 404,
    );
  });

  it('does not leak another tenant\'s holiday (findFirst is tenant-scoped)', async () => {
    holidayRows = [{ id: 'h1', tenantId: 'other-tenant', date: new Date('2026-01-26T00:00:00.000Z'), name: 'X' }];

    await assert.rejects(
      updateHoliday('t1', 'actor-1', 'h1', { name: 'Y' }),
      (err: unknown) => err instanceof HttpError && err.status === 404,
    );
  });

  it('updates the name only, leaving the date untouched, and audit-logs before/after', async () => {
    holidayRows = [{ id: 'h1', tenantId: 't1', date: new Date('2026-01-26T00:00:00.000Z'), name: 'Old Name' }];

    const dto = await updateHoliday('t1', 'actor-1', 'h1', { name: 'New Name' });

    assert.equal(dto.name, 'New Name');
    assert.equal(dto.date, '2026-01-26');
    assert.deepEqual(auditLogs[0], {
      tenantId: 't1',
      actorId: 'actor-1',
      entity: 'Holiday',
      entityId: 'h1',
      action: 'update',
      before: { date: '2026-01-26', name: 'Old Name' },
      after: { date: '2026-01-26', name: 'New Name' },
    });
  });

  it('rejects moving a holiday onto a date already used by another holiday (409)', async () => {
    holidayRows = [
      { id: 'h1', tenantId: 't1', date: new Date('2026-01-26T00:00:00.000Z'), name: 'Republic Day' },
      { id: 'h2', tenantId: 't1', date: new Date('2026-08-15T00:00:00.000Z'), name: 'Independence Day' },
    ];

    await assert.rejects(
      updateHoliday('t1', 'actor-1', 'h2', { date: '2026-01-26' }),
      (err: unknown) => err instanceof HttpError && err.status === 409,
    );
  });
});

describe('deleteHoliday', () => {
  it('rejects an unknown id with 404', async () => {
    await assert.rejects(
      deleteHoliday('t1', 'actor-1', 'missing'),
      (err: unknown) => err instanceof HttpError && err.status === 404,
    );
  });

  it('deletes the holiday and audit-logs the before state', async () => {
    holidayRows = [{ id: 'h1', tenantId: 't1', date: new Date('2026-01-26T00:00:00.000Z'), name: 'Republic Day' }];

    await deleteHoliday('t1', 'actor-1', 'h1');

    assert.equal(holidayRows.length, 0);
    assert.deepEqual(auditLogs[0], {
      tenantId: 't1',
      actorId: 'actor-1',
      entity: 'Holiday',
      entityId: 'h1',
      action: 'delete',
      before: { date: '2026-01-26', name: 'Republic Day' },
    });
  });
});
