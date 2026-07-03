## 1. Visitor Registration

- [ ] 1.1 Add the Visitor core `FormDefinition` metadata (fields, validation, Process Head routing) + seed _(Slice 1)_
- [ ] 1.2 Registration endpoint: validate (Zod), enforce consent + conditional day-count server-side, create request `Pre-Registered` with snapshotted Process Head approver _(Slice 1)_
- [ ] 1.3 Build the Visitor form screen per the design (directory picker, gadget fields, gated no-of-days, consent link + checkbox) _(Slice 1)_
- [ ] 1.4 Wire the Process Head approval stage: approve → `Approved`, reject with reason → `Cancelled`, host notified _(Slice 2)_

## 2. Front Desk

- [ ] 2.1 Front-desk permission + today-view API: expected / on-site / checked-out queries, tenant-scoped _(Slice 3)_
- [ ] 2.2 Build the Front Desk screen per the design (stat cards, All today/Expected/On-site tabs, visitor cards, laptop chip, empty state) _(Slice 3)_
- [ ] 2.3 Check-in action: `Approved → Checked-In`, record `check_in_at`, audit log, notify host _(Slice 4)_
- [ ] 2.4 Check-out action: `Checked-In → Checked-Out`, record `check_out_at`, audit log, notify host, "Visit complete" state _(Slice 4)_
- [ ] 2.5 No-Show and host Cancel transitions with role gating _(Slice 5)_

## 3. Verify

- [ ] 3.1 Host pre-registers a visitor with gadgets → Process Head sees it in their approvals queue
- [ ] 3.2 Consent unchecked blocks submission client- and server-side
- [ ] 3.3 Check-in refused before approval; allowed after; host notified on check-in and check-out
- [ ] 3.4 Front Desk counts (Expected/On-site/Checked-out) match card states across the day
- [ ] 3.5 Every lifecycle action appears in the tenant Audit Log
