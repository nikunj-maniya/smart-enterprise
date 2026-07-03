## ADDED Requirements

### Requirement: Metadata-driven rendering
The web app SHALL render a published form definition from its metadata — sections in order, each field by its type with label, help text, required marker, options, and validation — so that metadata edits (relabel, reorder, option changes) appear without a frontend redeploy.

#### Scenario: Definition renders from metadata
- **WHEN** a form screen loads a published definition
- **THEN** every section and field renders per its metadata (type, label, options, required) in the declared order

#### Scenario: Metadata edit needs no redeploy
- **WHEN** an admin republishes a definition with a relabelled field
- **THEN** the next render shows the new label with no frontend change

### Requirement: Client-side conditional visibility
The renderer SHALL evaluate visibility rules live as the user fills the form — showing, hiding, and re-validating dependent fields — with hidden fields excluded from the submitted payload.

#### Scenario: Dependent field appears
- **WHEN** the user selects an answer that satisfies another field's visibility rule (e.g. away duration "> 2 days")
- **THEN** the dependent field (e.g. HR Head picker) appears and its required rule activates

#### Scenario: Hidden field's value is dropped
- **WHEN** a field is hidden again after the user had entered a value
- **THEN** its value is cleared and excluded from the submitted payload

### Requirement: Picker fields resolve from live directory data
`user-picker` and `project-picker` fields SHALL render as searchable dropdowns backed by the tenant's directory (filtered by the field's role/department/project constraints) — never free-text entry.

#### Scenario: Role-filtered searchable picker
- **WHEN** the user opens a user-picker constrained to the PM/BA roles
- **THEN** a searchable list of the tenant's active users holding those roles is shown and only a listed user can be selected

### Requirement: Client validation mirrors server rules
The renderer SHALL enforce the definition's validation rules (required, min/max, date ordering, cross-field checks) before submit with inline error states per the design, while the server re-validates identically.

#### Scenario: Invalid input blocks submit
- **WHEN** a required visible field is empty or a validation rule fails (e.g. end date before start date)
- **THEN** the field shows the design's inline error state and submission is blocked
