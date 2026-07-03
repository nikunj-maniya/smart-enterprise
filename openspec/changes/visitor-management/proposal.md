## Why

Phase 2 opens with visitor management: today a host employee has no way to pre-register a guest, security has no approved list, and nobody records who is on-site. The design's Visitor form and Front Desk screens cover this end-to-end; the form-engine, approval-workflow, and notifications changes give it rails to run on.

## What Changes

- Add the **Visitor Registration core form** (PRD §7.3): a host employee pre-registers a visitor with contact details, purpose, gadget declarations, visit timing, and a mandatory privacy-policy consent checkbox. Signature capture is **deferred to Phase 4** (needs object storage).
- Route each registration to a requester-selected **Process Head** for gadget/entry approval via the approval engine.
- Add the **Front Desk screen** for check-in/check-out. There is **no dedicated Reception role** — users whose roles grant front-desk permission (Admin/HR) operate it.
- Add the **visitor status lifecycle**: `Pre-Registered → Approved → Checked-In → Checked-Out / No-Show / Cancelled`, driven by the status-lifecycle engine.
- Notify the host in-app when their visitor checks in or out.

## Capabilities

### New Capabilities
- `visitor-registration`: the visitor pre-registration form, its validation/conditional fields, consent requirement, and Process Head routing.
- `front-desk`: the on-site day view with check-in/check-out actions and the visitor lifecycle transitions they drive.

### Modified Capabilities
<!-- none — consumes form-engine, approval-workflow, and notifications-inapp as-is -->

## Impact

- Depends on `form-engine` (core renderer + status models), `approval-workflow` (Process Head stage), `notifications-inapp` (host notifications), and `org-masters` (user pickers, roles).
- Adds the Visitor form definition (core renderer), visitor-specific promoted columns (`check_in_at`, `check_out_at`, consent), Front Desk API + screen, and audit entries for every lifecycle action.
- No schema migration beyond what `setup-foundation` already modelled for `Visitor`.
