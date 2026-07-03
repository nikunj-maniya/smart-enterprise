## ADDED Requirements

### Requirement: Fulfilment queue for IT Admins
The system SHALL provide an IT Admin Fulfilment Queue showing approved IT requests as cards (requester, category, department, approved date, items, impact badge, status badge, assignee) with stat cards for Queued, In Progress, and Fulfilled, Open/Fulfilled tabs, and an empty state. Access SHALL be restricted to users holding the IT Admin role.

#### Scenario: Approved request enters the queue
- **WHEN** a Process Head approves an IT request
- **THEN** it appears in the tenant's Fulfilment Queue as Queued/unassigned

#### Scenario: Non-IT-Admin blocked
- **WHEN** a user without the IT Admin role calls a fulfilment API
- **THEN** the request is refused

### Requirement: Fulfilment lifecycle
An IT Admin SHALL work a request through Assign to me → Start fulfilment (`Approved → In Progress`) → Hand over asset (`In Progress → Fulfilled`); each step SHALL record the acting admin, be audit-logged, and notify the requester on In Progress and Fulfilled.

#### Scenario: Assignment then fulfilment
- **WHEN** an IT Admin assigns a queued request to themselves and starts fulfilment
- **THEN** the request shows their name as assignee, moves to `In Progress`, and the requester is notified

#### Scenario: Hand over completes the request
- **WHEN** the assigned IT Admin marks the asset handed over
- **THEN** the request becomes `Fulfilled` with the fulfilment date shown, and the requester is notified

#### Scenario: Transitions are ordered
- **WHEN** a hand-over is attempted on a request still `Approved` (never started)
- **THEN** the transition is refused
