# Attendance Report

## Why

The Finance team credits salaries from the number of days each employee worked (office presence or WFH), but the system offers no way to get that number — they reconstruct it manually from leave records. The platform already holds the source data (approved leave/WFH requests, paid vs. unpaid leave types), so a payable-days report closes the gap.

## What Changes

- New **Employee Attendance Report** for Finance: one row per employee per calendar month with working days, WFH days, paid-leave days, unpaid-leave (LWP) days, office days, and **payable days = working days − LWP days**; JSON view (paginated, department filter) plus CSV export.
- New **Holiday master**: HR Head / Enterprise Admin manage company holidays (CRUD); holidays and weekends (fixed Sat–Sun) are excluded from a month's working-day baseline. Any tenant user can view the holiday list.
- New **`finance` System role** seeded per tenant, carrying a new `view_attendance_report` permission (also granted to Enterprise Admin). New `manage_holidays` permission granted to HR Head and Enterprise Admin.
- Attendance is **derived** from approved `Request` rows (form keys `leave`/`wfh`) — no punch-in/check-in tracking is introduced.

## Capabilities

### New Capabilities

- `attendance-report`: the Finance payable-days report — month/department querying, per-employee day computation rules, CSV export, and its authorization model.
- `holiday-management`: the company-holiday master — CRUD, per-tenant date uniqueness, viewing, and its effect on working-day math.

### Modified Capabilities

- `org-structure`: the "Roles as permission bundles" requirement's seeded System-role list gains a **Finance** role; the permission catalog gains `view_attendance_report` and `manage_holidays`.

## Impact

- **API** (`apps/api`): new `holidays` module (CRUD routes); `reports` module gains `GET /reports/attendance` and `GET /reports/attendance/export`; role seeding gains the `finance` role.
- **Database**: new `Holiday` model (Prisma migration); no changes to existing models.
- **Shared** (`packages/shared`): `SystemRoleKey.Finance`, `PermissionKey.ViewAttendanceReport`, `PermissionKey.ManageHolidays`, new Zod schemas (`holidayCreateSchema`, `holidayUpdateSchema`, `attendanceReportQuerySchema`) and row types.
- **Web** (`apps/web`): attendance report screen for Finance/Enterprise Admin and a holiday management screen for HR/Enterprise Admin (design to be matched against the prototype at implementation time).
- **Existing tenants**: role seeding must backfill `finance` (and the new permissions) into already-active tenants, mirroring how prior role/permission additions were rolled out.
- **Known limitations (accepted)**: no pro-rating for mid-month joiners/leavers (`User` has no employment dates — rows expose `status` and `joinedAt` for manual adjustment); report working-day counts intentionally differ from leave-balance ledger deductions, which use raw calendar spans; editing past holidays retroactively changes historical reports (holiday CRUD is audit-logged).
