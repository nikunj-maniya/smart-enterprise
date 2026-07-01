## Context

The repo currently holds only the PRD and specs — no runnable app and no database schema. This change creates the skeleton and data layer every Phase-1 feature builds on. Stack is fixed by PRD §14 (Node/TS + Express + Prisma, Vite/React/shadcn, PostgreSQL, Redis, Docker). Single timezone: India (Asia/Kolkata).

## Goals / Non-Goals

**Goals:**
- A monorepo that boots end-to-end under `docker compose up`.
- A Prisma schema covering PRD §12 with enforced tenant isolation.
- A bootstrap System Admin seed.

**Non-Goals:**
- Auth, RBAC enforcement, and any business/feature logic (later changes).
- CI/CD and production deployment hardening.

## Decisions

- **Monorepo over polyrepo** — one source of truth for shared Zod types between FE and BE; simpler local dev. Alternative (separate repos) rejected: type duplication and version drift.
- **Form field storage = hybrid (JSONB payload + promoted typed columns)** — JSONB keeps arbitrary custom forms flexible; promoted columns (`start_date`, `end_date`, `total_days`, `half_day_count`, `leave_type_id`, `department_id`, `project_id`) give typed, indexed access for the absence calendar, leave balance, and dashboards. Rejected pure EAV (`RequestFieldValue`): type erosion + multi-join queries. Rejected pure JSONB: weak indexing/FK for cross-cutting queries.
- **Tenant isolation at the data-access layer** — mandatory `tenant_id` on every tenant-scoped table, enforced in the Prisma access layer (DB row-level security can be layered later). Approvers/status stay in their own normalized tables (`RequestApprover`, `RequestStatusHistory`).

## Risks / Trade-offs

- [Promoted columns duplicate data already in JSONB] → write both on submit from a single mapping; treat JSONB as source of truth, columns as derived.
- [Tenant isolation enforced only in app layer initially] → centralize all DB access through a tenant-scoped client so no query can bypass it; revisit DB-level RLS before multi-tenant production.

## Open Questions

- Auto-escalation behaviour (PRD §8.4.1 / D-32) is unresolved but only affects the approval change (`06`), not the foundation.
