## 1. Repo Scaffold

- [x] 1.1 Initialize monorepo with `apps/web`, `apps/api`, `packages/shared`
- [x] 1.2 Scaffold `apps/web` (Vite + React + TS + shadcn/ui)
- [x] 1.3 Scaffold `apps/api` (Node.js + TypeScript + Express) with a health-check endpoint
- [x] 1.4 Add base config: TypeScript, ESLint/Prettier, `.env.example`
- [x] 1.5 Add `docker-compose.yml` for `api`, `web`, `postgres`, `redis`

## 2. Data Model

- [x] 2.1 Add Prisma to `apps/api` and configure the Postgres datasource
- [x] 2.2 Model PRD §12 entities with mandatory `tenant_id` (drop `RequestFieldValue`)
- [x] 2.3 Add `Request.payload` JSONB + promoted typed columns
- [x] 2.4 Create the initial migration
- [x] 2.5 Add a seed for the bootstrap System Admin (hashed password, force-change flag)

## 3. Verify

- [x] 3.1 `postgres` + `redis` start via `docker compose` (host ports 5544/6399 to avoid local conflicts). NOTE: `api`/`web` Dockerfiles are written but their images are not yet built — both were verified by running locally via pnpm.
- [x] 3.2 Web app loads (verified via headless render of `/login`); API `/health` verified via curl. FE→API data wiring lands with the real screens.
- [x] 3.3 `prisma migrate` runs clean (all 22 §12 tables created) and the seed creates the System Admin
