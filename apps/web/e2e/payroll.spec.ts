import { test, expect } from '@playwright/test';
import { persona, loginAs } from './helpers';
import {
  cancelRequest,
  createApprovedLwpLeave,
  csvRowByEmail,
  fetchAttendanceCsv,
  nextTwoWeekdaySpan,
} from './fixtures';

const finance = persona('finance');
const hr = persona('hr');
const employee = persona('employee');

/**
 * The payroll-math journey (closes change task 5.2): an employee's approved
 * 2-day LWP leave must show up for Finance as exactly +2 unpaid days and
 * −2 payable days. Arranged via the real request/approval API, asserted via
 * the CSV Finance actually downloads from the UI. Cleaned up by cancelling
 * the leave (cancelled requests never count).
 *
 * Assumes the employee has no other approved absence on the two fixture days
 * (per-day de-duplication would otherwise absorb the delta).
 */
test.describe('Payroll math end to end', () => {
  test.skip(!finance || !hr || !employee, 'finance/hr/employee personas not set');

  test('an approved 2-day LWP leave moves payable days by exactly −2', async ({
    page,
    request,
  }) => {
    test.skip(!nextTwoWeekdaySpan(), 'fewer than two weekdays left in the current month');
    test.setTimeout(120_000);

    const month = new Date().toISOString().slice(0, 7);
    const before = csvRowByEmail(
      await fetchAttendanceCsv(request, finance!, month),
      employee!.email,
    );
    test.skip(!before, 'employee not present in the attendance report');

    const leave = await createApprovedLwpLeave(request, employee!, hr!);
    test.skip(!leave, 'tenant lacks a department/project/project-manager for the leave form');

    try {
      await loginAs(page, finance!);
      await page.goto('/reports/attendance');
      const downloadPromise = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Export CSV' }).click();
      const download = await downloadPromise;
      const csv = await (await import('node:fs/promises')).readFile(await download.path(), 'utf8');

      const after = csvRowByEmail(csv, employee!.email);
      expect(after).not.toBeNull();
      expect(Number(after!['Unpaid Leave (LWP)'])).toBe(Number(before!['Unpaid Leave (LWP)']) + 2);
      expect(Number(after!['Payable Days'])).toBe(Number(before!['Payable Days']) - 2);
      expect(Number(after!['Paid Leave'])).toBe(Number(before!['Paid Leave']));
      expect(Number(after!['Working Days'])).toBe(Number(before!['Working Days']));
    } finally {
      if (leave) await cancelRequest(request, hr!, leave.requestId);
    }

    // Cancellation restores the baseline — the report must forget the leave entirely.
    const reverted = csvRowByEmail(
      await fetchAttendanceCsv(request, finance!, month),
      employee!.email,
    );
    expect(Number(reverted!['Payable Days'])).toBe(Number(before!['Payable Days']));
  });
});
