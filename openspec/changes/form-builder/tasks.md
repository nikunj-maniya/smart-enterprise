## 1. Builder — Fields

- [ ] 1.1 Form CRUD APIs: create/list/read drafts, save draft field-set, guardrail validation, audit-logged _(Slice 1)_
- [ ] 1.2 Build the two-pane builder per the design (form list with badges, field rows with drag handle, Required toggle, edit/delete) _(Slice 1)_
- [ ] 1.3 Add/Edit Field modal (label, §6.3 type select, required) wired to draft save _(Slice 1)_
- [ ] 1.4 Field visibility-rule editing (show-when conditions referencing other fields) _(Slice 2)_

## 2. Publish & Versioning

- [ ] 2.1 Publish API: validate guardrails, create immutable version, expose to New Request; edits after publish start a new draft _(Slice 3)_
- [ ] 2.2 Draft/Published badges + Save Draft / Publish buttons per the design _(Slice 3)_

## 3. Generic Renderer

- [ ] 3.1 Generic renderer component: all §6.3 field types + client-side visibility/validation from metadata _(Slice 4)_
- [ ] 3.2 Generic submission endpoint: server re-validation against the pinned version, standard request creation _(Slice 4)_
- [ ] 3.3 Custom-form requests flow through approvals queue, My Requests, notifications, audit _(Slice 5)_

## 4. Routing & Status Config

- [ ] 4.1 Builder UI + API for approval routing config (role-restricted pickers, parallel mode) _(Slice 6)_
- [ ] 4.2 Builder UI + API for status-model config with state-machine validation _(Slice 6)_

## 5. Core-Form Editing

- [ ] 5.1 Open core forms in the builder; allow relabel/reorder/validation/routing edits; block structural edits with explanation _(Slice 7)_

## 6. Verify

- [ ] 6.1 §16 acceptance: admin builds a new conditional form, publishes, employee submits, approver approves — zero code changes
- [ ] 6.2 Republish leaves in-flight requests on their pinned version
- [ ] 6.3 Hidden-field payload value and missing required field both rejected server-side
- [ ] 6.4 Invalid status model (orphan state) refused at publish with a clear message
- [ ] 6.5 Core Leave form relabel publishes and renders without redeploy
