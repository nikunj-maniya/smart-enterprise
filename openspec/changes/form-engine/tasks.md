## 1. Rule & Validation Engine

- [x] 1.1 Define the visibility/validation rule grammar (JSON, versioned) + evaluator in `packages/shared` _(Slice 1)_ — `rules.ts`: `{ v:1, when }` grammar (eq/neq/gt/gte/lt/lte/in/nin/empty/notEmpty + and/or), `visibilityRuleSchema`, shared `evaluateRule`/`isFieldVisible`
- [x] 1.2 Build the metadata→Zod compiler (types, validation, conditional requiredness, hidden⇒absent) with per-version cache _(Slice 1)_ — `metadata.ts` (§6.3 field types + `parseDefinition` rejecting unknown types by name) + `compile.ts` (`compileDefinition` cached per `(id,version)`, `validatePayload`)
- [x] 1.3 Shared payload fixtures proving renderer and server evaluate rules identically _(Slice 1)_ — `fixtures.ts` + `fixtures.test.ts` (node:test, 8/8) run the same shared fns the renderer will use; hidden-field, conditionally-required, type, and option-membership rejects all asserted

## 2. Form Metadata API

- [x] 2.1 `GET /forms` + `GET /forms/:key` returning the tenant's latest published definition (sections, fields, workflow, status model) _(Slice 2)_ — `modules/forms/`; both `requireAuth`, tenant-scoped; sections ordered; 404 when no published version
- [x] 2.2 Publish flow: clone definition to an immutable `version + 1` row-set; reject unsupported field types at save _(Slice 2)_ — `POST /forms/:key/publish` (Enterprise Admin); reusable `publishDefinition()` for Slice 3 seed; `parseDefinition` → 400 naming the field; v1 stays readable after v2 published. NOTE: add a `FormField.order` column in Slice 3 (seeding) — field order currently relies on insertion order
- [x] 2.3 Seed the four core forms (Leave, WFH, Visitor, IT per PRD §7) on tenant activation + backfill script for active tenants _(Slice 3)_ — `core-forms.ts` (4 defs per §7/§8/§9, all pass `parseDefinition`) + `seedTenantCoreForms()` hooked into `acceptRegistration` tx (idempotent per key) + `backfill-core-forms.ts`. Added `FormField.order` column (migration `20260707050311_form_field_order`), wired through publish (order=index) + read; `publishDefinition` now tx-aware. Verified: activation seeds 4 published v1 forms, ordered fields, backfill no dupes. NOTE: PM picker filters `project-manager` only (no `ba` system role — see report)

## 3. Request Submission

- [x] 3.1 `POST /requests` validating payload against the pinned version via the compiled Zod schema _(Slice 4)_ — `modules/requests/`; `forms.service.getPublishedDefinitionForSubmission()` converts the Prisma row (not the DTO — its `null` options/validation/visibilityRule fail the shared `.optional()` schemas) straight into the shared engine's `FormDefinition`, then `validatePayload()` re-validates authoritatively; 404 on no published version, 400 with per-field `details` on validation failure (`HttpError` extended with an optional `details` payload, surfaced by the error middleware)
- [x] 3.2 Server-side extractor map deriving promoted typed columns from the validated payload _(Slice 4)_ — `requests/extractors.ts`; `leave`/`wfh` map to `startDate`/`endDate`/`totalDays`/`halfDayCount`/`leaveTypeId`/`departmentId`/`projectId` (WFH's `totalDays` is derived from the date range, no such field exists on that form); Visitor/IT extract nothing (no absence-calendar columns apply)
- [x] 3.3 Write the initial status + first `RequestStatusHistory` row + audit log entry on create _(Slice 4)_ — one `prisma.$transaction`; initial status = the form's `statusModel.states[0]` (e.g. `Draft`/`Pre-Registered`/`Requested`); history row has `fromState: null`; audit entry mirrors the `FormDefinition` publish pattern. Verified end-to-end against a live tenant: valid leave submission produced `Draft` status, correct promoted columns, one history row, one audit entry; hidden-field and missing-conditionally-required payloads were rejected with the right per-field error

## 4. Status Lifecycle Engine

- [x] 4.1 Transition service: declared-transition check + role gate + status update + history append in one locked transaction _(Slice 5)_ — `requests/transitions.service.ts`: parses the form's `StatusModel` via shared `statusModelSchema`, matches `{from,to}` against declared transitions (400 if undeclared), role-gates via `Role.key` or the special `requester`/`system` tokens (403 otherwise), then in one `prisma.$transaction` does an optimistic-lock `updateMany` keyed on the previously-read status (409 on concurrent race) + `RequestStatusHistory` append + audit log. New `POST /requests/:id/transitions` route/controller; new shared `packages/shared/src/form-engine/status-model.ts`. Verified end-to-end incl. a genuine concurrent-race test (exactly one winner, exactly one history row) and cross-tenant 404
- [x] 4.2 Withdraw/cancel rules: requester-withdraw until first approval action; post-approval cancel gated to HR/Enterprise Admin with balance-restore hook _(Slice 5)_ — withdraw/cancel gating falls out of 4.1's declared-transition + role-gate check against the Slice-3-seeded `StatusModel`s (no extra code needed); added the balance-restore hook itself: `extractors.ts`'s `requiresBalanceRestore()`/`restoreBalanceOnCancel()` (documented no-op stub, ledger math deferred to `leave-wfh-requests`), invoked inside the same transaction only on the exact `Approved→Cancelled` transition for Leave/WFH. Verified: requester withdraw pre-decision succeeds, blocked post-Approved; HR Head cancel succeeds and calls the hook without throwing; requester cancel attempt 403's
- [x] 4.3 BullMQ daily job (Asia/Kolkata) auto-completing Approved Leave/WFH past end date, idempotent _(Slice 6)_ — `lib/redis.ts` (shared ioredis conn) + `jobs/auto-complete-requests.job.ts`: `runAutoCompleteRequests()` finds `Approved` Leave/WFH requests whose `endDate` is before today (Asia/Kolkata, fixed UTC+5:30) and drives them to `Completed` via the new `systemTransitionRequest` (reuses `transitions.service.ts`'s transaction helper, `actorId: null`, gated to the reserved `system` role token — unreachable via the human transition path); `scheduleAutoCompleteRequestsJob()` registers a fixed-`jobId` BullMQ repeatable job (`0 0 * * *`, `tz: 'Asia/Kolkata'`), wired on boot in `index.ts`. Verified end-to-end against live Postgres/Redis: past-end-date row transitions with exactly one history row, today/already-Completed rows untouched, re-run makes no further changes (6.5)

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
