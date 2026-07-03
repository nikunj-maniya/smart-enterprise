## 1. Console Shell & Navigation

- [x] 1.1 Derive sidebar sections from the union of the logged-in user's roles (drop the prototype's workspace switcher) _(Slice 1)_
- [x] 1.2 Add the Organization sidebar section + admin route guards (Enterprise Admin role, active tenant) _(Slice 1)_. Configuration section (Leave Policy/Form Builder/Slack) deferred to the changes that own those pages.
- [x] 1.3 Seed System roles + default departments in the accept transaction, with a backfill for already-active tenants _(Slice 1)_

## 2. Departments Master

- [ ] 2.1 Tenant-scoped Department CRUD API (Zod-validated, audited) _(Slice 2)_
- [ ] 2.2 Departments page: card grid, search, empty state, pagination — match the design exactly _(Slice 2)_
- [ ] 2.3 Department create/edit via the entity modal (name, head, members count display) _(Slice 2)_

## 3. Roles & Permissions Master

- [ ] 3.1 Permission catalog constant (PRD §4.4) + tenant-scoped Role CRUD API (System roles undeletable, audited) _(Slice 3)_
- [ ] 3.2 Roles page: table (Role, Scope, Members, System/Custom badge, Edit), search, filters, pagination _(Slice 3)_
- [ ] 3.3 Role create/edit modal with permission-bundle selection _(Slice 3)_

## 4. User Master

- [ ] 4.1 Tenant-scoped user list API + create/deactivate/reset endpoints (argon2 hash, `resetPassword` flag, audited) _(Slice 4)_
- [ ] 4.2 Users page: stat cards, table, search, filter chips, empty state, pagination — match the design _(Slice 4)_
- [ ] 4.3 Add User modal (name, email, password, roles, departments) + Deactivate and Reset-password row actions _(Slice 4)_

## 5. Self-Registration Link

- [ ] 5.1 Link token API: generate/revoke, per-enterprise expiry setting (default 30 min) _(Slice 5)_
- [ ] 5.2 Public employee self-registration page for a valid token → active Employee-role user _(Slice 5)_
- [ ] 5.3 Expired/revoked-link refusal states + link management UI on the Users page _(Slice 5)_

## 6. Projects Master

- [ ] 6.1 Tenant-scoped Project CRUD API with PM/Tech Lead/member assignment (audited) _(Slice 6)_
- [ ] 6.2 Projects page: table (Project, PM, Tech Lead, Members, Status, Edit), search, filters, pagination _(Slice 6)_
- [ ] 6.3 Project create/edit modal (name, status, PM, Tech Lead, members) _(Slice 6)_

## 7. Referential Integrity

- [ ] 7.1 Dependency-count checks blocking deletes across departments/roles/projects, with named reasons _(Slice 7)_
- [ ] 7.2 `archived` flag + archive action; archived masters hidden from pickers, visible in history _(Slice 7)_
- [ ] 7.3 Blocked-delete UI: explanation + offer archive/reassign path _(Slice 7)_

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
