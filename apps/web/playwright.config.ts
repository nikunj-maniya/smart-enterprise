import { defineConfig, devices } from '@playwright/test';

/**
 * E2E tests drive a RUNNING stack — they do not start one. Before `pnpm test:e2e`:
 *   1. docker compose up -d          (postgres/redis/minio)
 *   2. pnpm --filter @se/api dev     (migrated + role-backfilled database)
 *   3. pnpm --filter @se/web dev
 * Point E2E_BASE_URL elsewhere (e.g. staging) to run the same journeys there.
 *
 * Personas come from env (tests skip themselves when unset):
 *   E2E_FINANCE_EMAIL / E2E_FINANCE_PASSWORD    finance role
 *   E2E_HR_EMAIL / E2E_HR_PASSWORD              hr-head role
 *   E2E_EMPLOYEE_EMAIL / E2E_EMPLOYEE_PASSWORD  no special roles
 *   E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD        enterprise-admin role
 *   E2E_PM_EMAIL / E2E_PM_PASSWORD              project-manager role (leave approver)
 *   E2E_TL_EMAIL / E2E_TL_PASSWORD              tech-lead role (leave approver)
 * Holiday tests create and delete their own rows; they leave the tenant unchanged.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // journeys share one tenant's data — keep them ordered
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5173',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
