## ADDED Requirements

### Requirement: Custom forms render generically
Any published custom `FormDefinition` SHALL render for employees through the generic renderer with no per-form code: all §6.3 field types (text, textarea, number, date/datetime/time, daterange, selects, radio, checkboxes, user-picker, project-picker, file-upload, consent-link, sections), required/validation rules, and §6.4 visibility rules evaluated client-side.

#### Scenario: Published custom form renders
- **WHEN** an employee opens a published custom form
- **THEN** every field renders per its metadata with validation and conditional visibility active

#### Scenario: Conditional field hidden and cleared
- **WHEN** a visibility rule hides a field the employee had filled
- **THEN** the field is hidden and its value excluded from submission

### Requirement: Generic submissions join the standard pipeline
Submissions from the generic renderer SHALL be validated server-side against the pinned form version (required fields, types, visibility-consistent payload) and SHALL create standard requests — approvals, status lifecycle, notifications, and audit identical to core forms.

#### Scenario: Server re-validates against metadata
- **WHEN** a submission omits a required visible field or includes a hidden field's value
- **THEN** the server rejects it with a validation error

#### Scenario: Custom request flows like a core one
- **WHEN** a valid custom-form submission is accepted
- **THEN** approvers are snapshotted per the configured routing, the request appears in approvals queues and My Requests, and status changes notify the requester

### Requirement: Admin creates a working form without engineering
As the Phase-3 acceptance test (PRD §16), an Enterprise Admin SHALL be able to build, publish, and receive submissions on a brand-new form end-to-end without any engineering involvement.

#### Scenario: End-to-end no-code form
- **WHEN** an admin builds a new form with conditional fields and role routing, publishes it, and an employee submits it
- **THEN** the request reaches the configured approver and completes its lifecycle with zero code changes
