## 1. Platform Auth

- [ ] 1.1 Add email/password login (argon2 verify) issuing JWT access + refresh tokens
- [ ] 1.2 On login with the backend `resetPassword` flag, route to Change Password; on success persist and clear the flag
- [ ] 1.3 Add password reset: self-service link (where email enabled) + admin-initiated fallback
- [ ] 1.4 Build login, forgot-password, reset confirmation, and Change Password screens

## 2. Enterprise Onboarding

- [ ] 2.1 Public registration endpoint: create `Tenant` + Enterprise Admin `User` as Pending/inactive, password hashed
- [ ] 2.2 Build the public registration form + submitted-confirmation screen
- [ ] 2.3 System Admin Accept: atomically activate enterprise + admin account
- [ ] 2.4 System Admin Reject: capture reason, release the email reservation
- [ ] 2.5 Suspend / Reactivate an enterprise
- [ ] 2.6 Build the Registrations queue (Pending/All tabs), review modal, and reject-reason modal

## 3. System Admin Console

- [ ] 3.1 Overview dashboard: pending/active/users/suspended counts, latest registrations, recent activity
- [ ] 3.2 Enterprises list with Suspend/Reactivate actions
- [ ] 3.3 Platform Users read-only cross-enterprise view
- [ ] 3.4 Immutable Audit Log view
- [ ] 3.5 Platform Settings: persist and enforce the three toggles (not display-only)

## 4. Verify

- [ ] 4.1 Seeded System Admin logs in and is forced to change the password
- [ ] 4.2 Register an enterprise → it appears Pending in the queue
- [ ] 4.3 Accept activates the enterprise + admin; the admin can log in with the registration password
- [ ] 4.4 Reject captures a reason and frees the email for re-registration
- [ ] 4.5 Every accept/reject/suspend/reactivate appears in the Audit Log
