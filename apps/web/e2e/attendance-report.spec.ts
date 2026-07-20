import { readFile } from 'node:fs/promises';
import { test, expect } from '@playwright/test';
import { persona, loginAs } from './helpers';
import { splitCsvLine } from './fixtures';

const finance = persona('finance');

test.describe('Attendance report (Finance journey)', () => {
  test.skip(!finance, 'E2E_FINANCE_EMAIL / E2E_FINANCE_PASSWORD not set');

  test.beforeEach(async ({ page }) => {
    await loginAs(page, finance!);
    await page.getByRole('link', { name: 'Attendance' }).click();
    await expect(page).toHaveURL(/\/reports\/attendance/);
  });

  test('the month summary adds up and the table (or empty state) renders', async ({ page }) => {
    const stat = async (label: string) =>
      Number(
        await page
          .locator('div', { has: page.getByText(label, { exact: true }) })
          .locator('div')
          .first()
          .innerText(),
      );

    await expect(page.getByText('Working days', { exact: true })).toBeVisible();
    const calendar = await stat('Calendar days');
    const weekends = await stat('Weekend days');
    const holidays = await stat('Holidays');
    const working = await stat('Working days');
    expect(working).toBe(calendar - weekends - holidays);

    // Data-dependent: either employees render with a Payable column, or the empty state shows.
    const table = page.getByText('Payable', { exact: true });
    const empty = page.getByText('No employees to report');
    await expect(table.or(empty)).toBeVisible();
  });

  test('the current month is flagged partial and the stepper stops at it', async ({ page }) => {
    await expect(page.getByText(/still in progress/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Next month' })).toBeDisabled();

    await page.getByRole('button', { name: 'Previous month' }).click();
    await expect(page.getByText(/still in progress/)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Next month' })).toBeEnabled();

    await page.getByRole('button', { name: 'Next month' }).click();
    await expect(page.getByRole('button', { name: 'Next month' })).toBeDisabled();
  });

  test('filtering by department and including inactive both reload the report', async ({
    page,
  }) => {
    const department = page.getByRole('combobox', { name: 'Department' });
    const options = department.locator('option');
    if ((await options.count()) > 1) {
      await department.selectOption({ index: 1 });
      await expect(
        page.getByText('Payable', { exact: true }).or(page.getByText('No employees to report')),
      ).toBeVisible();
    }

    const toggle = page.getByRole('switch', { name: 'Include inactive' });
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
  });

  test('Export CSV downloads a well-formed attendance-YYYY-MM.csv', async ({ page }) => {
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export CSV' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^attendance-\d{4}-\d{2}\.csv$/);

    const csv = await readFile(await download.path(), 'utf8');
    const [headerLine, ...rows] = csv.trim().split('\n');
    expect(splitCsvLine(headerLine)).toEqual([
      'Employee',
      'Email',
      'Departments',
      'Status',
      'Joined',
      'Working Days',
      'WFH Days',
      'Paid Leave',
      'Unpaid Leave (LWP)',
      'Office Days',
      'Payable Days',
    ]);
    for (const row of rows) {
      expect(splitCsvLine(row)).toHaveLength(11);
    }
  });

  test('a failed export shows its error inline and clears on a filter change', async ({ page }) => {
    await page.route('**/reports/attendance/export*', (route) => route.abort());
    await page.getByRole('button', { name: 'Export CSV' }).click();
    await expect(page.getByText(/Unable to export|failed/i)).toBeVisible();

    await page.unroute('**/reports/attendance/export*');
    await page.getByRole('button', { name: 'Previous month' }).click();
    await expect(page.getByText(/Unable to export|failed/i)).toHaveCount(0);
  });

  test('an API failure shows the error state, and Retry recovers', async ({ page }) => {
    await page.route('**/reports/attendance*', (route) => route.abort());
    await page.reload();
    await expect(page.getByText('Retry')).toBeVisible();

    await page.unroute('**/reports/attendance*');
    await page.getByRole('button', { name: 'Retry' }).click();
    await expect(page.getByText('Working days', { exact: true })).toBeVisible();
  });
});
