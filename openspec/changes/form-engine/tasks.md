## 1. Rule & Validation Engine

- [ ] 1.1 Define the visibility/validation rule grammar (JSON, versioned) + evaluator in `packages/shared` _(Slice 1)_
- [ ] 1.2 Build the metadata→Zod compiler (types, validation, conditional requiredness, hidden⇒absent) with per-version cache _(Slice 1)_
- [ ] 1.3 Shared payload fixtures proving renderer and server evaluate rules identically _(Slice 1)_

## 2. Form Metadata API

- [ ] 2.1 `GET /forms` + `GET /forms/:key` returning the tenant's latest published definition (sections, fields, workflow, status model) _(Slice 2)_
- [ ] 2.2 Publish flow: clone definition to an immutable `version + 1` row-set; reject unsupported field types at save _(Slice 2)_
- [ ] 2.3 Seed the four core forms (Leave, WFH, Visitor, IT per PRD §7) on tenant activation + backfill script for active tenants _(Slice 3)_

## 3. Request Submission

- [ ] 3.1 `POST /requests` validating payload against the pinned version via the compiled Zod schema _(Slice 4)_
- [ ] 3.2 Server-side extractor map deriving promoted typed columns from the validated payload _(Slice 4)_
- [ ] 3.3 Write the initial status + first `RequestStatusHistory` row + audit log entry on create _(Slice 4)_

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
