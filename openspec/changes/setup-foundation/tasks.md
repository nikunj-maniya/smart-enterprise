## 1. Repo Scaffold

- [ ] 1.1 Initialize monorepo with `apps/web`, `apps/api`, `packages/shared`
- [ ] 1.2 Scaffold `apps/web` (Vite + React + TS + shadcn/ui)
- [ ] 1.3 Scaffold `apps/api` (NestJS) with a health-check endpoint
- [ ] 1.4 Add base config: TypeScript, ESLint/Prettier, `.env.example`
- [ ] 1.5 Add `docker-compose.yml` for `api`, `web`, `postgres`, `redis`

## 2. Data Model

- [ ] 2.1 Add Prisma to `apps/api` and configure the Postgres datasource
- [ ] 2.2 Model PRD §12 entities with mandatory `tenant_id` (drop `RequestFieldValue`)
- [ ] 2.3 Add `Request.payload` JSONB + promoted typed columns
- [ ] 2.4 Create the initial migration
- [ ] 2.5 Add a seed for the bootstrap System Admin (hashed password, force-change flag)

## 3. Verify

- [ ] 3.1 `docker compose up` starts all four services cleanly
- [ ] 3.2 Web app loads and calls the API health endpoint successfully
- [ ] 3.3 `prisma migrate` runs clean and the seed creates the System Admin
