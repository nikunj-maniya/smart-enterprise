## ADDED Requirements

### Requirement: WFH request submission
An employee SHALL submit a WFH request through the 3-step wizard mirroring the Leave wizard (department, project(s), PM, Tech Lead, discussed-with, duration, dates, half-WFH count, detailed reason), including the mandatory "Can you not avoid this WFH?" answer; selected people become required parallel approvers.

#### Scenario: Valid WFH request is submitted
- **WHEN** an employee completes the wizard and submits
- **THEN** a request is created in Pending Approval with the selected approvers snapshotted, and dates/counts are validated like Leave

### Requirement: Conditional HR sign-off for WFH
When duration is more than 2 days, the wizard SHALL require an HR Head selection who becomes a required approver and is notified directly; the field SHALL stay hidden otherwise, and the server SHALL re-validate the condition.

#### Scenario: Long WFH requires HR
- **WHEN** the employee selects "More than 2 days"
- **THEN** the HR Head select is shown and mandatory, and the chosen HR Head joins the approver set

### Requirement: Special-condition soft flag
A WFH request marked as a special condition SHALL be validated server-side against the employee's request history and flagged for HR attention; the flag SHALL never hard-block submission or approval.

#### Scenario: Special condition flags, never blocks
- **WHEN** an employee submits a WFH request marked as a special condition
- **THEN** the request is accepted, the server records the history-checked flag, and HR sees the flag on the request — approval remains a human decision
