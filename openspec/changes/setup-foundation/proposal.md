## Why

Before any Phase-1 feature can be built, the project needs a running skeleton and a migrated database. Today the repo contains only the PRD and specs — no app, no schema. This change establishes that foundation so all feature specs (`01`–`08`) have somewhere to build.

## What Changes

- Scaffold a **monorepo**: `apps/web` (Vite + React + TS + shadcn/ui), `apps/api` (NestJS), `packages/shared` (Zod types).
- Add **`docker-compose.yml`** running `api`, `web`, `postgres`, `redis`.
- Add base config: TypeScript, ESLint/Prettier, `.env.example`, an API health-check endpoint.
- Translate the **PRD §12 data model** into a Prisma schema with mandatory `tenant_id` isolation.
- Store form answers via **hybrid JSONB payload + promoted typed columns** (the generic `RequestFieldValue` EAV table is dropped).
- Seed the **bootstrap System Admin** account (force-change on first login).

No business/feature logic — that lands in later changes.

## Capabilities

### New Capabilities
- `project-scaffold`: The monorepo skeleton and Dockerized dev runtime that the app builds on.
- `data-model`: The Prisma schema, tenant-isolation rule, field-value storage strategy, and bootstrap seed.

### Modified Capabilities
<!-- none — this is the first change -->

## Impact

- Creates `apps/web`, `apps/api`, `packages/shared`, `docker-compose.yml`, and the Prisma schema + initial migration.
- Establishes conventions (folder layout, shared types, tenant isolation) every later change depends on.
- Supersedes `specs/00-foundation.md`, which is migrated into this change.
