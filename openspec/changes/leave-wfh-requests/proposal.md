## Why

The platform's core purpose — replacing Google Forms for employee requests — is unmet until employees can actually submit Leave and WFH requests and have balances tracked accurately (PRD §7.1, §7.2, §10). This is the Phase-1 flagship: the first end-to-end employee journey.

## What Changes

- Add the **Leave request wizard** (3 steps per the design): department/project/PM/Tech-Lead selection, conditional HR Head sign-off when away > 2 days, date/day-count validation, leave type, context + routing preview.
- Add the **WFH request wizard** (3 steps, mirrors Leave): duration, conditional HR sign-off, "can you not avoid this WFH?", special-condition soft flag (server-checked against history, flags for HR, never blocks).
- Add the **Employee My Requests home**: awaiting-approval stat, per-leave-type balance cards with progress bars, requests table opening the Request Detail drawer, withdraw while permitted.
- Add the **Leave Policy & Quotas admin page**: annual allocations per leave type, carry-forward and half-day toggles, HR-threshold and concurrent-cap display.
- Add the **leave balance engine**: exactly-once atomic deduction when the last required approver approves, restore on cancel/withdraw of an approved request, LWP never deducts, half-days count 0.5, pre-submit over-balance warning.
- Add the **HR Head Sign-offs screen**: Awaiting-HR/Decided tabs, sign-off/decline with reason — the HR view of the conditional > 2-days stage.

## Capabilities

### New Capabilities
- `leave-requests`: the Leave wizard, its validation and conditional HR stage, and the employee My Requests home.
- `wfh-requests`: the WFH wizard, its conditional HR stage, and the special-condition soft flag.
- `leave-balances`: leave types/quotas configuration and the atomic deduction/restore engine.
- `hr-signoffs`: the HR Head queue for conditional sign-offs on Leave/WFH requests.

### Modified Capabilities
<!-- none — consumes form-engine, approval-workflow, and org-masters as-is -->

## Impact

- **Depends on** `form-engine` (core renderer, status lifecycle), `approval-workflow` (parallel approval engine, approver snapshot, request drawer), `org-masters` (projects/PM/TL/HR-Head role data), and `notifications-inapp` (decision/status notifications).
- Adds Leave/WFH `FormDefinition` seeds, `LeaveType`/`LeaveBalance` usage, request submission + balance endpoints, and the employee/HR screens listed above.
- The balance-deduction hook extends the approval engine's final-decision path — the single place concurrency is serialized.
