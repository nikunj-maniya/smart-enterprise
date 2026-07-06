## ADDED Requirements

### Requirement: Admin-created users
An Enterprise Admin SHALL create users with name, email, initial password, roles, and departments; the account is active immediately and the initial password is hashed and flagged for forced change on first login.

#### Scenario: Admin adds a user
- **WHEN** the admin submits the add-user form with valid details
- **THEN** an active user is created in the admin's enterprise with the assigned roles/departments and `resetPassword = true`

#### Scenario: Duplicate email is refused
- **WHEN** the admin submits an email already used by any account
- **THEN** the creation is refused with a clear message and no user is created

### Requirement: Employee self-registration link
An Enterprise Admin SHALL generate a self-registration link that is revocable and expires after the enterprise's configured window (default 30 minutes); a person registering through a valid link SHALL land as an active Employee of that enterprise.

#### Scenario: Valid link registers an employee
- **WHEN** a person submits name/email/password through an unexpired, unrevoked link
- **THEN** an active user with only the Employee role is created in the link's enterprise

#### Scenario: Expired or revoked link is refused
- **WHEN** a person opens a link past its expiry or after the admin revoked it
- **THEN** registration is refused and no account is created

### Requirement: Deactivate user
An Enterprise Admin SHALL deactivate a user; a deactivated user cannot log in, while their historical records remain intact.

#### Scenario: Deactivated user is blocked
- **WHEN** the admin deactivates a user and that user attempts to log in
- **THEN** login is refused and the user's past requests/approvals remain visible where authorized

### Requirement: Admin-initiated password reset
An Enterprise Admin SHALL reset a user's password (the no-email fallback, D-30); the user is then forced to change it on next login.

#### Scenario: Reset forces a change
- **WHEN** the admin issues a reset for a user
- **THEN** the user's next login routes to the Change Password screen before anything else

### Requirement: User list with search, filter, pagination
The User Master SHALL list the enterprise's users with search, status/department filters, and pagination, matching the design's table (User, Department, Role, Status, Actions).

#### Scenario: Filtered search
- **WHEN** the admin searches a name and applies a status filter
- **THEN** only matching users of the admin's enterprise are listed, paginated

### Requirement: User mutations are audited
Every user create, deactivate, role/department change, and password reset SHALL be written to the immutable audit log with actor, target, and before/after state.

#### Scenario: Deactivation is logged
- **WHEN** the admin deactivates a user
- **THEN** an `AuditLog` entry records the actor, the user, the action, and the prior status
