# attendance-report

## ADDED Requirements

### Requirement: Attendance report access
The attendance report SHALL be available only to holders of the `view_attendance_report` permission (seeded on the Finance and Enterprise Admin System roles), scoped to the viewer's tenant. It SHALL NOT expose leave reasons or any request context fields.

#### Scenario: Finance user views the report
- **WHEN** a user holding the Finance role requests `GET /reports/attendance?month=2026-06`
- **THEN** the report for their tenant is returned

#### Scenario: Unauthorized role refused
- **WHEN** a user holding only Employee, HR Head, PM, or Tech Lead roles requests the attendance report
- **THEN** the API responds 403

#### Scenario: No reason fields exposed
- **WHEN** any authorized user views or exports the attendance report
- **THEN** no leave reason or request payload context appears in any row or column

### Requirement: Payable-days computation
The report SHALL compute, per employee per calendar month: `workingDays` (calendar days minus Saturdays/Sundays minus tenant holidays falling on a weekday), `wfhDays`, `paidLeaveDays`, `unpaidLeaveDays` (LWP, from leave types with `isPaid = false`), `officeDays = workingDays − paidLeaveDays − unpaidLeaveDays − wfhDays` (floored at 0), and `payableDays = workingDays − unpaidLeaveDays`. Only requests with status `Approved` and form key `leave` or `wfh` SHALL count; requests with missing promoted dates SHALL be skipped; request date ranges SHALL be clipped to the month and counted only on working days; half-day dates SHALL count 0.5 each when they fall on a working day in the month. Day counting SHALL use per-day set semantics: each working day contributes at most 1.0 per employee even when multiple approved requests cover it, with precedence unpaid leave > paid leave > WFH. All date math SHALL use UTC on date-only values.

#### Scenario: LWP reduces payable days
- **WHEN** an employee has 2 approved unpaid-leave working days in a 21-working-day month
- **THEN** their row shows `unpaidLeaveDays: 2` and `payableDays: 19`

#### Scenario: Paid leave and WFH remain payable
- **WHEN** an employee has only approved paid leave and WFH days in the month
- **THEN** their `payableDays` equals the month's `workingDays`

#### Scenario: Range clipped to month and working days
- **WHEN** an approved leave spans Friday through Monday across a month boundary
- **THEN** only the working days inside the queried month are counted (weekend days and out-of-month days are excluded)

#### Scenario: Half-day counted as 0.5
- **WHEN** an approved leave includes a half-day date on a working day of the queried month
- **THEN** that date contributes 0.5 to the corresponding leave-days figure

#### Scenario: Overlapping approved requests never double-count
- **WHEN** two approved requests (e.g. two leaves, or a leave and a WFH) cover the same working day
- **THEN** that day contributes at most 1.0 to the employee's counts, classified by the precedence unpaid leave > paid leave > WFH

### Requirement: Report querying
The report SHALL be queried by calendar month (`YYYY-MM`, current or past only), with an optional department filter and an `includeInactive` flag (default false: only Active users; true additionally includes Inactive and Suspended users, never Pending). Rows SHALL be paginated per the standard `{ rows, total, page, pageSize }` convention, sorted by employee name, and each row SHALL include the employee's status and joined date for manual pro-rating. A query for the current (incomplete) month SHALL be flagged `isPartialMonth: true`.

#### Scenario: Future month refused
- **WHEN** a user queries a month later than the current month
- **THEN** the API responds 400

#### Scenario: Department filter
- **WHEN** a user queries with a `departmentId` belonging to their tenant
- **THEN** only employees assigned to that department are returned

#### Scenario: Current month flagged partial
- **WHEN** a user queries the current calendar month
- **THEN** the response includes `isPartialMonth: true`

### Requirement: CSV export
The report SHALL be exportable as CSV (`text/csv`, attachment `attendance-<YYYY-MM>.csv`) under the same authorization and query rules as the JSON view, without pagination, containing exactly the JSON view's columns and values.

#### Scenario: Export matches the JSON view
- **WHEN** an authorized user exports the report for a month
- **THEN** the CSV contains one row per employee with the same day figures the JSON view reports for that month
