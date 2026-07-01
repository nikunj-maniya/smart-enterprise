---
name: form-scaffold
description: Scaffold a new metadata-driven request form (e.g. Visitor, IT Change) or add a field/approval stage to an existing one, touching every layer the smartEnterprise form engine requires — Prisma FormDefinition metadata, shared Zod schema, backend routes, and the React renderer (PRD §6-§9). Use when adding a new core or custom form, adding a field type, or wiring approval routing / a status model for a form.
---

Scaffold (or extend) a form in the smartEnterprise metadata-driven form engine, keeping every layer in sync: Prisma metadata → shared Zod types → backend routes/workflow → frontend renderer.

**Read `PRD.md` §6 (Form Engine), §7 (the four core forms), §8 (Approval Workflow), and §9 (Status Lifecycle) before starting** — this skill assumes you know the shape described there. If the requested form/field isn't already specified in the PRD, ask the user for the field list, approver dropdowns, conditional rules, and status states before writing any code.

## Before touching anything

1. Confirm the **form key** (e.g. `leave`, `wfh`, `visitor`, `it-change`) and whether it's a **core** (hand-built renderer) or **generic** (no-code/metadata-only renderer) form per §6.1.
2. List the fields with type, required flag, `optionsSource` (e.g. `users`, `projects`), validation, and any `visibility` (conditional show/hide) rules — from PRD §7 if it's one of the four core forms, otherwise from the user.
3. List the approver dropdowns this form needs and what role/context filters them (e.g. Tech Lead dropdown filtered to the selected project's assigned TLs — §8.2), and any conditional approval stages (§8.3, e.g. HR Head required only when `>2 days`).
4. List the status states and allowed transitions (§9), and which role may trigger each transition.
5. **Surgical scope**: only touch the files this specific form needs. Do not refactor other forms' code, shared utilities beyond what's required, or existing renderers while you're in there.

## Layers to update

Follow the existing `apps/api/src/modules/<name>/` convention (see `modules/auth` and `modules/registrations` for the `*.controller.ts` / `*.service.ts` / `*.routes.ts` split).

1. **`packages/shared/src`** — add the Zod schema for this form's field values (one schema, reused by both the API validator and the `react-hook-form` resolver — don't hand-roll a second copy). Add/extend shared types for `FormDefinition`/`FormField` metadata if this introduces a new field `type` not already modeled.
2. **`apps/api/prisma/schema.prisma`** — extend `FormDefinition` / `FormSection` / `FormField` rows (metadata, not schema changes, unless a genuinely new column is needed) and any form-specific entity (e.g. `Visitor` extends `Request` per §12's data model). Remember `tenant_id` on anything new — see the [[tenant-rbac-guard]] agent, which you should run once the routes exist.
3. **`apps/api/src/modules/<form-key>/`** — routes + service for: create/submit, list (role-and-status filtered per §11A — never return more than the viewer is entitled to), approve/reject (parallel approval, self-approval blocked, snapshot the resolved approver set onto the request per §8.2), and any fulfilment/status-transition endpoints specific to this form (e.g. IT's Approved → In Progress → Fulfilled). Re-validate all conditional field logic and required fields **server-side** — never trust the client (§6.4).
4. **`apps/web/src`** — for a **core** form, a hand-built form component under a form-specific folder using `react-hook-form` + the Zod resolver from step 1, with the approver dropdowns wired to the filtered options endpoints. For a **generic** form, ensure the metadata alone (from step 2) is sufficient for the generic renderer — don't write a bespoke component.
5. **Notifications** — wire the triggers this form needs per §11 (new submission → approvers; every status transition → requester + relevant roles), reusing the existing notification dispatch rather than inventing a parallel path.

## Versioning

If you're **modifying** an existing published form (not creating a new one), publishing the change must create a new immutable version (§6.5); in-flight requests stay pinned to the version they were submitted on. Don't let a metadata edit retroactively change already-submitted requests' schema.

## Verification

- Add/extend tests covering: required-field enforcement, each conditional-visibility rule, the approver dropdown's filtering (role/project), the parallel-approval + self-approval-escalation path, and every status transition's role gate.
- Once the backend routes exist, invoke the `tenant-rbac-guard` agent (via the Agent tool, `subagent_type: "tenant-rbac-guard"`) against the new/changed files to check tenant scoping and visibility gating before considering the form done.
- Manually confirm: submitting the form creates the request in `Draft`/initial state with the right status model, and every declared status transition actually fires a notification.
