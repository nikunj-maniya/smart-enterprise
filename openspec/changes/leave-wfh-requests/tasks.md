## 1. Leave Policy & Balances Foundation

- [ ] 1.1 Leave Policy & Quotas admin page: per-type annual allocations, carry-forward + half-day toggles, save with audit log _(Slice 1)_
- [ ] 1.2 Balance initialization: create/refresh `LeaveBalance` rows from the tenant policy _(Slice 1)_
- [ ] 1.3 Employee balance cards (used/total + progress) on My Requests, read-only _(Slice 2)_

## 2. Leave Wizard

- [ ] 2.1 Seed the Leave `FormDefinition` metadata (fields, validation, visibility rules) _(Slice 3)_
- [ ] 2.2 Wizard step 1: department/project/PM/Tech-Lead selects + discussed-with, matching the design _(Slice 3)_
- [ ] 2.3 Wizard step 2: duration pills, dates, day/half-day counts with cross-checks, when-will-you-go, leave type _(Slice 3)_
- [ ] 2.4 Wizard step 3: context + routing preview; submit creates the request with snapshotted approvers _(Slice 3)_
- [ ] 2.5 Conditional HR block: > 2 days shows mandatory HR Head select; server re-validates against the date range _(Slice 4)_
- [ ] 2.6 Over-balance pre-submit warning (warn, never block) _(Slice 4)_

## 3. WFH Wizard

- [ ] 3.1 Seed the WFH `FormDefinition` metadata _(Slice 5)_
- [ ] 3.2 WFH wizard steps 1–3 incl. can-you-not-avoid pills and conditional HR block _(Slice 5)_
- [ ] 3.3 Special-condition soft flag: server-side history check, badge for HR, never blocks _(Slice 5)_

## 4. My Requests

- [ ] 4.1 My Requests table (own requests only) opening the Request Detail drawer _(Slice 6)_
- [ ] 4.2 Awaiting-approval stat card + withdraw action while no approver has acted _(Slice 6)_

## 5. Balance Engine

- [ ] 5.1 Deduction hook in the approval engine's final-decision transaction: `FOR UPDATE` on the balance row, re-check, deduct (half-days 0.5) _(Slice 7)_
- [ ] 5.2 LWP exemption: final approval of LWP changes no paid balance _(Slice 7)_
- [ ] 5.3 Restore on authorized post-approval cancel and on permitted withdraw, under the same row lock _(Slice 8)_

## 6. HR Sign-offs

- [ ] 6.1 Sign-offs screen: Awaiting-HR/Decided tabs, request cards with flags + chain, empty state _(Slice 9)_
- [ ] 6.2 Sign off / Decline with reason modal; decline rejects the request _(Slice 9)_

## 7. Verify

- [ ] 7.1 Leave > 2 days forces HR selection; ≤ 2 days never shows it; server rejects mismatched claims
- [ ] 7.2 Two concurrent final approvals deduct exactly once; balance never negative
- [ ] 7.3 Cancel of an approved leave restores the days; LWP round-trips with no balance change
- [ ] 7.4 Withdraw is blocked after the first approver acts
- [ ] 7.5 Every submission/decision/cancel appears in the Audit Log
