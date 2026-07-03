## Why

Onboarding can activate an enterprise, but its Enterprise Admin then has nothing to administer: no employees, departments, roles, or projects. Every request flow (Leave/WFH approver routing, Process Head selection, project-scoped Tech Leads) depends on these masters existing first — this change delivers the Enterprise Admin console and the four org masters that all later feature changes build on.

## What Changes

- Add the **Enterprise Admin console shell**: the admin's Organization/Configuration sidebar sections inside the existing app shell.
- Adopt the **role-union sidebar** rule: a user sees the union of the menu sections of every role they hold (product decision, 2026-07-03 — replaces the prototype's workspace-switcher dropdown).
- Add the **User Master**: admin-created users (add-user modal), deactivate, admin-initiated password reset, search/filter/pagination.
- Add **employee self-registration links**: revocable, expiring (configurable per enterprise, default 30 min); self-registrants land as Employees.
- Add the **Departments master** (card grid + create/edit modal) with default departments seeded on tenant activation.
- Add the **Roles & Permissions master**: roles as permission bundles, seeded System roles + custom roles.
- Add the **Projects master**: projects with Project Manager, Tech Lead, and members — the source for approver auto-routing in later changes.
- Enforce **master-data referential integrity**: deletes are blocked while dependent records exist, with an explanation and an archive/reassign path; edits are always allowed.
- Add the **Profile page**: personal info + change password for every persona (notification-preference toggles render disabled until `notifications-inapp` lands).

## Capabilities

### New Capabilities
- `enterprise-admin-console`: the admin sidebar sections and the role-union navigation rule.
- `user-management`: user CRUD, both onboarding methods, deactivation, and admin password reset.
- `org-structure`: departments, roles & permissions, projects, and the referential-integrity rules.
- `profile`: self-service personal info and password change.

### Modified Capabilities
<!-- none — extends the app shell without changing existing requirements -->

## Impact

- Depends on `system-admin-onboarding` (login, active tenants) and `setup-foundation` (`Department`, `Role`, `User`, `UserRole`, `UserDepartment`, `Project`, `ProjectMember` entities).
- Adds tenant-scoped org APIs and the admin console UI; every mutation writes to the immutable `AuditLog`.
- The role-union sidebar and the masters (users, projects, roles) are prerequisites for `form-engine`, `approval-workflow`, and every request-form change.
