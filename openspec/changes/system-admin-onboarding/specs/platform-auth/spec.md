## ADDED Requirements

### Requirement: Email/password login
Every user (System Admin, Enterprise Admin, employee) SHALL authenticate with email and password, and only active accounts SHALL be granted a session.

#### Scenario: Active user logs in
- **WHEN** a user submits a correct email/password for an active account
- **THEN** the system verifies the hash and issues an access + refresh token

#### Scenario: Inactive account is blocked
- **WHEN** a user submits credentials for a Pending, Rejected, or Suspended account
- **THEN** login is refused and no session is issued

### Requirement: Forced password change
When the backend returns a `resetPassword` flag on the logged-in user, the system SHALL route to a dedicated Change Password screen and block all other actions until the password is changed; on success the new password SHALL be persisted and the flag cleared so it never prompts again.

#### Scenario: Flagged user must change password
- **WHEN** a user logs in and the backend returns `resetPassword = true` (including the seeded System Admin's first login)
- **THEN** the Change Password screen is shown and no other action is allowed until it completes

#### Scenario: Change is one-time
- **WHEN** the user submits a valid new password on the Change Password screen
- **THEN** the password is saved, the `resetPassword` flag is cleared, and later logins go straight to the app

### Requirement: Password reset
The system SHALL let a user who forgot their password reset it via a self-service link where email is enabled, with an admin-initiated reset as the no-email fallback.

#### Scenario: Self-service reset requested
- **WHEN** a user submits their email on the forgot-password screen
- **THEN** a reset link is sent if email is enabled and the user account exists

#### Scenario: Admin-initiated fallback
- **WHEN** email is not enabled for the enterprise
- **THEN** an authorized admin can issue a password reset for the user
