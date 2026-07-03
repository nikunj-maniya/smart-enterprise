## Context

Builds on `system-admin-onboarding`: enterprises can be activated but contain only their admin. The design prototype's Admin screens (Users, Departments, Roles, Projects, Add User modal, polymorphic entity modal, Profile) define the UI. PRD §4 (roles/permission matrix), §5A (console pages 2–5), §5A.1 (referential integrity), and §5A.2 (two onboarding methods) govern behaviour.

## Goals / Non-Goals

**Goals:**
- An Enterprise Admin can populate their org: users, departments, roles, projects.
- Both user-onboarding methods work: admin-created and self-registration link.
- Master data is safe to evolve: blocked deletes with an archive path, edits always allowed.
- Every user gets a Profile page.

**Non-Goals:**
- Leave policy & quotas page (lands with `leave-wfh-requests`).
- Form Builder and Slack pages (Phase 3 changes).
- Notification-preference behaviour (toggles render disabled until `notifications-inapp`).

## Decisions

- **Role-union sidebar, no persona switcher** (product decision, 2026-07-03) — the prototype's workspace-switcher dropdown is dropped; the sidebar renders the union of all sections granted by the user's roles. Rationale: one mental model, no hidden context, matches "user with System Admin + Enterprise Admin sees both".
- **Permissions are a fixed catalog, roles are bundles** — the §4.4 capability list is a shared constant; a `Role` stores a subset (`permissions[]`). Custom permission *types* need engineering; custom bundles don't. Avoids building a permission-editor UI for capabilities the engine can't enforce.
- **System roles are seeded and undeletable** — Employee, PM, Tech Lead, HR Head, Process Head, IT Admin, Enterprise Admin are created at tenant activation so approver routing can rely on them existing; deletion refused, renaming allowed.
- **Default departments seeded at activation** (PRD §4.3) — the accept flow gains a seeding step; existing active tenants get a backfill migration.
- **Archive over delete** — masters get an `archived` flag; deletes run a dependency count first and are refused with the dependency named. Archived records vanish from pickers but keep rendering in history. Simpler and safer than cascading reassignment.
- **Self-registration links are single-URL tokens** — random token, per-enterprise expiry window (default 30 min), revocable by replacing/deleting the token. New registrants get only the Employee role; no admin review step (per §5A.2).
- **Add-user creates a full credentialed account** — matching D-30 (no email dependency in v1): the admin sets the initial password; `resetPassword = true` forces a change at first login. The design's "Send Invite" button label is kept but performs this create.
- **Audit threading** — every mutation in this change calls the same append-only audit writer introduced in `system-admin-onboarding`, now with tenant-scoped entries.

## Risks / Trade-offs

- [Union sidebar can get long for many-role users] → sections stay grouped and labelled per role area (Platform, Organization, Workspace…), matching the prototype's grouping so scanning stays cheap.
- [Seeding on accept couples onboarding to org-masters] → the seeder is one idempotent function called from the accept transaction; a backfill script covers tenants activated before this change.
- [Fixed permission catalog may not fit a future custom form's needs] → acceptable for v1; the catalog is one constant to extend, and Phase 3's builder revisits it.

## Open Questions

<!-- none — the persona-switcher and self-registration decisions were resolved with the user on 2026-07-03 -->
