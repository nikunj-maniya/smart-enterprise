import { expect, type Page } from '@playwright/test';

export interface Credentials {
  email: string;
  password: string;
}

/** Reads E2E_<NAME>_EMAIL / E2E_<NAME>_PASSWORD; tests skip themselves when a persona is unset. */
export function persona(name: 'finance' | 'hr' | 'employee' | 'admin'): Credentials | null {
  const key = name.toUpperCase();
  const email = process.env[`E2E_${key}_EMAIL`];
  const password = process.env[`E2E_${key}_PASSWORD`];
  return email && password ? { email, password } : null;
}

/** Logs in through the real form, exactly as a user would. */
export async function loginAs(page: Page, creds: Credentials): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(creds.email);
  await page.getByLabel('Password').fill(creds.password);
  await page.getByRole('button', { name: 'Log In' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
}

/** A weekday `YYYY-MM-DD` in December of the current year, offset to dodge collisions between runs. */
export function uniqueWeekdayDate(offset = 0): string {
  const year = new Date().getFullYear();
  for (let day = 1 + ((Date.now() + offset) % 20); ; day++) {
    const d = new Date(Date.UTC(year, 11, day));
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) return d.toISOString().slice(0, 10);
  }
}

/** Deletes a holiday by name via the UI if present — used as test cleanup. */
export async function deleteHolidayIfPresent(page: Page, name: string): Promise<void> {
  await page.goto('/organization/holidays');
  const deleteButton = page.getByRole('button', { name: `Delete ${name}` });
  if ((await deleteButton.count()) === 0) return;
  await deleteButton.first().click();
  await page.getByRole('button', { name: 'Delete holiday' }).click();
  await expect(page.getByText('Holiday deleted')).toBeVisible();
}
