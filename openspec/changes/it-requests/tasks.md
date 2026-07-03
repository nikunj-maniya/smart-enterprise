## 1. Item Catalog

- [ ] 1.1 `ItemCatalog` CRUD API: add/rename/archive, delete blocked when referenced, audit-logged, seeded on tenant activation _(Slice 1)_
- [ ] 1.2 Catalog management UI in the Enterprise Admin console (software + hardware lists, archive flow) _(Slice 1)_

## 2. IT Request Form

- [ ] 2.1 Add the IT core `FormDefinition` (access-type branch visibility rules, catalog-sourced item options, impact, Process Head routing) _(Slice 2)_
- [ ] 2.2 Submission endpoint: Zod validation, branch re-validation server-side, ≥1 item required, request created `Requested` with snapshotted approver _(Slice 2)_
- [ ] 2.3 Build the IT form screen per the design (access-type pills → progressive disclosure, item chips, impact pills) _(Slice 2)_
- [ ] 2.4 Wire Process Head approval: approve → `Approved` (enters queue), reject with reason → `Rejected`, requester notified _(Slice 3)_

## 3. Fulfilment Queue

- [ ] 3.1 Fulfilment APIs: queue query (IT Admin only), assign-to-me (guarded claim), start (`Approved → In Progress`), hand-over (`In Progress → Fulfilled`), all audit-logged _(Slice 4)_
- [ ] 3.2 Build the Fulfilment Queue per the design (stat cards, Open/Fulfilled tabs, impact badges, assignee, lifecycle buttons, empty state) _(Slice 4)_
- [ ] 3.3 Requester notifications on In Progress and Fulfilled _(Slice 5)_

## 4. Verify

- [ ] 4.1 Software and hardware branches each submit cleanly; cross-branch fields rejected server-side
- [ ] 4.2 Catalog archive hides an item from new requests but past requests still render it
- [ ] 4.3 Approve → queue → assign → In Progress → Fulfilled, with requester notified at each stage
- [ ] 4.4 Hand-over refused on a never-started request; non-IT-Admin refused queue access
- [ ] 4.5 Catalog edits and every fulfilment step appear in the Audit Log
