import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMonthContext,
  computeEmployeeDays,
  type AttendanceRequestInput,
} from './attendance-math.js';

function utc(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`);
}

function req(partial: Partial<AttendanceRequestInput> & Pick<AttendanceRequestInput, 'kind'>): AttendanceRequestInput {
  return { startDate: null, endDate: null, halfDayDates: [], ...partial };
}

describe('buildMonthContext', () => {
  it('computes working days for June 2026 (30 days, 8 weekend days)', () => {
    const ctx = buildMonthContext('2026-06', []);
    assert.equal(ctx.calendarDays, 30);
    assert.equal(ctx.weekendDays, 8);
    assert.equal(ctx.holidayCount, 0);
    assert.equal(ctx.workingDays, 22);
  });

  it('handles February in non-leap and leap years', () => {
    assert.equal(buildMonthContext('2026-02', []).calendarDays, 28);
    assert.equal(buildMonthContext('2028-02', []).calendarDays, 29);
  });

  it('subtracts a weekday holiday from the baseline', () => {
    // 2026-06-15 is a Monday.
    const ctx = buildMonthContext('2026-06', ['2026-06-15']);
    assert.equal(ctx.holidayCount, 1);
    assert.equal(ctx.workingDays, 21);
    assert.equal(ctx.workingDaySet.has('2026-06-15'), false);
  });

  it('ignores a weekend holiday (no-op) and out-of-month holidays', () => {
    // 2026-06-14 is a Sunday; 2026-07-01 is outside June.
    const ctx = buildMonthContext('2026-06', ['2026-06-14', '2026-07-01']);
    assert.equal(ctx.holidayCount, 0);
    assert.equal(ctx.workingDays, 22);
  });
});

describe('computeEmployeeDays', () => {
  const ctx = buildMonthContext('2026-06', ['2026-06-15']); // 21 working days

  it('reports full payable days for an employee with no requests', () => {
    const days = computeEmployeeDays(ctx, []);
    assert.deepEqual(days, { wfhDays: 0, paidLeaveDays: 0, unpaidLeaveDays: 0, officeDays: 21, payableDays: 21 });
  });

  it('deducts LWP from payable days; paid leave and WFH stay payable', () => {
    const days = computeEmployeeDays(ctx, [
      // 2026-06-02 (Tue) – 2026-06-03 (Wed): 2 working days of LWP.
      req({ kind: 'unpaid-leave', startDate: utc('2026-06-02'), endDate: utc('2026-06-03') }),
      // 2026-06-08 (Mon): 1 paid leave day.
      req({ kind: 'paid-leave', startDate: utc('2026-06-08'), endDate: utc('2026-06-08') }),
      // 2026-06-09 (Tue) – 2026-06-10 (Wed): 2 WFH days.
      req({ kind: 'wfh', startDate: utc('2026-06-09'), endDate: utc('2026-06-10') }),
    ]);
    assert.equal(days.unpaidLeaveDays, 2);
    assert.equal(days.paidLeaveDays, 1);
    assert.equal(days.wfhDays, 2);
    assert.equal(days.payableDays, 19);
    assert.equal(days.officeDays, 16);
  });

  it('clips a Fri–Mon range to its working days (weekend excluded)', () => {
    // 2026-06-05 is a Friday, 2026-06-08 the following Monday.
    const days = computeEmployeeDays(ctx, [
      req({ kind: 'unpaid-leave', startDate: utc('2026-06-05'), endDate: utc('2026-06-08') }),
    ]);
    assert.equal(days.unpaidLeaveDays, 2);
  });

  it('clips a range spanning the month boundary to in-month days only', () => {
    // May 28 (Thu) – Jun 2 (Tue): only Jun 1 + Jun 2 are in June.
    const days = computeEmployeeDays(ctx, [
      req({ kind: 'paid-leave', startDate: utc('2026-05-28'), endDate: utc('2026-06-02') }),
    ]);
    assert.equal(days.paidLeaveDays, 2);
  });

  it('does not count leave on a holiday', () => {
    // 2026-06-15 is the holiday Monday.
    const days = computeEmployeeDays(ctx, [
      req({ kind: 'unpaid-leave', startDate: utc('2026-06-15'), endDate: utc('2026-06-15') }),
    ]);
    assert.equal(days.unpaidLeaveDays, 0);
    assert.equal(days.payableDays, 21);
  });

  it('counts a half-day date as 0.5, only on working days', () => {
    const days = computeEmployeeDays(ctx, [
      req({
        kind: 'paid-leave',
        startDate: utc('2026-06-02'),
        endDate: utc('2026-06-03'),
        halfDayDates: ['2026-06-02'],
      }),
    ]);
    assert.equal(days.paidLeaveDays, 1.5);
  });

  it('never double-counts a day covered by two approved leaves', () => {
    const days = computeEmployeeDays(ctx, [
      req({ kind: 'unpaid-leave', startDate: utc('2026-06-02'), endDate: utc('2026-06-04') }),
      req({ kind: 'unpaid-leave', startDate: utc('2026-06-03'), endDate: utc('2026-06-05') }),
    ]);
    assert.equal(days.unpaidLeaveDays, 4); // Jun 2,3,4,5 — not 6.
  });

  it('classifies an overlapped day by precedence: unpaid > paid > WFH', () => {
    const days = computeEmployeeDays(ctx, [
      req({ kind: 'wfh', startDate: utc('2026-06-02'), endDate: utc('2026-06-02') }),
      req({ kind: 'paid-leave', startDate: utc('2026-06-02'), endDate: utc('2026-06-02') }),
      req({ kind: 'unpaid-leave', startDate: utc('2026-06-02'), endDate: utc('2026-06-02') }),
    ]);
    assert.deepEqual(
      { wfh: days.wfhDays, paid: days.paidLeaveDays, unpaid: days.unpaidLeaveDays },
      { wfh: 0, paid: 0, unpaid: 1 },
    );
  });

  it('keeps the full day when a half-day and a full-day request of equal kind overlap', () => {
    const days = computeEmployeeDays(ctx, [
      req({
        kind: 'paid-leave',
        startDate: utc('2026-06-02'),
        endDate: utc('2026-06-02'),
        halfDayDates: ['2026-06-02'],
      }),
      req({ kind: 'paid-leave', startDate: utc('2026-06-02'), endDate: utc('2026-06-02') }),
    ]);
    assert.equal(days.paidLeaveDays, 1);
  });

  it('skips requests with missing promoted dates', () => {
    const days = computeEmployeeDays(ctx, [
      req({ kind: 'unpaid-leave', startDate: utc('2026-06-02'), endDate: null }),
      req({ kind: 'unpaid-leave', startDate: null, endDate: utc('2026-06-03') }),
    ]);
    assert.equal(days.unpaidLeaveDays, 0);
  });

  it('floors officeDays at 0 when absences exceed working days', () => {
    const days = computeEmployeeDays(ctx, [
      req({ kind: 'unpaid-leave', startDate: utc('2026-06-01'), endDate: utc('2026-06-30') }),
    ]);
    assert.equal(days.unpaidLeaveDays, 21);
    assert.equal(days.officeDays, 0);
    assert.equal(days.payableDays, 0);
  });
});
