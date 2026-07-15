# Tasks — Attendance Report

## 1. Shared & Database

- [x] 1.1 Add `SystemRoleKey.Finance`, `PermissionKey.ViewAttendanceReport`, `PermissionKey.ManageHolidays` to `packages/shared/src/index.ts` (catalog, labels, `SYSTEM_ROLE_PERMISSIONS`)
- [x] 1.2 Add `holidayCreateSchema`, `holidayUpdateSchema`, `attendanceReportQuerySchema` and `AttendanceReportRow` type to `packages/shared/src/index.ts`
- [x] 1.3 Add `Holiday` model to `apps/api/prisma/schema.prisma` (`@@unique([tenantId, date])`; plain `DateTime` date at UTC midnight) and create the migration
- [x] 1.4 Extend role seeding to include the Finance role + new permission grants, and backfill already-active tenants (mirror the prior role-grant rollout pattern)

## 2. Holidays API

- [x] 2.1 Create `apps/api/src/modules/holidays/` (routes/controller/service): `GET /holidays?year=`, `POST`, `PUT /:id`, `DELETE /:id` per design.md contract (201/204/404/409, tenant-scoped, `requireAnyRole([HrHead, EnterpriseAdmin])` on writes)
- [x] 2.2 Audit-log holiday create/update/delete via the existing `AuditLog` pattern
- [x] 2.3 Mount `holidaysRouter` in `apps/api/src/index.ts`

## 3. Attendance Report API

- [x] 3.1 Implement working-day/day-count math (calendar − Sat/Sun − weekday holidays; range clipping; half-day dates at 0.5; per-day set semantics with precedence LWP > paid leave > WFH; null-date skip; UTC-only; `payableDays`/`officeDays` formulas) as a pure, unit-testable helper in the reports module
- [x] 3.2 Implement `GET /reports/attendance` (query validation incl. future-month/unknown-department 400s, `includeInactive`, pagination, `isPartialMonth`, rows sorted by name) gated by `requireAnyRole([Finance, EnterpriseAdmin])`
- [x] 3.3 Implement `GET /reports/attendance/export` CSV (same query minus pagination, quoting per `csvEscape` plus a formula-injection prefix guard for `=`/`+`/`-`/`@` cells, attachment filename `attendance-YYYY-MM.csv`, no reason/context columns)
- [x] 3.4 Unit tests for the day-math helper (month clipping, weekend/holiday exclusion, half-days, overlapping-request de-dup and LWP > paid > WFH precedence, null promoted dates, LWP vs paid, partial month, month/UTC boundaries)

## 4. Web

- [ ] 4.1 Check the Claude Design prototype (DesignSync) for attendance-report and holiday-master screens; follow existing reports/masters patterns if absent
- [ ] 4.2 Holiday master screen for HR Head / Enterprise Admin (list by year, create/edit/delete, duplicate-date and validation errors)
- [ ] 4.3 Attendance report screen for Finance / Enterprise Admin (month picker capped at current month, department filter, includeInactive toggle, paginated table, partial-month warning, CSV download)
- [ ] 4.4 Navigation/route guards so only the granted roles see the new screens

## 5. Verify

- [ ] 5.1 Typecheck, lint, and build pass across the workspace
- [ ] 5.2 End-to-end check: seed a holiday, approve leave (paid, LWP, half-day) and WFH spanning weekends/month boundaries, and confirm JSON + CSV figures match the spec scenarios; confirm 403s for ungranted roles
