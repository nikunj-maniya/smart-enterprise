## 1. Rule & Validation Engine

- [x] 1.1 Define the visibility/validation rule grammar (JSON, versioned) + evaluator in `packages/shared` _(Slice 1)_ — `rules.ts`: `{ v:1, when }` grammar (eq/neq/gt/gte/lt/lte/in/nin/empty/notEmpty + and/or), `visibilityRuleSchema`, shared `evaluateRule`/`isFieldVisible`
- [x] 1.2 Build the metadata→Zod compiler (types, validation, conditional requiredness, hidden⇒absent) with per-version cache _(Slice 1)_ — `metadata.ts` (§6.3 field types + `parseDefinition` rejecting unknown types by name) + `compile.ts` (`compileDefinition` cached per `(id,version)`, `validatePayload`)
- [x] 1.3 Shared payload fixtures proving renderer and server evaluate rules identically _(Slice 1)_ — `fixtures.ts` + `fixtures.test.ts` (node:test, 8/8) run the same shared fns the renderer will use; hidden-field, conditionally-required, type, and option-membership rejects all asserted

## 2. Form Metadata API

- [x] 2.1 `GET /forms` + `GET /forms/:key` returning the tenant's latest published definition (sections, fields, workflow, status model) _(Slice 2)_ — `modules/forms/`; both `requireAuth`, tenant-scoped; sections ordered; 404 when no published version
- [x] 2.2 Publish flow: clone definition to an immutable `version + 1` row-set; reject unsupported field types at save _(Slice 2)_ — `POST /forms/:key/publish` (Enterprise Admin); reusable `publishDefinition()` for Slice 3 seed; `parseDefinition` → 400 naming the field; v1 stays readable after v2 published. NOTE: add a `FormField.order` column in Slice 3 (seeding) — field order currently relies on insertion order
- [x] 2.3 Seed the four core forms (Leave, WFH, Visitor, IT per PRD §7) on tenant activation + backfill script for active tenants _(Slice 3)_ — `core-forms.ts` (4 defs per §7/§8/§9, all pass `parseDefinition`) + `seedTenantCoreForms()` hooked into `acceptRegistration` tx (idempotent per key) + `backfill-core-forms.ts`. Added `FormField.order` column (migration `20260707050311_form_field_order`), wired through publish (order=index) + read; `publishDefinition` now tx-aware. Verified: activation seeds 4 published v1 forms, ordered fields, backfill no dupes. NOTE: PM picker filters `project-manager` only (no `ba` system role — see report)

## 3. Request Submission

- [x] 3.1 `POST /requests` validating payload against the pinned version via the compiled Zod schema _(Slice 4)_ — `modules/requests/`; resolves+pins latest published version, re-validates via shared `validatePayload` → 400 `{fields}`; verified hidden⇒absent + conditionally-required both rejected
- [x] 3.2 Server-side extractor map deriving promoted typed columns from the validated payload _(Slice 4)_ — per-formKey map (leave/wfh/visitor); derives startDate/endDate/totalDays/halfDayCount/leaveTypeId/departmentId/projectId from validated payload only, never client columns
- [x] 3.3 Write the initial status + first `RequestStatusHistory` row + audit log entry on create _(Slice 4)_ — initial status from statusModel (Leave/WFH→Submitted, Visitor→Pre-Registered, IT→Requested); Request + one history row (null→initial) + Request/create audit in one tx; version pin verified across republish

## 4. Status Lifecycle Engine

- [ ] 4.1 Transition service: declared-transition check + role gate + status update + history append in one locked transaction _(Slice 5)_
- [ ] 4.2 Withdraw/cancel rules: requester-withdraw until first approval action; post-approval cancel gated to HR/Enterprise Admin with balance-restore hook _(Slice 5)_
- [ ] 4.3 BullMQ daily job (Asia/Kolkata) auto-completing Approved Leave/WFH past end date, idempotent _(Slice 6)_

## 5. Core Renderer (web)

- [ ] 5.1 Field component per §6.3 type (text/textarea/number/date/datetime/time/daterange/selects/radio/checkbox/checkbox-group) matching the design system _(Slice 7)_
- [ ] 5.2 Searchable `user-picker` (role/department filters) + `project-picker` backed by directory APIs _(Slice 7)_
- [ ] 5.3 Renderer shell: sections in order, live visibility evaluation, hidden-field value clearing, inline validation errors per design _(Slice 8)_
- [ ] 5.4 Submit wiring: build payload from visible fields only, map server validation errors back to fields _(Slice 8)_

## 6. Verify

- [ ] 6.1 Republish a definition → new version served; an in-flight request still validates/renders against its pinned version
- [ ] 6.2 Payload with a hidden field's value, or missing a conditionally-required field, is rejected server-side
- [ ] 6.3 Undeclared or role-blocked transition is refused; every executed transition appends exactly one history row
- [ ] 6.4 Requester withdraw blocked after an approver acts; HR post-approval cancel fires the restore hook
- [ ] 6.5 Daily job completes an Approved leave whose end date passed; re-run makes no further changes
