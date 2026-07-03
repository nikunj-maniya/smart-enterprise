## ADDED Requirements

### Requirement: Leave request submission
An employee SHALL submit a leave request through the 3-step wizard capturing department, project(s), Project Manager, Tech Lead, optional discussed-with, away duration, day counts, dates, leave type, and context; every selected person becomes a required parallel approver.

#### Scenario: Valid request is submitted
- **WHEN** an employee completes all required fields and submits
- **THEN** a request is created in Pending Approval with the selected PM/Tech Lead (and HR Head when required) snapshotted as its parallel approvers

#### Scenario: Dates and day counts are validated
- **WHEN** the number of days does not match the start/end date range, the end date precedes the start date, the start date is in the past, or the half-day count exceeds the total days
- **THEN** submission is refused with a field-level error, and the same rules are re-validated server-side

### Requirement: Conditional HR sign-off
When away duration is more than 2 days, the wizard SHALL require an HR Head selection; the selected HR Head becomes a required approver and is notified directly. For 2 days or fewer the HR field SHALL stay hidden and no HR approver is added.

#### Scenario: More than 2 days requires HR
- **WHEN** the employee selects "More than 2 days"
- **THEN** the HR Head select becomes visible and mandatory, and the chosen HR Head is added to the approver set

#### Scenario: Server re-validates the condition
- **WHEN** a submission claims ≤ 2 days but its date range spans more
- **THEN** the server refuses it until an HR Head is selected

### Requirement: Routing preview
Before submission the wizard SHALL show the resolved parallel approver set so the employee knows who will act on the request.

#### Scenario: Preview lists approvers
- **WHEN** the employee reaches the review step
- **THEN** each selected approver is listed with role context, or an empty state explains no approvers are selected yet

### Requirement: Employee My Requests home
The employee home SHALL show an awaiting-approval count, per-leave-type balance cards (used/total with progress), and a table of the employee's own requests that opens the Request Detail drawer.

#### Scenario: Employee reviews their requests
- **WHEN** an employee opens My Requests
- **THEN** they see only their own requests with live status, their balances per leave type, and can open any row's detail drawer
