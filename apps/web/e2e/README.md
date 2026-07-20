# E2E suite — isolated test stack

The journeys drive a **running stack** and never touch the dev database. Point them at an
isolated stack backed by a dedicated test DB (`smart_enterprise_test`) so test data can't
mix with real accounts.

## One-time setup

```bash
# 1. Test database (on the same dev Postgres container)
docker exec smartenterprise-postgres-1 psql -U smart -d postgres -c "CREATE DATABASE smart_enterprise_test;"
cd apps/api
DATABASE_URL="postgresql://smart:smart@localhost:5544/smart_enterprise_test?schema=public" npx prisma migrate deploy
DATABASE_URL="postgresql://smart:smart@localhost:5544/smart_enterprise_test?schema=public" \
  SYSTEM_ADMIN_EMAIL=sysadmin@e2e.test SYSTEM_ADMIN_PASSWORD='E2eSys@123' npx tsx prisma/seed.ts
```

Then seed the personas through the real app flows (register tenant → sysadmin accepts →
admin creates users + a project with the PM/TL as leads) — with the test API up (step 2
below), run the idempotent script:

```bash
node e2e/seed-personas.mjs   # from apps/web
```

All personas share `E2E_PERSONA_PASSWORD` (default `E2ePass@123`).

## Run

```bash
# 2. Isolated API (4001) — raised rate limits so parallel workers from one IP aren't throttled
cd apps/api
API_PORT=4001 DATABASE_URL="postgresql://smart:smart@localhost:5544/smart_enterprise_test?schema=public" \
  REDIS_URL="redis://localhost:6399/1" MINIO_BUCKET="e2e-test" \
  AUTH_RATE_LIMIT=100000 GLOBAL_RATE_LIMIT=100000 npx tsx src/index.ts

# 3. Isolated web (5174)
cd apps/web && VITE_API_URL=http://localhost:4001 npx vite --port 5174 --strictPort

# 4. The suite
cd apps/web
E2E_BASE_URL=http://localhost:5174 E2E_API_URL=http://localhost:4001 \
E2E_ADMIN_EMAIL=admin@e2e.test       E2E_ADMIN_PASSWORD=... \
E2E_FINANCE_EMAIL=finance@e2e.test   E2E_FINANCE_PASSWORD=... \
E2E_HR_EMAIL=hr@e2e.test             E2E_HR_PASSWORD=... \
E2E_EMPLOYEE_EMAIL=employee@e2e.test E2E_EMPLOYEE_PASSWORD=... \
E2E_PM_EMAIL=pm@e2e.test             E2E_PM_PASSWORD=... \
E2E_TL_EMAIL=tl@e2e.test             E2E_TL_PASSWORD=... \
npx playwright test
```

Personas: admin (enterprise-admin), finance, hr (hr-head), employee (no special roles),
pm (project-manager) and tl (tech-lead) — the last two are the leave request's snapshotted
approvers, so the payroll journey can approve through the decision endpoint the way the
app enforces. Tests skip themselves when a persona's env vars are unset.

To reset: `DROP DATABASE smart_enterprise_test` and repeat the setup.
