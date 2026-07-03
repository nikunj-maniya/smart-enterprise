## ADDED Requirements

### Requirement: Leave policy configuration
An Enterprise Admin (or HR per permissions) SHALL configure leave types with annual allocations, carry-forward, and half-day allowance per tenant on the Leave Policy & Quotas page; changes are audit-logged.

#### Scenario: Admin saves the policy
- **WHEN** an admin edits allocations or toggles carry-forward/half-day and saves
- **THEN** the tenant's leave types and quotas are persisted and drive balance cards and validation

### Requirement: Exactly-once atomic deduction
Leave days SHALL be deducted from the requester's balance exactly once, atomically, at the moment the last required approver approves — re-checking the balance at that moment; concurrent final approvals SHALL be serialized so double-deduction or a negative balance is impossible.

#### Scenario: Last approval deducts
- **WHEN** the final pending approver approves a leave request
- **THEN** the request becomes Approved and the day count (half-days as 0.5) is deducted from the matching leave-type balance in the same transaction

#### Scenario: Concurrent approvals cannot double-deduct
- **WHEN** two approvers approve at effectively the same time
- **THEN** exactly one transaction performs the deduction and the balance never goes negative or is deducted twice

### Requirement: Restore on cancel or withdraw
When an approved leave request is cancelled by an authorized role or withdrawn where still permitted, the deducted days SHALL be restored to the balance exactly once.

#### Scenario: Post-approval cancel restores days
- **WHEN** HR or the Enterprise Admin cancels an approved leave request
- **THEN** the previously deducted days return to the requester's balance and the action is audit-logged

### Requirement: LWP never deducts
Leave Without Pay requests SHALL NOT deduct from any paid leave balance.

#### Scenario: LWP approval leaves balances untouched
- **WHEN** an LWP request receives its final approval
- **THEN** the request is Approved and no paid balance changes

### Requirement: Over-balance warning
When a request exceeds the available balance for its leave type, the wizard SHALL warn the employee before submission but SHALL still allow it; HR can approve it as LWP.

#### Scenario: Employee warned but not blocked
- **WHEN** an employee requests more days than their remaining balance
- **THEN** a warning is shown, submission remains possible, and the over-balance flag is visible to approvers and HR
