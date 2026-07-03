## MODIFIED Requirements

### Requirement: Leave request submission
An employee SHALL submit a leave request through the 3-step wizard capturing department, project(s), Project Manager, Tech Lead, optional discussed-with, away duration, day counts, dates, leave type, and context; every selected person becomes a required parallel approver. Half-days SHALL be selected as specific dates within the leave range (upgrading the v1 count-only field), and each selected half-day date SHALL deduct 0.5 days.

#### Scenario: Valid request is submitted
- **WHEN** an employee completes all required fields and submits
- **THEN** a request is created in Pending Approval with the selected PM/Tech Lead (and HR Head when required) snapshotted as its parallel approvers

#### Scenario: Dates and day counts are validated
- **WHEN** the number of days does not match the start/end date range, the end date precedes the start date, the start date is in the past, or a selected half-day date falls outside the leave range
- **THEN** submission is refused with a field-level error, and the same rules are re-validated server-side

#### Scenario: Half-day dates drive deduction
- **WHEN** an employee marks specific dates within the range as half-days
- **THEN** the eventual balance deduction counts each marked date as 0.5 instead of 1
