## Context

Builds on `leave-wfh-requests` (approved Leave/WFH are the absence source) and `org-masters` (roles/projects/departments). PRD §11A defines the viewer-by-status matrix; the design prototype's HR Absences and Admin Absence Calendar screens (shared grid component, side panels, over-cap panel) are the visual contract. Requests already exist and are queried by several screens — visibility must become a property of the data layer, not of individual screens.

## Goals / Non-Goals

**Goals:**
- One central, server-side policy answers "which requests/fields can this user see?" for every endpoint.
- HR and Admin get the shared calendar; Management-level views never receive reason/context.

**Non-Goals:**
- Approval routing/permissions (owned by `approval-workflow`).
- Visitor/IT visibility nuances beyond the same policy module (they plug in when Phase 2 lands).
- Calendar export/iCal (Phase 4 reporting).

## Decisions

- **A single visibility policy module in the API data layer** — every request list/detail/search/calendar query composes its Prisma `where` and field selection through this module, keyed by the viewer's roles/projects. Alternative (per-endpoint checks) was rejected: it's exactly how leaks happen as endpoints multiply.
- **Field stripping happens server-side via select shaping** — Management-level responses simply never include reason/context columns; no client-side hiding. Cheaper to audit and impossible to bypass from dev tools.
- **Absences are a query shape, not a table** — an absence is "an approved Leave/WFH request overlapping a date range"; no denormalized absence table to keep in sync. If calendar queries get hot, a materialized view is the escape hatch.
- **One calendar component, two role-configured entry points** — HR and Admin screens share the grid/agenda/filters component with props for side panels and the over-cap panel, matching the prototype's shared markup.
- **Over-cap uses the tenant's concurrent-absence cap** from the Leave Policy page; days are evaluated per-project and org-wide, mirroring the design's warning panel copy.

## Risks / Trade-offs

- [Policy module becomes a chokepoint for query performance] → it only shapes `where`/`select`; indexes on `(tenant_id, status, start_date, end_date)` keep calendar range scans cheap.
- [Rule drift between spec and code as new request types arrive] → the §11A matrix lives as one declarative table in the module with tests per viewer role, so a new form type must state its row explicitly.
- [Multi-day spans across month boundaries render partially] → the range query fetches absences overlapping the visible month, not merely starting in it.

## Open Questions

<!-- none — §11A resolves the visibility matrix; the cap comes from tenant policy -->
