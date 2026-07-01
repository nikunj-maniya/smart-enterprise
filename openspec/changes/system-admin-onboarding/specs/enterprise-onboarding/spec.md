## ADDED Requirements

### Requirement: Public enterprise registration
Anyone SHALL be able to submit an enterprise registration with company details plus the intended Enterprise Admin's username and chosen password; the enterprise and admin account SHALL be created Pending and inactive with the password stored hashed.

#### Scenario: Registration submitted
- **WHEN** a prospect submits the registration form
- **THEN** a `Tenant` (status Pending) and an Enterprise Admin `User` (inactive, password hashed) are created and a confirmation is shown

#### Scenario: Pending account cannot log in
- **WHEN** the pending Enterprise Admin attempts to log in before approval
- **THEN** login is refused

### Requirement: System Admin accept/reject
Only a System Admin SHALL review registrations and Accept or Reject them.

#### Scenario: Accept activates the enterprise
- **WHEN** a System Admin Accepts a pending registration
- **THEN** the enterprise becomes Active and the Enterprise Admin account is activated in one transaction, with no invite email sent

#### Scenario: Reject captures a reason
- **WHEN** a System Admin Rejects a registration with a reason
- **THEN** the registration is marked Rejected, the account stays inactive, and that email is permanently blocked from submitting another registration

### Requirement: Enterprise suspend / reactivate
A System Admin SHALL be able to suspend an active enterprise and reactivate a suspended one.

#### Scenario: Suspend blocks sign-in
- **WHEN** a System Admin suspends an enterprise
- **THEN** the enterprise becomes Suspended and its users cannot log in until reactivated
