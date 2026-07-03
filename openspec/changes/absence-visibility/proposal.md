## Why

Requests carry sensitive personal context, yet HR and Management need to see who is away to plan coverage. PRD §11A resolves this tension with role-based visibility rules and a shared absence calendar — without them, either privacy leaks or planners fly blind.

## What Changes

- Enforce **role-based request visibility** server-side on every list/detail endpoint: requesters see only their own; assigned approvers see full detail of requests routed to them; pending requests are invisible to everyone else; approved Leave/WFH surface as absences with role-gated detail (PM/TL: their project members; Management: availability only, reason hidden; HR: full detail).
- Add the **shared Absence Calendar**: month grid with stacked color-coded per-person chips, "+N more" overflow with day detail, multi-day spans, day-count badges, filters (department/project/type/person), and a list/agenda alternative view.
- Add its two entry points per the design: HR Head **Absences** (with away-this-week and by-project side panels) and Enterprise Admin **Absence Calendar** (with the over-concurrent-cap warning panel).

## Capabilities

### New Capabilities
- `request-visibility`: the server-enforced role-based visibility rules for pending requests and approved absences.
- `absence-calendar`: the shared calendar grid, filters, agenda view, and its HR/Admin entry points.

### Modified Capabilities
<!-- none — layers read-side rules over existing request data -->

## Impact

- **Depends on** `leave-wfh-requests` (approved Leave/WFH are the absence source) and `org-masters` (roles, projects, departments for scoping and filters).
- Adds a central visibility policy module in the API that all request list/detail queries pass through, absence feed endpoints, and the two calendar screens.
- Touches existing request endpoints only to route them through the policy module — no behaviour change for requesters/approvers.
