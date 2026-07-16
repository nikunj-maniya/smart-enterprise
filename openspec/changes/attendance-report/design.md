# Design — Attendance Report

## Context

Finance needs payable days per employee per month to credit salaries. The system has no punch-in/attendance tracking; presence is derivable from approved leave/WFH `Request` rows (promoted columns `startDate`, `endDate`, `totalDays`, `halfDayCount`; half-day dates in `payload.half_day_dates` / `payload.half_wfh_dates`) and `LeaveType.isPaid` (LWP = `isPaid: false`). No working-day/weekend/holiday concept exists anywhere, and there is no Finance role. The API contract below was reviewed and approved in conversation before this change was drafted.

## Goals / Non-Goals

**Goals:**
- A month-scoped, per-employee payable-days report (JSON + CSV) gated to a new Finance role and Enterprise Admin.
- A tenant Holiday master so working days exclude weekends (fixed Sat–Sun) and weekday holidays.
- Match existing API conventions exactly (no route prefix, `{ rows, total, page, pageSize }` lists, `HttpError` + `{ error, details }` errors, Zod schemas in `@se/shared`, `requireAnyRole` route guards).

**Non-Goals:**
- Punch-in/check-in tracking, payroll amounts/salary math, pro-rating by employment dates (User has no join/exit dates), configurable weekend rules, Excel export (CSV opens in Excel), and changes to leave-balance ledger math.
- Real-time updates (reviewed and rejected): the report is an on-demand snapshot of settled history consumed as CSV; holiday CRUD is low-frequency with 409-backed conflict handling. The existing Socket.IO layer stays untouched by this feature; if staleness ever bites, add a "Data as of / Refresh" affordance — not a transport.
- Background processing (reviewed and rejected): report + export are bounded synchronous reads (≤4 batched queries/page; single-pass CSV at realistic headcounts); no external calls, schedule, or retry-worthy side effects — none of what the existing `jobs/` workers exist for. Revisit only at ~10k+-employee exports (async export job → MinIO, jobId `attendance-export:<tenantId>:<month>`) or a scheduled-delivery requirement (repeatable job per `slack-digest.job.ts`).
- Redis caching (reviewed and rejected): the report is a cold, high-cardinality-key read (a few runs/month around payroll) whose inputs span approvals, holidays, leave types, users, and departments — a huge invalidation surface — and payroll tolerates zero staleness ("cache immutable past months" is a trap: retro-approvals/holiday edits legitimately change them). Auth resolution on these routes already rides the existing 30s `auth:user:<id>` cache. Revisit only for a genuinely hot shared projection (e.g. a per-tenant month-summary dashboard widget).

## Decisions

1. **Derive attendance from requests, don't store it.** The report is a pure query over approved `leave`/`wfh` requests + holidays. Alternative (materialized attendance table) rejected: nothing to keep in sync, and month queries over the existing `@@index([startDate, endDate])` are cheap at this scale.
2. **New `finance` System role + `view_attendance_report` permission** rather than granting HR Head. Salary-adjacent data access should be explicit, not bundled into HR. Enterprise Admin also gets the permission. New `manage_holidays` permission → HR Head + Enterprise Admin.
3. **New `Holiday` Prisma model** (`id`, `tenantId`, `date DateTime` normalized to UTC midnight — the schema uses no `@db.` native types and leave dates are stored the same way, `name`, `createdAt`, `@@unique([tenantId, date])` — its composite index also serves tenant-scoped lookups, so no separate `@@index([tenantId])`) with a small CRUD module. Alternative (Finance applies their own baseline; report only shows deductions) rejected in review — payable days without a baseline pushes the error-prone step back onto Finance.
4. **Working-day math**: `workingDays = calendarDays − Sat/Sun − weekday holidays`. Request ranges clipped to the month, counted only on working days; half-day dates count 0.5 when on a working day in the month. **Per-day set semantics**: build a per-employee day→classification map so a working day contributes at most 1.0 even when multiple approved requests overlap it, with precedence unpaid leave > paid leave > WFH (summing ranges would double-count overlaps). Requests with null promoted dates are skipped. All day math in UTC on date-only values; "current month"/future-month checks use UTC now (a few-hour edge for ahead-of-UTC timezones at month boundaries is accepted and documented). `payableDays = workingDays − unpaidLeaveDays`; `officeDays = workingDays − paidLeaveDays − unpaidLeaveDays − wfhDays` (floor 0). This intentionally diverges from the ledger's raw-span formula (`totalDays − 0.5 × halfDayCount`) — correct for payroll, and the divergence is documented.
5. **Route placement**: extend the existing `reports` module (`GET /reports/attendance`, `GET /reports/attendance/export`) and add a new `holidays` module mounted at `/holidays`, following the `routes.ts`/`controller.ts`/`service.ts` layout. Route-level authz via `requireAnyRole` (matches `leave-types`); no absence-visibility tiering — access is all-or-nothing and rows never include reason/context fields.
6. **Employee inclusion**: Active users by default; `includeInactive=true` adds Inactive/Suspended (never Pending). Rows carry `status` and `joinedAt` (= `User.createdAt`) so Finance can hand-adjust joiners/leavers.

## API Contract (approved)

### `GET /holidays?year=YYYY`
Any authenticated tenant user. `year` coerced int, 2000–2100. `200 { rows: [{ id, date: 'YYYY-MM-DD', name }] }` sorted by date. Errors: 400/401/403 (403 for platform admin without tenant — applies to all endpoints below too).

### `POST /holidays`
`requireAnyRole([HrHead, EnterpriseAdmin])`. Body `holidayCreateSchema`: `date` `YYYY-MM-DD` real date (weekend dates accepted, no-op), `name` trimmed 1–100 chars. `201` created row. `409` duplicate tenant+date. Audit-logged.

### `PUT /holidays/:id`
Same authz. Body `holidayUpdateSchema` (≥1 of `date`/`name`, same rules). `200` updated row. `404` not in tenant, `409` date collision. Audit-logged.

### `DELETE /holidays/:id`
Same authz. `204` no body. `404` not in tenant. Audit-logged.

### `GET /reports/attendance`
`requireAnyRole([Finance, EnterpriseAdmin])`. Query `attendanceReportQuerySchema`:
- `month` (required) `^\d{4}-(0[1-9]|1[0-2])$`, not future (400 `Cannot report on a future month`; current partial month allowed → `isPartialMonth: true`)
- `departmentId?` must exist in tenant (400 `Unknown department`)
- `includeInactive?` default false
- `page` (default 1), `pageSize` (default 20, max 100)

`200`:
```json
{
  "month": "2026-06", "isPartialMonth": false,
  "calendarDays": 30, "weekendDays": 8, "holidayCount": 1, "workingDays": 21,
  "rows": [{
    "userId": "...", "name": "...", "email": "...", "departments": ["..."],
    "status": "Active", "joinedAt": "2025-11-03",
    "workingDays": 21, "wfhDays": 4, "paidLeaveDays": 1.5,
    "unpaidLeaveDays": 2, "officeDays": 13.5, "payableDays": 19
  }],
  "total": 143, "page": 1, "pageSize": 20
}
```
Rows sorted by name asc; day fields move in 0.5 steps. Only `status = 'Approved'` requests with form key `leave`/`wfh` count.

### `GET /reports/attendance/export`
Same authz; same query minus pagination (exports all rows). `200` `text/csv; charset=utf-8`, `Content-Disposition: attachment; filename="attendance-YYYY-MM.csv"`. Header: `Employee,Email,Departments,Status,Joined,Working Days,WFH Days,Paid Leave,Unpaid Leave (LWP),Office Days,Payable Days`. Values identical to the JSON view; escaped with the existing `csvEscape` helper. No reason/context columns.

### Shared additions (`packages/shared/src/index.ts`)
`SystemRoleKey.Finance = 'finance'`; `PermissionKey.ViewAttendanceReport = 'view_attendance_report'`; `PermissionKey.ManageHolidays = 'manage_holidays'`; catalog + `SYSTEM_ROLE_PERMISSIONS` entries; `holidayCreateSchema`, `holidayUpdateSchema`, `attendanceReportQuerySchema`; `AttendanceReportRow` type.

## Risks / Trade-offs

- [Report figures differ from leave-balance deductions (ledger counts raw spans incl. weekends)] → Accepted and documented; working-day counting is the correct payroll semantic. Reviewed and approved.
- [Editing past holidays retroactively changes historical reports] → Holiday CRUD is audit-logged; acceptable for v1.
- [No pro-rating for mid-month joiners/leavers] → Rows expose `status` + `joinedAt`; Finance adjusts manually.
- [Current-month reports are partial] → `isPartialMonth: true` flag for UI warning.
- [Half-day dates live in request payloads, not columns] → Reuse the extraction approach from `leave-balance-ledger.ts`; cover with unit tests on the day-math.
- [Report matches the literal status string `Approved`] → Same coupling the leave-balance ledger already has; if an admin renames the approved state in a leave/wfh status model via the form builder, both break together. Documented constraint + covered by a test against the seeded status models.
- [`LeaveType.isPaid` edits retroactively reclassify history] → Same accepted-risk class as holiday edits; classification reads the leave type's current `isPaid` at report time.
- [Payroll CSV is opened in Excel; names/emails are user-controlled] → The new export prefixes `'` to cell values starting with `=`, `+`, `-`, or `@` (formula-injection guard). The existing `csvEscape` only quotes — pre-existing gap in `/reports/export`, noted but deliberately not touched by this change.
- [Per-employee computation cost] → Paginate users first (name-sorted, filtered), then batch-fetch that page's overlapping approved requests in one query (no N+1); `total` comes from the user count query. CSV export computes all rows in one pass, bounded by tenant headcount.

## Migration Plan

1. Prisma migration adds `Holiday` (additive; rollback = drop table).
2. Backfill script/seed update: add `finance` role and new permission grants to already-active tenants (mirrors prior role-catalog rollouts, e.g. absence-calendar role grants).
3. API + web ship behind role checks — users see nothing until granted the Finance role.

## Frontend Architecture

Prototype check (done): neither screen exists in the design prototype — compose from its closest analogs ("Balances Overview" for the report, "Leave Policy" + user dialog for the holiday master) and existing app patterns.

- **Two new page files, no new shared components**: `pages/requests/AttendanceReport.tsx` (beside `Reports.tsx`) and `pages/organization/Holidays.tsx` (beside `LeavePolicy.tsx`); modals/rows defined inline in their page file, per convention (`DepartmentModal` precedent).
- **Routing**: `App.tsx` routes `/reports/attendance` (`RequireRole [finance, enterprise-admin]`) and `/organization/holidays` (`RequireRole [hr-head, enterprise-admin]`); Sidebar gains an `isFinance` boolean and two conditional `SidebarLink`s (pattern: `isReportsViewer`).
- **State**: all component-local `useState` (month/year, departmentId, includeInactive, page, data/loading/error, modal state, exporting) with `useCallback` `load()` — no react-query, no context, no URL params, matching every existing screen. Filters reset `page` to 1.
- **API layer**: typed wrappers added to `lib/api.ts` (`listHolidays`, `createHoliday`, `updateHoliday`, `deleteHoliday`, `getAttendanceReport`, `downloadAttendanceCsv` — blob-download clone of `downloadAbsencesCsv`); DTO types from `@se/shared`.
- **Reused primitives**: `PageHeader`, `Button`, `Overlay` (holiday add/edit + delete-confirm), `useToast`, `EmptyState`/`ErrorState`, hand-rolled CSS-grid table + Prev/Next pagination (per `Users.tsx`), month helpers from `components/absences/absenceStyle.ts` (`startOfMonth`, `addMonths`, `monthLabel`); month stepper Next-disabled at current month; partial-month warning banner when `isPartialMonth`.
- **Error handling**: `ApiError.message` inline in modals; special-case `err.status === 409` on holiday save to point at the date field.

## Open Questions

- None — resolved during design review.
