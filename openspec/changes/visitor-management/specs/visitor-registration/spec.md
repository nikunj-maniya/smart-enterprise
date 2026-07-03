## ADDED Requirements

### Requirement: Visitor pre-registration form
A host employee SHALL pre-register a visitor via the Visitor Registration core form with: visitor name, mobile, whom-to-meet (employee directory picker), purpose, optional laptop details, optional other-device details, a Process Head approval picker restricted to users holding the Process Head role, date & time of visit, out time, optional address, and optional passport number. The form SHALL be rendered by the core renderer from its metadata definition.

#### Scenario: Host pre-registers a visitor
- **WHEN** a host employee submits the form with all required fields valid
- **THEN** a visitor request is created in `Pre-Registered` status, tenant-scoped, with the selected Process Head snapshotted as its approver

#### Scenario: Process Head picker is role-restricted
- **WHEN** the host opens the Process Head approval picker
- **THEN** only active users of the tenant holding the Process Head role are offered

### Requirement: Multi-day visit declaration
The form SHALL include a "visitor will come for the next few days" checkbox; the number-of-days input SHALL be disabled unless that checkbox is checked, and required when it is.

#### Scenario: Days input gated by checkbox
- **WHEN** the checkbox is unchecked
- **THEN** the number-of-days input is disabled and no value is submitted

#### Scenario: Days required when multi-day
- **WHEN** the checkbox is checked and no day count is provided
- **THEN** submission is rejected with a validation error, client- and server-side

### Requirement: Privacy-policy consent is mandatory
The form SHALL display a link to the privacy policy with a consent checkbox, and the system SHALL refuse submission without consent. Consent SHALL be stored with the visitor record. Signature capture is deferred to Phase 4 and SHALL NOT block v1 submission.

#### Scenario: Submission without consent is blocked
- **WHEN** the host submits the form with the consent checkbox unchecked
- **THEN** the submission is rejected client- and server-side

#### Scenario: Consent persisted
- **WHEN** a registration is submitted with consent checked
- **THEN** the stored visitor record carries the consent flag for compliance retention

### Requirement: Process Head approval stage
Each visitor registration SHALL require approval by the selected Process Head before check-in is possible, using the approval engine; approval moves the request to `Approved`, rejection (with reason) moves it to `Cancelled`.

#### Scenario: Process Head approves
- **WHEN** the selected Process Head approves the registration
- **THEN** the visitor moves to `Approved` and appears in the Front Desk expected list for the visit date

#### Scenario: Process Head rejects
- **WHEN** the Process Head rejects with a reason
- **THEN** the visitor moves to `Cancelled` and the host is notified with the reason
