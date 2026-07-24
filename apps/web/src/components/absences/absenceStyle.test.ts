import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AbsenceEntryDto } from '@se/shared';
import {
  ABSENCE_TYPE_META,
  addMonths,
  dateFromDay,
  formatDateRangeShort,
  formatDateShort,
  getMonthGrid,
  monthLabel,
  rowOverlapsDate,
  startOfMonth,
  toISODate,
} from './absenceStyle';

function row(startDate: string, endDate: string): AbsenceEntryDto {
  return {
    requestId: 'r-1',
    personId: 'p-1',
    personName: 'Ada Lovelace',
    departmentId: null,
    departmentName: null,
    projectId: null,
    projectName: null,
    type: 'leave',
    startDate,
    endDate,
    halfDayCount: null,
  };
}

test('ABSENCE_TYPE_META maps leave and wfh to distinct labels', () => {
  assert.equal(ABSENCE_TYPE_META.leave.label, 'Leave');
  assert.equal(ABSENCE_TYPE_META.wfh.label, 'WFH');
  assert.notEqual(ABSENCE_TYPE_META.leave.fg, ABSENCE_TYPE_META.wfh.fg);
});

test('toISODate zero-pads single-digit month and day', () => {
  assert.equal(toISODate(new Date(2026, 0, 5)), '2026-01-05');
  assert.equal(toISODate(new Date(2026, 10, 20)), '2026-11-20');
});

test('startOfMonth returns the first of the month regardless of the input day', () => {
  const result = startOfMonth(new Date(2026, 6, 22));
  assert.equal(toISODate(result), '2026-07-01');
});

test('addMonths adds and subtracts across a year boundary', () => {
  assert.equal(toISODate(addMonths(new Date(2026, 0, 15), -1)), '2025-12-01');
  assert.equal(toISODate(addMonths(new Date(2025, 11, 15), 1)), '2026-01-01');
});

test('monthLabel formats the month and year', () => {
  const d = new Date(2026, 0, 1);
  assert.equal(monthLabel(d), d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }));
});

test('getMonthGrid returns Sun-Sat weeks spanning the whole month with a matching from/to range', () => {
  const { from, to, weeks } = getMonthGrid(new Date(2026, 0, 1));
  assert.equal(weeks.length, 5);
  assert.equal(from, '2025-12-28');
  assert.equal(to, '2026-01-31');
  assert.equal(weeks[0][0].getDay(), 0);
  assert.equal(weeks[weeks.length - 1][6].getDay(), 6);
  assert.equal(toISODate(weeks[0][0]), from);
  assert.equal(toISODate(weeks[weeks.length - 1][6]), to);
});

test('rowOverlapsDate is true within the inclusive range and false outside it', () => {
  const r = row('2026-01-10', '2026-01-12');
  assert.equal(rowOverlapsDate(r, '2026-01-10'), true);
  assert.equal(rowOverlapsDate(r, '2026-01-11'), true);
  assert.equal(rowOverlapsDate(r, '2026-01-12'), true);
  assert.equal(rowOverlapsDate(r, '2026-01-09'), false);
  assert.equal(rowOverlapsDate(r, '2026-01-13'), false);
});

test('dateFromDay parses a plain date and tolerates a full ISO datetime without shifting the day', () => {
  const plain = dateFromDay('2026-01-31');
  assert.equal(plain.getFullYear(), 2026);
  assert.equal(plain.getMonth(), 0);
  assert.equal(plain.getDate(), 31);

  const withTime = dateFromDay('2026-01-31T23:00:00.000Z');
  assert.equal(withTime.getFullYear(), 2026);
  assert.equal(withTime.getMonth(), 0);
  assert.equal(withTime.getDate(), 31);
});

test('formatDateShort formats using the parsed local date', () => {
  assert.equal(formatDateShort('2026-03-05'), dateFromDay('2026-03-05').toLocaleDateString(undefined, { month: 'short', day: 'numeric' }));
});

test('formatDateRangeShort collapses a same-day range and joins a multi-day range with an en dash', () => {
  assert.equal(formatDateRangeShort('2026-03-05', '2026-03-05'), formatDateShort('2026-03-05'));
  assert.equal(
    formatDateRangeShort('2026-03-05', '2026-03-07'),
    `${formatDateShort('2026-03-05')} – ${formatDateShort('2026-03-07')}`,
  );
});
