## ADDED Requirements

### Requirement: Per-form status state machine
Each form definition SHALL carry a `StatusModel` (states + allowed transitions) and every request SHALL only move between states along a declared transition; the PRD §9 defaults are seeded for the four core forms (Leave/WFH, Visitor, IT lifecycles).

#### Scenario: Declared transition succeeds
- **WHEN** an authorized actor moves a request along a transition declared in its form's status model
- **THEN** the request's status updates

#### Scenario: Undeclared transition is refused
- **WHEN** a transition not declared in the status model is attempted (e.g. Submitted → Fulfilled)
- **THEN** the API refuses it and the status is unchanged

### Requirement: Role-gated transitions
Every transition SHALL declare which roles may perform it, and the server SHALL enforce that gate on each attempt (e.g. only Reception-capable roles check a visitor in; only HR/Enterprise Admin cancel post-approval).

#### Scenario: Unauthorized actor is blocked
- **WHEN** a user whose roles are not in a transition's gate attempts it
- **THEN** the API refuses with an authorization error and writes no history

### Requirement: Immutable status history
Every executed transition SHALL append a `RequestStatusHistory` row (from-state, to-state, actor, timestamp, note) that can never be updated or deleted.

#### Scenario: Transition writes history
- **WHEN** any transition executes
- **THEN** a history row with from/to state, actor, and timestamp is appended and the request's full trail remains queryable in order

### Requirement: Withdraw locked after first approval action
The requester SHALL be able to withdraw/cancel their own request only until the first approver acts; afterwards, cancel of an approved request SHALL be restricted to authorized roles (HR/Enterprise Admin) and SHALL trigger the restore hook for any deducted balances.

#### Scenario: Withdraw before any decision
- **WHEN** the requester withdraws while every approver is still pending
- **THEN** the request becomes Withdrawn

#### Scenario: Withdraw after first decision is blocked
- **WHEN** any approver has approved or rejected and the requester attempts to withdraw
- **THEN** the API refuses; only an authorized role may cancel from here

#### Scenario: Authorized post-approval cancel restores balance
- **WHEN** HR cancels an Approved leave request
- **THEN** the request becomes Cancelled and the balance-restore hook fires

### Requirement: Scheduled auto-completion
A scheduled daily job SHALL transition Approved Leave/WFH requests whose end date has passed to Completed, writing status history with a system actor.

#### Scenario: Past-end-date request auto-completes
- **WHEN** the daily job runs and an Approved leave's end date is before today (Asia/Kolkata)
- **THEN** the request transitions to Completed with a system-actor history row
