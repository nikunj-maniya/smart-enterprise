import { test, expect } from '@playwright/test';
import { persona, loginAs } from './helpers';

const employee = persona('employee');
const hr = persona('hr');
const finance = persona('finance');
const admin = persona('admin');

test.describe('Permissions and regression', () => {
  test('a logged-out deep link lands on the login screen', async ({ page }) => {
    await page.goto('/reports/attendance');
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole('button', { name: 'Log In' })).toBeVisible();
  });

  test('an employee sees neither screen and deep links bounce home', async ({ page }) => {
    test.skip(!employee, 'E2E_EMPLOYEE_EMAIL / E2E_EMPLOYEE_PASSWORD not set');
    await loginAs(page, employee!);

    await expect(page.getByRole('link', { name: 'Attendance' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Holidays' })).toHaveCount(0);

    await page.goto('/reports/attendance');
    await expect(page).not.toHaveURL(/\/reports\/attendance/);
    await page.goto('/organization/holidays');
    await expect(page).not.toHaveURL(/\/organization\/holidays/);
  });

  test('HR Head manages holidays but is kept away from salary data', async ({ page }) => {
    test.skip(!hr, 'E2E_HR_EMAIL / E2E_HR_PASSWORD not set');
    await loginAs(page, hr!);

    await expect(page.getByRole('link', { name: 'Holidays' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Attendance' })).toHaveCount(0);

    await page.goto('/reports/attendance');
    await expect(page).not.toHaveURL(/\/reports\/attendance/);
  });

  test('Finance sees the report but not the holiday master', async ({ page }) => {
    test.skip(!finance, 'E2E_FINANCE_EMAIL / E2E_FINANCE_PASSWORD not set');
    await loginAs(page, finance!);

    await expect(page.getByRole('link', { name: 'Attendance' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Holidays' })).toHaveCount(0);

    await page.goto('/organization/holidays');
    await expect(page).not.toHaveURL(/\/organization\/holidays/);
  });

  test('regression: the existing Reports screen and org masters still work', async ({ page }) => {
    test.skip(!admin, 'E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD not set');
    await loginAs(page, admin!);

    await page.getByRole('link', { name: 'Reports', exact: true }).click();
    await expect(page).toHaveURL(/\/reports$/);
    await expect(page.getByRole('button', { name: 'Export absences CSV' })).toBeVisible();

    await page.goto('/organization/departments');
    await expect(page.getByRole('button', { name: /New department/i })).toBeVisible();

    // Both new screens open for the admin, who holds every permission.
    await page.goto('/reports/attendance');
    await expect(page.getByText('Working days', { exact: true })).toBeVisible();
    await page.goto('/organization/holidays');
    await expect(page.getByRole('button', { name: 'Add holiday' })).toBeVisible();
  });
});
