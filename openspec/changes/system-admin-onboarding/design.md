## Context

Builds directly on `setup-foundation`. The design's completed screens cover the public auth pages (login, register, forgot/reset) and the System Admin console (overview, registrations, enterprises, platform users, audit, settings). PRD §5.1, §5A, §11 and §13 govern the behaviour. Single timezone: India (Asia/Kolkata). Auth is shared by **all** roles even though only the System Admin has actionable screens in this change.

## Goals / Non-Goals

**Goals:**
- Any user can log in with email/password; first login forces a password change.
- An enterprise can self-register and a System Admin can Accept/Reject/Suspend/Reactivate it.
- The System Admin can oversee the platform via overview, users, audit, and settings.

**Non-Goals:**
- Enterprise Admin / employee consoles and the four request forms (later changes).
- Full RBAC permission matrix beyond what these screens need.
- Notifying rejected applicants (deferred, D-29).

## Decisions

- **JWT (access + refresh) + argon2 hashing** per PRD §14 — matches the email/password-only decision and leaves SSO addable later.
- **Accept is atomic** — `Tenant Pending→Active` and the pre-created Enterprise Admin `User` activation happen in one transaction; no invite email is sent (they use the password set at registration).
- **Reject is permanent** — the `Tenant` becomes Rejected and the pre-created admin `User` becomes Inactive; that email can never be used to submit another registration (confirmed override of the PRD §5.1 "release" language — product decision, 2026-07-01).
- **System Admin is the only cross-tenant actor** — the Platform Users and Audit views read across tenants; every other query stays tenant-scoped. This bypass lives in one guarded place.
- **Audit log is append-only** — every accept/reject/suspend/reactivate and the first-login password change are written immutably (PRD §13).
- **Force-change driven by a `resetPassword` flag** — the backend returns a `resetPassword` flag on the user; when set, login routes to a dedicated Change Password screen. On success the new password is persisted and the flag is cleared, so it never prompts again.
- **Settings toggles are behavioural, not cosmetic** — "force password change on first login", "allow public registration", and "notify on new registration" are persisted and enforced (e.g. public registration is refused when its toggle is off).

## Risks / Trade-offs

- [Password reset with no email enabled] → fall back to **admin-initiated reset** (D-30); the email-link path is a no-op stub until email is configured.
- [Cross-tenant read bypass for System Admin] → centralize it behind a single System-Admin-only data path so no enterprise user can ever reach cross-tenant data.

## Open Questions

<!-- none — the change-password flow and settings behaviour are resolved above -->
- The design has no dedicated Change Password screen; it is added in this change per the resolved decision above.
- The design's forgot-password flow stops at "check your email" — there is no screen for entering the new password from the emailed link. Resolved (2026-07-03): a token-based Set New Password screen is added in Slice 8, styled to match the existing auth cards.
