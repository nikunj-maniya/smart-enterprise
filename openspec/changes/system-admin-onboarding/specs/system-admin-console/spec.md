## ADDED Requirements

### Requirement: Platform overview
The System Admin console SHALL present a platform overview with pending-review, active-enterprise, platform-user, and suspended counts, plus latest registrations and recent activity.

#### Scenario: Overview loads
- **WHEN** the System Admin opens the Overview
- **THEN** the four metric cards, the latest registrations list, and the recent activity feed are shown

### Requirement: Cross-enterprise platform users view
The System Admin SHALL see a read-only list of accounts across all enterprises; enterprise users SHALL NOT see across tenants.

#### Scenario: Read-only cross-tenant list
- **WHEN** the System Admin opens Platform Users
- **THEN** accounts from all enterprises are listed read-only, with no edit actions

### Requirement: Immutable audit log
The console SHALL show an append-only audit log capturing every accept, reject, suspend, reactivate, and first-login password change.

#### Scenario: Action is recorded
- **WHEN** a System Admin accepts, rejects, suspends, or reactivates
- **THEN** an immutable audit entry with actor, action, target, and time is recorded and visible

### Requirement: Platform settings
The console SHALL expose platform settings — force password change on first login, allow public enterprise registration, and notify on new registration — that are persisted and enforced, not display-only.

#### Scenario: Settings are viewable and persisted
- **WHEN** the System Admin changes a toggle
- **THEN** the new state is saved and reflected on reload

#### Scenario: Toggle changes behaviour
- **WHEN** "allow public enterprise registration" is turned off
- **THEN** the public registration form no longer accepts submissions
