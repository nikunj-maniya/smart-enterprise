## 1. Platform Auth

- [x] 1.1 Add email/password login (argon2 verify) issuing JWT access + refresh tokens _(Slice 0)_
- [x] 1.2 On login with the backend `resetPassword` flag, route to Change Password; on success persist and clear the flag _(Slice 0)_
- [x] 1.3 Add password reset: self-service link (where email enabled) + admin-initiated fallback; the emailed link opens a token-based Set New Password screen _(Slice 8)_
- [x] 1.4 Build login, forgot-password, reset confirmation, and token-based Set New Password screens — login + Change Password done _(Slice 0)_; forgot/reset/set-new-password screens _(Slice 8)_. The prototype has no Set New Password screen — built matching the existing auth-card style (decision, 2026-07-03)

## 2. Enterprise Onboarding

- [x] 2.1 Public registration endpoint: create `Tenant` + Enterprise Admin `User` as Pending/inactive, password hashed _(Slice 2)_
- [x] 2.2 Build the public registration form + submitted-confirmation screen _(Slice 2)_
- [x] 2.3 System Admin Accept: atomically activate enterprise + admin account _(Slice 2)_
- [x] 2.4 System Admin Reject: capture reason; rejected email is permanently blocked from re-registration _(Slice 2)_
- [x] 2.5 Suspend / Reactivate an enterprise _(Slice 4)_
- [x] 2.6 Build the Registrations queue (Pending/All tabs), review modal, and reject-reason modal _(Slice 2)_

## 3. System Admin Console

- [x] 3.1 Overview dashboard: pending/active/users/suspended counts, latest registrations, recent activity _(Slice 3)_
- [x] 3.2 Enterprises list with Suspend/Reactivate actions _(Slice 4)_
- [x] 3.3 Platform Users read-only cross-enterprise view _(Slice 5)_
- [x] 3.4 Immutable Audit Log view _(Slice 6)_
- [x] 3.5 Platform Settings: persist and enforce the three toggles (not display-only) _(Slice 7)_

## 4. Verify

- [ ] 4.1 Seeded System Admin logs in and is forced to change the password
- [ ] 4.2 Register an enterprise → it appears Pending in the queue
- [ ] 4.3 Accept activates the enterprise + admin; the admin can log in with the registration password
- [ ] 4.4 Reject captures a reason and frees the email for re-registration
- [ ] 4.5 Every accept/reject/suspend/reactivate appears in the Audit Log
