## ADDED Requirements

### Requirement: Branched IT request form
The IT Change/Addition core form SHALL open with an access-type choice (Software / Hardware) that branches the rest of the form. The Software branch SHALL offer request types Change of access / Removal / New access; the Hardware branch SHALL offer Change of item / New item. Both branches SHALL include catalog-driven item selection, an impact choice (Blocker / Medium / Low), a job-role description, and a reason.

#### Scenario: Software branch shown
- **WHEN** the requester picks Software as the access type
- **THEN** the software request types and the software item catalog are shown, and no hardware fields are submitted

#### Scenario: Branch fields re-validated server-side
- **WHEN** a submission carries fields belonging to the other branch
- **THEN** the server rejects it with a validation error

### Requirement: Items selected from the tenant catalog
Item selection SHALL offer only active items from the tenant's catalog for the chosen branch, and at least one item SHALL be required.

#### Scenario: Active catalog items offered
- **WHEN** the requester opens the item picker on the Hardware branch
- **THEN** only the tenant's active hardware catalog items are offered

#### Scenario: No items selected
- **WHEN** the requester submits without selecting any item
- **THEN** submission is rejected client- and server-side

### Requirement: Process Head approval routing
The requester SHALL select a Process Head (picker restricted to that role) whose approval is required before fulfilment; approval moves the request to `Approved`, rejection with reason moves it to `Rejected`. The selected approver SHALL be snapshotted onto the request.

#### Scenario: Request submitted for approval
- **WHEN** the requester submits a valid IT request
- **THEN** it is created in `Requested` status with the chosen Process Head snapshotted as approver and notified

#### Scenario: Rejection ends the request
- **WHEN** the Process Head rejects with a reason
- **THEN** the request becomes `Rejected` and the requester is notified with the reason
