## ADDED Requirements

### Requirement: Front Desk day view
The system SHALL provide a Front Desk screen showing today's visitors as cards (visitor name, status badge, company/host/purpose, laptop chip when gadgets declared, time label) with stat cards for Expected, On-site now, and Checked out, and tabs for All today / Expected / On-site, including an empty state. Access SHALL be permission-gated; there is no dedicated Reception role — Admin/HR roles carry the front-desk permission.

#### Scenario: Today's visitors listed
- **WHEN** a user with front-desk permission opens the Front Desk
- **THEN** all of today's visitors for the tenant are shown with correct counts per stat card and tab

#### Scenario: Unauthorized user blocked
- **WHEN** a user without front-desk permission calls a Front Desk API
- **THEN** the request is refused

### Requirement: Check-in only after approval
The system SHALL allow check-in only for visitors in `Approved` status; checking in records `check_in_at` and moves the visitor to `Checked-In`.

#### Scenario: Approved visitor checks in
- **WHEN** front-desk staff press Check in on an `Approved` visitor
- **THEN** `check_in_at` is recorded, status becomes `Checked-In`, and the action is audit-logged

#### Scenario: Unapproved visitor cannot check in
- **WHEN** a check-in is attempted on a `Pre-Registered` (not yet approved) visitor
- **THEN** the transition is refused

### Requirement: Check-out and terminal states
The system SHALL allow check-out of a `Checked-In` visitor, recording `check_out_at` and moving them to `Checked-Out`; visitors who never arrive SHALL be markable `No-Show`, and hosts may cancel a not-yet-checked-in visit (`Cancelled`).

#### Scenario: Visitor checks out
- **WHEN** front-desk staff press Check out on a `Checked-In` visitor
- **THEN** `check_out_at` is recorded and the card shows "Visit complete"

#### Scenario: No-show marked
- **WHEN** an expected visitor's day passes without check-in and staff mark No-Show
- **THEN** the visitor moves to `No-Show` and is excluded from on-site counts

### Requirement: Host notified on check-in/out
The system SHALL send the host an in-app notification when their visitor checks in and when they check out.

#### Scenario: Host notified of arrival
- **WHEN** a visitor is checked in
- **THEN** the host employee receives an in-app notification naming the visitor
