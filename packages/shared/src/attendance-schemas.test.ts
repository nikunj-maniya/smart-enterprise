import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  attendanceReportQuerySchema,
  holidayCreateSchema,
  holidayListQuerySchema,
  holidayUpdateSchema,
} from './index.js';

describe('holidayCreateSchema', () => {
  it('accepts a valid date and name, trimming the name', () => {
    const parsed = holidayCreateSchema.parse({ date: '2026-01-26', name: '  Republic Day  ' });
    assert.deepEqual(parsed, { date: '2026-01-26', name: 'Republic Day' });
  });

  it('rejects a malformed date string', () => {
    assert.equal(holidayCreateSchema.safeParse({ date: '26-01-2026', name: 'X' }).success, false);
    assert.equal(holidayCreateSchema.safeParse({ date: '2026-1-26', name: 'X' }).success, false);
  });

  it('rejects an impossible calendar date', () => {
    assert.equal(holidayCreateSchema.safeParse({ date: '2026-02-30', name: 'X' }).success, false);
    assert.equal(holidayCreateSchema.safeParse({ date: '2026-13-01', name: 'X' }).success, false);
  });

  it('accepts Feb 29 only in a leap year', () => {
    assert.equal(holidayCreateSchema.safeParse({ date: '2028-02-29', name: 'X' }).success, true);
    assert.equal(holidayCreateSchema.safeParse({ date: '2026-02-29', name: 'X' }).success, false);
  });

  it('rejects an empty or whitespace-only name and names over 100 chars', () => {
    assert.equal(holidayCreateSchema.safeParse({ date: '2026-01-26', name: '' }).success, false);
    assert.equal(holidayCreateSchema.safeParse({ date: '2026-01-26', name: '   ' }).success, false);
    assert.equal(
      holidayCreateSchema.safeParse({ date: '2026-01-26', name: 'x'.repeat(101) }).success,
      false,
    );
  });
});

describe('holidayUpdateSchema', () => {
  it('rejects an empty body (at least one field required)', () => {
    assert.equal(holidayUpdateSchema.safeParse({}).success, false);
  });

  it('accepts a single-field update', () => {
    assert.equal(holidayUpdateSchema.safeParse({ name: 'Renamed' }).success, true);
    assert.equal(holidayUpdateSchema.safeParse({ date: '2026-01-27' }).success, true);
  });

  it('still validates provided fields', () => {
    assert.equal(holidayUpdateSchema.safeParse({ date: '2026-02-30' }).success, false);
  });
});

describe('holidayListQuerySchema', () => {
  it('coerces the year query string and enforces bounds', () => {
    assert.equal(holidayListQuerySchema.parse({ year: '2026' }).year, 2026);
    assert.equal(holidayListQuerySchema.safeParse({ year: '1999' }).success, false);
    assert.equal(holidayListQuerySchema.safeParse({ year: '2101' }).success, false);
    assert.equal(holidayListQuerySchema.safeParse({}).success, false);
  });
});

describe('attendanceReportQuerySchema', () => {
  it('accepts a valid month and applies pagination defaults', () => {
    const parsed = attendanceReportQuerySchema.parse({ month: '2026-06' });
    assert.equal(parsed.month, '2026-06');
    assert.equal(parsed.page, 1);
    assert.equal(parsed.pageSize, 20);
    assert.equal(parsed.includeInactive, undefined);
  });

  it('rejects malformed months', () => {
    for (const month of ['2026-13', '2026-6', '2026/06', '202606', 'junk', '2026-00']) {
      assert.equal(attendanceReportQuerySchema.safeParse({ month }).success, false, month);
    }
  });

  it('parses includeInactive as a query-string boolean (never coercing "false" to true)', () => {
    assert.equal(
      attendanceReportQuerySchema.parse({ month: '2026-06', includeInactive: 'true' }).includeInactive,
      true,
    );
    assert.equal(
      attendanceReportQuerySchema.parse({ month: '2026-06', includeInactive: 'false' }).includeInactive,
      false,
    );
    assert.equal(
      attendanceReportQuerySchema.parse({ month: '2026-06', includeInactive: 'yes' }).includeInactive,
      undefined,
    );
  });

  it('coerces pagination and enforces bounds', () => {
    const parsed = attendanceReportQuerySchema.parse({ month: '2026-06', page: '3', pageSize: '50' });
    assert.equal(parsed.page, 3);
    assert.equal(parsed.pageSize, 50);
    assert.equal(attendanceReportQuerySchema.safeParse({ month: '2026-06', page: '0' }).success, false);
    assert.equal(attendanceReportQuerySchema.safeParse({ month: '2026-06', pageSize: '101' }).success, false);
    assert.equal(attendanceReportQuerySchema.safeParse({ month: '2026-06', page: '1.5' }).success, false);
  });
});
