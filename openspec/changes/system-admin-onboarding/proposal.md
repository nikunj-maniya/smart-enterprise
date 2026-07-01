## Why

`setup-foundation` gives us the schema and a seeded System Admin, but nothing can yet log in or operate the platform. The design's first completed slice is the **shared auth flow plus the System Admin console**, which delivers the platform's first end-to-end journey: an enterprise self-registers → a System Admin accepts → accounts go live.

## What Changes

- Add **platform authentication for all users** (System Admin, Enterprise Admin, employees): email/password login, force-change on first login, and password reset (self-service link where email is enabled, admin-initiated as the no-email fallback).
- Add **public enterprise registration**: company details + the Enterprise Admin's chosen username/password; the enterprise + admin account are created `Pending`, hashed, and inactive.
- Add **System Admin onboarding review**: Accept (activate the enterprise + its Enterprise Admin) / Reject (capture a reason, release the email reservation); plus Suspend / Reactivate.
- Add the **System Admin console**: platform overview dashboard, cross-enterprise Platform Users view, immutable Audit Log, and Platform Settings.

Scope is the System-Admin slice of the design only. Employee request flows (Leave/WFH/Visitor/IT) are out of scope for this change.

## Capabilities

### New Capabilities
- `platform-auth`: login, session, force-change-on-first-login, and password reset — for every user role.
- `enterprise-onboarding`: public registration → System Admin accept/reject, with suspend/reactivate over the enterprise lifecycle.
- `system-admin-console`: the platform overview, Platform Users view, Audit Log, and Settings pages.

### Modified Capabilities
<!-- none — builds on setup-foundation's data-model without changing it -->

## Impact

- Depends on `setup-foundation` (`Tenant`, `EnterpriseRegistration`, `User`, `AuditLog` entities + the seeded System Admin).
- Adds auth endpoints/guards, registration + review APIs, and the System Admin console UI.
- Establishes the login + cross-tenant access boundary every later feature change builds on.
