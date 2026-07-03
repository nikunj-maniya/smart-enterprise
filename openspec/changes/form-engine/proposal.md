## Why

Every request type (Leave, WFH, Visitor, IT — and later custom forms) is defined by metadata per PRD §6, but today the `FormDefinition`/`FormSection`/`FormField`/`StatusModel` tables sit empty with no APIs, no renderer, and no lifecycle engine. Nothing request-shaped can be built until this engine exists — it is the shared substrate for all four core forms and the Phase-3 no-code builder.

## What Changes

- Add **form-metadata APIs**: read published form definitions (schema for rendering), with the four core forms (Leave, WFH, Visitor, IT) seeded as versioned metadata per PRD §7.
- Add **immutable versioning**: publishing a definition creates a new immutable version; requests pin `formVersion` at creation and keep it forever (§6.5).
- Add **conditional visibility rules** on fields/sections, evaluated client-side for UX and re-validated server-side on submit (§6.4).
- Add the **core renderer**: a React engine that renders a published `FormDefinition` (all §6.3 field types incl. user-picker/project-picker) — consumed by the Leave/WFH wizards and later forms.
- Add the **status-lifecycle engine** (§9): per-form `StatusModel` state machine, role-gated transitions, `RequestStatusHistory` written on every transition, withdraw/cancel locked after the first approval action, and a scheduled daily job auto-completing Approved Leave/WFH past their end date.
- Add generic **request submission**: validate payload against the pinned version's metadata (required, types, visibility, validation rules) server-side, store hybrid JSONB payload + promoted typed columns.

## Capabilities

### New Capabilities
- `form-metadata`: form definition storage, versioning, publishing, and the seeded core-form definitions.
- `core-renderer`: the metadata-driven React renderer for published core forms, including conditional visibility.
- `status-lifecycle`: the per-form state machine, transition gating, status history, and the auto-complete job.

### Modified Capabilities
<!-- none — builds on data-model without changing its requirements -->

## Impact

- Depends on `setup-foundation` (`FormDefinition`, `FormSection`, `FormField`, `StatusModel`, `Request`, `RequestStatusHistory` tables) and `org-masters` (user-picker/project-picker need users, roles, and projects to resolve).
- Adds form-definition read APIs, a request submit/transition API, a BullMQ scheduled job, and the shared renderer component library in `apps/web`.
- Downstream changes (`approval-workflow`, `leave-wfh-requests`, `visitor-management`, `it-requests`, `form-builder`) all build on these capabilities.
