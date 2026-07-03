## Why

The design prototype ships a global search overlay in the topbar, and the product decision of 2026-07-03 confirmed it as a requirement: users need one place to find "anything" they're allowed to see — requests, people, projects — without knowing which page owns it. (This is a new requirement beyond the current PRD text; the PRD has not been updated yet.)

## What Changes

- Add the **global search overlay**: opened from the topbar search trigger or keyboard shortcut, closed with Esc; result rows show icon + title + subtitle; empty and no-results states per the design.
- Add the **role-scoped search API**: one endpoint querying the entity types the caller may see —
  - tenant users: their own requests, plus users, projects, and departments of their enterprise (masters gated by role);
  - System Admin: enterprises, registrations, and platform users.
- Enforce **tenant isolation** on every search path; results never cross enterprises for tenant users.
- **Deep-link results**: selecting a result navigates to the owning screen (request drawer, user row, project row…).
- Designed for **extension**: later changes (visitor, IT, forms) register their entity types with the same search service.

## Capabilities

### New Capabilities
- `global-search`: the overlay UI and the role- and tenant-scoped search API.

### Modified Capabilities
<!-- none -->

## Impact

- Depends on `org-masters` (users/projects/departments to search) and the app shell topbar. Request results become available as `approval-workflow`/`leave-wfh-requests` land.
- Adds one search endpoint and the overlay component; per-entity queries reuse existing tenant-scoped repositories.
