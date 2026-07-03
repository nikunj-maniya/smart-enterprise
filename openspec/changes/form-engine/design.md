## Context

Builds on `setup-foundation` (the `FormDefinition`/`FormSection`/`FormField`/`ApprovalWorkflow`/`StatusModel`/`Request`/`RequestStatusHistory` tables already exist, with hybrid JSONB payload + promoted typed columns and no EAV table) and `org-masters` (users/roles/projects the pickers resolve against). PRD §6 (form engine), §6.3–§6.5 (field types, conditional logic, versioning), and §9 (status lifecycle) govern behaviour. This change ships engine + APIs + renderer, not the request-type UIs — those land in `leave-wfh-requests`, `visitor-management`, and `it-requests`.

## Goals / Non-Goals

**Goals:**
- Published, versioned, tenant-scoped form metadata served to a React renderer.
- One server-side validation path that any submission (core or custom form) flows through.
- A per-form state machine with role gates, immutable history, and the daily auto-complete job.
- The four core forms seeded as metadata for every active tenant.

**Non-Goals:**
- The form-builder UI (Phase 3, `form-builder`) — this change edits definitions only via seed/API.
- Approval semantics (parallel voting, escalation) — `approval-workflow`.
- Leave-balance math — `leave-wfh-requests`; this change only exposes the restore hook.
- The generic renderer for custom forms (Phase 3); the core renderer is built so it can be reused there.

## Decisions

- **Visibility/validation rules stored as declarative JSON, evaluated by one shared engine** — a small rule grammar (`{ field, op, value }` with `and`/`or` composition) lives in `packages/shared` and is executed identically by the renderer (live UX) and the API (authoritative re-validation). Alternative — free-form JS expressions — rejected: not safely evaluable server-side and not authorable by a no-code builder later.
- **Zod schema is derived from metadata at validation time** — the API compiles a definition version into a Zod schema (field types + validation + conditional requiredness) and caches it per `(definitionId, version)`. Alternative — hand-written schemas per form — rejected: defeats the metadata-driven point and breaks custom forms.
- **Version = row, not diff** — publishing clones the definition into a new immutable row-set with `version + 1` (`@@unique(tenantId, key, version)` already enforces this); `Request.formVersion` pins forever. Simple, queryable, and archive-safe; storage cost is negligible at this scale.
- **Hidden ⇒ absent** — server-side, a field whose visibility rule evaluates false must be absent from the payload; its presence is a validation error, not silently dropped. This makes the client and server contracts identical and prevents smuggling values past conditional logic (PRD §13 server-side re-validation).
- **Promoted columns extracted server-side, never client-supplied** — `startDate`, `totalDays`, `leaveTypeId`, etc. are derived from the validated payload by a per-form-key extractor map, so the JSONB and typed columns can never disagree.
- **State machine executes in one transaction** — gate check (role + declared transition) → status update → history append happen atomically via `prisma.$transaction`, with the request row locked to serialize concurrent transitions.
- **Auto-complete via BullMQ repeatable job** — one daily job (Asia/Kolkata midnight) per PRD §14/§9 rather than per-request delayed jobs; a single indexed query (`status = Approved AND endDate < today`) keeps it cheap and idempotent on re-run.
- **Seeding runs on tenant activation** — the core-form seed is a function invoked by the existing Accept flow (and a backfill script for already-active tenants), not a global migration, because definitions are tenant-scoped.

## Risks / Trade-offs

- [Rule grammar too weak for a future form] → the grammar is versioned inside the JSON (`v: 1`); new operators extend it without breaking stored rules.
- [Zod-from-metadata compiler bugs bypass validation] → property-style tests assert renderer and server agree on the same payload fixtures for every seeded core form.
- [Concurrent transitions race (e.g. approve vs withdraw)] → row-level lock inside the transition transaction; second writer re-reads state and fails the gate cleanly.
- [Seed drift between tenants after PRD tweaks] → seeds are idempotent and versioned; re-running upgrades a tenant's core definitions by publishing a new version, never mutating the old one.

## Open Questions

<!-- none — signature/file-upload field types render as disabled stubs until Phase 4 object storage lands -->
