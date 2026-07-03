## Context

Phase 3. `form-engine` deliberately stored even core forms as metadata (§6.1) so this change is UI + one renderer, not an engine rewrite. The design's Admin · Form Builder screen (two-pane, field modal, draft/publish) is complete. The §16 acceptance test — a working form with no engineering — is the bar.

## Goals / Non-Goals

**Goals:**
- Admins author, publish, and iterate forms (fields, validation, visibility, routing, statuses) entirely in the UI.
- Custom forms are first-class requests: same approvals, lifecycle, notifications, audit.
- Core forms become admin-editable within their metadata bounds.

**Non-Goals:**
- New field *types* (engineering, by design).
- Cross-form logic, computed fields, or external data sources.
- Slack blocks for custom forms beyond the standard notification templates.

## Decisions

- **One renderer contract, two implementations** — the generic renderer consumes exactly the same metadata the core renderers do; core forms keep their hand-built UX (§6.1) while custom forms get the generic path. Alternative (regenerate core forms generically) rejected: it would flatten the nuanced core-form UX the hybrid model exists to protect.
- **Builder edits are drafts until published** — publish = new immutable version (form-engine's §6.5 rule); the builder never mutates a published definition. In-flight requests stay pinned; no migration logic needed.
- **Guardrailed configurability, not a workflow language** — routing choices are the shapes the engine already supports (role-restricted pickers, parallel approval); status models are validated state machines (terminal state required, transitions role-gated, no self-approval). Free-form scripting rejected: unverifiable and unsupportable.
- **Visibility rules re-evaluated server-side** — the generic path enforces §6.4 exactly as core forms do; a hidden field's value in the payload is a validation error, not silently dropped.
- **Drag-reorder persists section order indexes** — plain order integers, re-sequenced on save; no fractional-ordering cleverness.

## Risks / Trade-offs

- [Admins can build confusing forms] → guardrail validation catches broken ones (orphan states, missing approvers); taste stays the admin's job.
- [Version proliferation from frequent publishes] → versions are cheap rows; the builder lists only the latest, history stays queryable for reporting.
- [Core-form edits could break wizard UX assumptions] → core renderers read labels/order/validation from metadata but their step structure is code; builder blocks edits that would orphan a step's fields and says why.

## Open Questions

<!-- none — hybrid boundary (which edits need engineering) is fixed by PRD §6.1 -->
