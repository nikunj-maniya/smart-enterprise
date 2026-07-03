## Why

The second Phase-2 form: employees have no tracked way to request software access or hardware, and IT has no queue — requests arrive over chat and vanish. PRD §7.4 specifies the IT Change/Addition form and its Process Head → IT Admin fulfilment chain; the design's IT form and Fulfilment Queue screens are complete.

## What Changes

- Add the **IT Change/Addition core form** (PRD §7.4): an access-type choice (Software / Hardware) branches the form; each branch offers its request types, catalog-driven item selection, impact (Blocker/Medium/Low), a requester-selected Process Head approver, job role, and reason.
- Add **item catalogs as master data**: software and hardware item lists seeded from the PRD, editable by the Enterprise Admin (archive, not delete, when referenced).
- Add the **IT status lifecycle**: `Requested → Approved → In Progress → Fulfilled/Closed`, with rejection possible at the approval stage.
- Add the **IT Admin Fulfilment Queue**: assign-to-me → start fulfilment → hand over asset, with stats, tabs, and impact badges per the design.
- Notify the requester when their request moves to In Progress and Fulfilled.

## Capabilities

### New Capabilities
- `it-requests`: the branched IT form, its validation, and Process Head routing.
- `it-fulfilment`: the IT Admin queue and the post-approval fulfilment lifecycle.
- `item-catalog`: tenant-scoped software/hardware item master data behind the form's item pickers.

### Modified Capabilities
<!-- none — consumes form-engine, approval-workflow, and notifications-inapp as-is -->

## Impact

- Depends on `form-engine` (core renderer + status models), `approval-workflow` (Process Head stage), `notifications-inapp` (requester notifications), and `org-masters` (roles, admin console shell for catalog pages).
- Adds the IT form definition, `ItemCatalog` master CRUD under the Enterprise Admin console, fulfilment APIs + queue screen, and audit entries for every action.
