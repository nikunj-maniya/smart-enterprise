import { test, expect } from '@playwright/test';
import { persona, loginAs, uniqueWeekdayDate, deleteHolidayIfPresent } from './helpers';

const hr = persona('hr');

test.describe('Holiday master (HR Head journey)', () => {
  test.skip(!hr, 'E2E_HR_EMAIL / E2E_HR_PASSWORD not set');

  test.beforeEach(async ({ page }) => {
    await loginAs(page, hr!);
  });

  test('HR creates, renames, and deletes a holiday end to end', async ({ page }) => {
    const name = `E2E Founders Day ${Date.now()}`;
    const renamed = `${name} (observed)`;
    try {
      await page.getByRole('link', { name: 'Holidays' }).click();
      await expect(page).toHaveURL(/\/organization\/holidays/);

      await page.getByRole('button', { name: 'Add holiday' }).click();
      await page.getByLabel('Date').fill(uniqueWeekdayDate());
      await page.getByLabel('Holiday name').fill(name);
      await page.getByRole('button', { name: 'Save' }).click();
      await expect(page.getByText('Holiday added')).toBeVisible();
      await expect(page.getByText(name)).toBeVisible();

      await page.getByRole('button', { name: `Edit ${name}` }).click();
      await page.getByLabel('Holiday name').fill(renamed);
      await page.getByRole('button', { name: 'Save' }).click();
      await expect(page.getByText('Holiday updated')).toBeVisible();
      await expect(page.getByText(renamed)).toBeVisible();

      await page.getByRole('button', { name: `Delete ${renamed}` }).click();
      await page.getByRole('button', { name: 'Delete holiday' }).click();
      await expect(page.getByText('Holiday deleted')).toBeVisible();
      await expect(page.getByText(renamed)).toHaveCount(0);
    } finally {
      await deleteHolidayIfPresent(page, name);
      await deleteHolidayIfPresent(page, renamed);
    }
  });

  test('the form refuses an empty date, then an empty name', async ({ page }) => {
    await page.goto('/organization/holidays');
    await page.getByRole('button', { name: 'Add holiday' }).click();

    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Date is required.')).toBeVisible();

    await page.getByLabel('Date').fill(uniqueWeekdayDate());
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Holiday name is required.')).toBeVisible();

    await page.getByRole('button', { name: 'Cancel' }).click();
  });

  test('a duplicate date is refused with the error at the date field', async ({ page }) => {
    const date = uniqueWeekdayDate(7);
    const name = `E2E Dup ${Date.now()}`;
    try {
      await page.goto('/organization/holidays');
      await page.getByRole('button', { name: 'Add holiday' }).click();
      await page.getByLabel('Date').fill(date);
      await page.getByLabel('Holiday name').fill(name);
      await page.getByRole('button', { name: 'Save' }).click();
      await expect(page.getByText('Holiday added')).toBeVisible();

      await page.getByRole('button', { name: 'Add holiday' }).click();
      await page.getByLabel('Date').fill(date);
      await page.getByLabel('Holiday name').fill(`${name} again`);
      await page.getByRole('button', { name: 'Save' }).click();
      await expect(page.getByText(/already exists on this date/i)).toBeVisible();
      await page.getByRole('button', { name: 'Cancel' }).click();
    } finally {
      await deleteHolidayIfPresent(page, name);
    }
  });

  test('the year filter scopes the list', async ({ page }) => {
    const name = `E2E Year Scope ${Date.now()}`;
    const year = new Date().getFullYear();
    try {
      await page.goto('/organization/holidays');
      await page.getByRole('button', { name: 'Add holiday' }).click();
      await page.getByLabel('Date').fill(uniqueWeekdayDate(3));
      await page.getByLabel('Holiday name').fill(name);
      await page.getByRole('button', { name: 'Save' }).click();
      await expect(page.getByText('Holiday added')).toBeVisible();

      await page.getByRole('combobox', { name: 'Year' }).selectOption(String(year + 1));
      await expect(page.getByText(name)).toHaveCount(0);
      await page.getByRole('combobox', { name: 'Year' }).selectOption(String(year));
      await expect(page.getByText(name)).toBeVisible();
    } finally {
      await deleteHolidayIfPresent(page, name);
    }
  });

  test('acting on a holiday deleted elsewhere surfaces a not-found error', async ({
    page,
    context,
  }) => {
    const name = `E2E Stale ${Date.now()}`;
    try {
      await page.goto('/organization/holidays');
      await page.getByRole('button', { name: 'Add holiday' }).click();
      await page.getByLabel('Date').fill(uniqueWeekdayDate(11));
      await page.getByLabel('Holiday name').fill(name);
      await page.getByRole('button', { name: 'Save' }).click();
      await expect(page.getByText('Holiday added')).toBeVisible();

      // A second tab (same session) deletes the row while the first still shows it.
      const other = await context.newPage();
      await deleteHolidayIfPresent(other, name);
      await other.close();

      await page.getByRole('button', { name: `Edit ${name}` }).click();
      await page.getByLabel('Holiday name').fill(`${name} v2`);
      await page.getByRole('button', { name: 'Save' }).click();
      await expect(page.getByText('Holiday not found')).toBeVisible();
      await page.getByRole('button', { name: 'Cancel' }).click();
    } finally {
      await deleteHolidayIfPresent(page, name);
    }
  });

  test('a Saturday holiday is accepted but flagged as a weekend', async ({ page }) => {
    const year = new Date().getFullYear();
    // First Saturday of December this year.
    const first = new Date(Date.UTC(year, 11, 1));
    const saturday = new Date(Date.UTC(year, 11, 1 + ((6 - first.getUTCDay() + 7) % 7)));
    const name = `E2E Weekend ${Date.now()}`;
    try {
      await page.goto('/organization/holidays');
      await page.getByRole('button', { name: 'Add holiday' }).click();
      await page.getByLabel('Date').fill(saturday.toISOString().slice(0, 10));
      await page.getByLabel('Holiday name').fill(name);
      await page.getByRole('button', { name: 'Save' }).click();
      await expect(page.getByText('Holiday added')).toBeVisible();

      const row = page.locator('div', { hasText: name }).filter({ hasText: 'Weekend' });
      await expect(row.first()).toBeVisible();
    } finally {
      await deleteHolidayIfPresent(page, name);
    }
  });
});
