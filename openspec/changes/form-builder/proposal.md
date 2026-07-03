## Why

Phase 3's headline: PRD §16 requires that an admin can create a working form **without engineering**. The form-engine already stores every form as metadata; what's missing is the UI to author that metadata and a generic renderer to execute forms no engineer has seen.

## What Changes

- Add the **no-code Form Builder** to the Enterprise Admin console per the design: a two-pane screen (form list with field counts/updated/status badges; field editor with drag-reorder, edit/delete, Required toggle, Add Field modal) with Save Draft / Publish.
- Add the **generic renderer**: any published custom `FormDefinition` renders and submits through the standard request pipeline, supporting the full §6.3 field-type set and §6.4 visibility rules.
- Make **approval routing and status models configurable via UI** for custom forms (choose approver roles/pickers, define states and transitions within guardrails).
- Let admins **edit core forms in the same builder** within metadata bounds: relabel, reorder, adjust validation and routing — no redeploy. New field *types* remain engineering work.

## Capabilities

### New Capabilities
- `form-builder`: authoring UI for form metadata — fields, validation, visibility, routing, status model — with draft/publish versioning.
- `generic-renderer`: runtime execution of published custom forms through the standard request/approval pipeline.

### Modified Capabilities
<!-- none — builds on form-engine's metadata and versioning as designed -->

## Impact

- Depends on `form-engine` (metadata model, versioning, visibility evaluation) and `approval-workflow` (routing custom forms reuse).
- Adds builder screens + field modal, form CRUD/publish APIs, and the generic renderer path in the web app.
- Publishing is versioned: in-flight requests keep their pinned version (form-engine guarantee) — no breaking impact on existing requests.
