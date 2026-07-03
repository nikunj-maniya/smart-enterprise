## ADDED Requirements

### Requirement: Metadata-driven form definitions
Every form (core or custom) SHALL be described by a tenant-scoped `FormDefinition` composed of ordered sections and typed fields (key, label, helpText, type, required, options, validation, visibility rule), so that labels, ordering, options, validation, and routing can change without a redeploy.

#### Scenario: Published definition is served for rendering
- **WHEN** a client requests the published definition for a form key within its tenant
- **THEN** the API returns the latest published version's sections, fields, validation, visibility rules, approval workflow, and status model

#### Scenario: Definitions are tenant-isolated
- **WHEN** a user of tenant A requests a form definition
- **THEN** only tenant A's definitions are readable; another tenant's definitions are never returned

### Requirement: Supported field types
The engine SHALL support the PRD §6.3 field types: text, textarea, number, date, datetime, time, daterange, single-select, multi-select, radio, checkbox, checkbox-group, user-picker (searchable, single/multi, filterable by role and/or department), project-picker, file-upload, consent-link, and section/group. Field types outside this list SHALL be rejected at definition time.

#### Scenario: User-picker options resolve from the directory
- **WHEN** a field of type `user-picker` declares a role filter (e.g. `HR Head`)
- **THEN** its options resolve server-side to active users of the tenant holding that role, never free text

#### Scenario: Unknown field type is rejected
- **WHEN** a definition containing an unsupported field type is saved
- **THEN** the API refuses it with a validation error naming the offending field

### Requirement: Immutable versioning with request pinning
Publishing a form definition SHALL create a new immutable version; in-flight and historical requests SHALL remain pinned to the version they were created under, so schema changes never affect existing records.

#### Scenario: Publish creates a new version
- **WHEN** an editable definition is published
- **THEN** a new immutable version row is created, becomes the active published version, and prior versions remain readable

#### Scenario: Requests stay pinned across republish
- **WHEN** a request was created under version 2 and version 3 is later published
- **THEN** the request continues to validate and render against version 2

### Requirement: Seeded core form definitions
The four core forms — Leave, WFH, Visitor Registration, and IT Change/Addition — SHALL be seeded as published `core`-renderer form definitions per PRD §7 for every active tenant, including their fields, conditional rules, approval workflow, and status model.

#### Scenario: New tenant gets the core forms
- **WHEN** an enterprise is activated
- **THEN** its tenant has published Leave, WFH, Visitor, and IT definitions matching PRD §7

### Requirement: Server-side payload validation
On submission the server SHALL validate the payload against the pinned definition version — required fields, types, option membership, validation rules, and visibility (a hidden field's answer is rejected; a conditionally-required visible field is enforced) — and store it as JSONB alongside the promoted typed columns.

#### Scenario: Hidden-field answer is rejected
- **WHEN** a payload contains a value for a field whose visibility rule evaluates false for that payload
- **THEN** submission is refused with a validation error

#### Scenario: Conditionally-required field is enforced
- **WHEN** a visibility rule makes a required field visible (e.g. HR Head when duration > 2 days) and the payload omits it
- **THEN** submission is refused

#### Scenario: Valid payload stores hybrid columns
- **WHEN** a valid payload is submitted
- **THEN** the request stores the full JSONB payload and the promoted typed columns (dates, day counts, leave type, department, project) extracted from it
