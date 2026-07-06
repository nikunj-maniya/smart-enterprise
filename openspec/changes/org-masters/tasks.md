## 1. Console Shell & Navigation

- [x] 1.1 Derive sidebar sections from the union of the logged-in user's roles (drop the prototype's workspace switcher) _(Slice 1)_
- [x] 1.2 Add the Organization sidebar section + admin route guards (Enterprise Admin role, active tenant) _(Slice 1)_. Configuration section (Leave Policy/Form Builder/Slack) deferred to the changes that own those pages.
- [x] 1.3 Seed System roles + default departments in the accept transaction, with a backfill for already-active tenants _(Slice 1)_

## 2. Departments Master

- [x] 2.1 Tenant-scoped Department Create/List/Update/**Delete** API (Zod-validated, audited) _(Slice 2; delete added per user feedback 2026-07-06)_. `DELETE /departments/:id` with a card trash action + confirm modal; blocked (§5A.1) while users are assigned or requests reference it (its own head rows are cleared on delete).
- [x] 2.2 Departments page: card grid, search, empty state, pagination — match the design exactly _(Slice 2)_
- [x] 2.3 Department create/edit via the entity modal (name, heads) _(Slice 2; heads made multi-select per user feedback 2026-07-03)_. A department supports **multiple heads** (a `DepartmentHead` join table, replacing the single `headUserId`); the modal is a multi-select and the card lists all heads. Members count is a real computed value (UserDepartment count, 0 until Slice 4 ships user↔department assignment) rather than the prototype mock's free-typed number.

## 3. Roles & Permissions Master

- [x] 3.1 Permission catalog constant (PRD §4.4) + tenant-scoped Role create/list/update/**delete** API, audited _(Slice 3; delete added per user feedback 2026-07-03)_. System roles get an `isSystem` flag + the §4.4 permission bundle seeded (backfilled for existing tenants); they're renamable but their permissions are fixed. Delete enforces the §5A.1 referential-integrity rule: System roles refused, custom roles with assigned members refused (names the count), unused custom roles removed. (Slice 7 extends the same archive/reassign pattern to departments & projects.)
- [x] 3.2 Roles page: table (Role, Scope, Members, Type badge, Edit + Delete for custom roles), search, System/Custom filter chips, pagination _(Slice 3)_. "Scope" column renders a derived summary of the role's permission bundle (the prototype's free-text scope is superseded by the design.md catalog+bundle decision). Custom-role rows have a delete (trash) action + confirm modal; System roles show Edit only.
- [x] 3.3 Role create/edit modal with permission-bundle selection _(Slice 3)_. Grouped permission checklist (General/Approvals/Administration per §4.4) replaces the prototype mock's free-text scope + editable members number — the mock predates the design.md "roles are bundles storing a subset of a fixed catalog" decision; Members is a real computed count, not an input.

## 4. User Master

- [x] 4.1 Tenant-scoped user list API + create/deactivate/**reactivate**/reset/**remove** endpoints (argon2 hash, `resetPassword` flag, audited) _(Slice 4; remove added per user feedback 2026-07-06)_. `/org-users` expanded from the Slice 2 picker into the full User Master (list/stats/create/deactivate/reactivate/reset-password/**delete**); the lightweight picker moved to `/org-users/options` (which also gained a `?role=` filter for the project PM/Tech-Lead pickers). Reactivate added beyond the prototype's (unwired) intent to avoid a deactivation dead-end. `DELETE /org-users/:id` permanently removes a user but is blocked (§5A.1 referential integrity) while they head a department, are on a project, or have submitted requests — deactivate preserves history instead.
- [x] 4.2 Users page: stat cards, table, search, status filter chips + department dropdown, empty state, pagination _(Slice 4)_. Stat cards show **Active / Deactivated / Departments** — "Invited" from the mock is dropped since D-30 removed the email/invite step (it would always be 0); Deactivated is the real, useful count.
- [x] 4.3 Add User modal (name, email, password, **multi**-role, **multi**-department) + **Edit-user** modal (name, roles, departments; email read-only) + Deactivate (with confirm) and Reset-password (temp-password modal) row actions, plus Reactivate _(Slice 4; edit added per user feedback 2026-07-06)_. Per PRD §4.2 a user holds one-or-many roles/departments and design.md D-30 ("admin sets initial password, forced change on first login"), the modal supersedes the prototype's single-select/no-password invite mock; the "Send Invite" button label is kept per design.md. Edit lets the admin change any user's roles/departments after creation (e.g. promoting a self-registered Employee) — `PUT /org-users/:id`, tenant-scoped + audited.

## 5. Self-Registration Link

- [x] 5.1 Link token API: generate/revoke, per-enterprise expiry (chosen at generation, default 30 min), audited _(Slice 5)_. New `RegistrationLink` model (one active link per tenant; token stored raw so the admin can re-copy the invite URL). Enterprise-Admin guarded. Links are reusable until expiry/revocation.
- [x] 5.2 Public employee self-registration page (`/join/:token`) for a valid token → **Pending** Employee-role user awaiting Enterprise Admin approval (self-chosen password, no forced change) _(Slice 5; approval-required per user feedback 2026-07-06)_. Net-new page in the existing auth-card style (the prototype has no self-registration screen); duplicate email refused. Per PRD §5A.2 ("optional admin approval per policy"), self-registrants land Pending and cannot log in until approved.
- [x] 5.3 Expired/revoked/invalid-link refusal states + link management modal on the Users page ("Share invite link" → generate/copy/regenerate/revoke), **plus a pending-approval queue**: the Users page gains a Pending status filter (with a count badge) and Approve/Reject row actions for pending self-registrations (approve → Active; reject → discards the request and frees the email); audited _(Slice 5)_. Net-new UI matching the design system.

## 6. Projects Master

- [x] 6.1 Tenant-scoped Project create/list/update/**delete** API with PM/Tech Lead/member assignment, audited _(Slice 6; delete added per user feedback 2026-07-06)_. Adds `Project.status` (active/archived); reuses `ProjectMember.roleInProject` (PM/TL/member). A user holds one slot per project (PK), so PM≠TL is enforced and members exclude whoever is PM/TL. `DELETE /projects/:id` (row trash + confirm) is blocked (§5A.1) while people are assigned (PM/TL/members) or requests reference it — clear those or archive instead.
- [x] 6.2 Projects page: table (Project, Project Manager, Tech Lead, Members, Status, Edit), search, All/Active/Archived filter chips, pagination — match the design _(Slice 6)_. Status is an **inline dropdown** (change Active⇄Archived directly from the row), not just a static badge (user feedback 2026-07-06).
- [x] 6.3 Project create/edit modal (name, status, single-select PM, single-select Tech Lead, **multi-select members**) _(Slice 6)_. Members is a real user multi-select (the count in the table is the real `ProjectMember` count) rather than the prototype mock's free-typed number. Per user feedback (2026-07-06): the **PM dropdown lists only Project-Manager-role holders and the Tech Lead dropdown only Tech-Lead-role holders** (via `/org-users/options?role=`), while Members lists all enterprise users except the chosen PM/Lead. The current holder is kept selectable on edit even if their role was later removed.

## 7. Referential Integrity

- [x] 7.1 Dependency-count checks blocking deletes across departments/roles/projects (and users), with named reasons _(brought forward into Slices 3/4/6 per user feedback 2026-07-06)_. Roles block on assigned members (System roles undeletable); Departments block on assigned users/requests; Projects block on assigned people/requests; Users block on dept-head/project/requests. All audited.
- [ ] 7.2 `archived` flag + archive action; archived masters hidden from pickers, visible in history _(Slice 7 — still pending; Projects already have an active/archived status, but a generic archive-instead-of-delete flow for departments/roles is not built)_
- [x] 7.3 Blocked-delete UI: confirmation modals with explanation + named dependency reason (and, for projects, the archive-instead hint) _(brought forward per user feedback 2026-07-06)_. Delete affordances: role/project row trash, department card trash, user row trash — each with a confirm modal surfacing the API's dependency message on 409.

## 8. Profile

- [ ] 8.1 Self-profile API: read/update own info + change-password endpoint _(Slice 8)_
- [ ] 8.2 Profile page per the design (avatar header, personal info form, change password; notification toggles rendered disabled) _(Slice 8)_

## 9. Verify

- [ ] 9.1 A user with System Admin + Enterprise Admin roles sees both sidebars' sections; an Employee sees neither admin section
- [ ] 9.2 Accepting a new enterprise seeds System roles + default departments
- [ ] 9.3 Admin-created user must change password on first login; deactivated user cannot log in
- [ ] 9.4 Self-registration link works until expiry/revocation and lands an Employee
- [ ] 9.5 Deleting a department with users is blocked with an archive offer; an empty one deletes
- [ ] 9.6 Every master mutation appears in the Audit Log
