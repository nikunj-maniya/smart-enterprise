## ADDED Requirements

### Requirement: Form authoring
An Enterprise Admin SHALL create and edit forms in a two-pane builder: a form list (name, field count, last updated, Draft/Published badge) and a field editor where fields are added via a modal (label, type from the §6.3 set, required toggle), reordered by drag handle, edited, and deleted. Changes SHALL save as a Draft without affecting the published form.

#### Scenario: Admin drafts a new form
- **WHEN** an Enterprise Admin creates a form, adds fields, and saves draft
- **THEN** the form is stored as a Draft definition visible only in the builder, not to employees

#### Scenario: Field reordered
- **WHEN** the admin drags a field to a new position and saves
- **THEN** the stored section order matches the new arrangement

### Requirement: Publishing creates an immutable version
Publishing a form SHALL create an immutable new version and make it available to employees; subsequent edits start a new draft. In-flight requests SHALL remain pinned to the version they were created under.

#### Scenario: Publish makes the form live
- **WHEN** the admin publishes a draft
- **THEN** employees see the new form (or new version) in New Request, and the published version can no longer be mutated

#### Scenario: In-flight requests unaffected
- **WHEN** a form is republished while requests on the old version are pending
- **THEN** those requests continue rendering and validating against their pinned version

### Requirement: Configurable routing and status model
The builder SHALL let the admin configure a custom form's approval routing (approver roles / picker fields, parallel mode) and its status model (states and role-gated transitions), validated against engine guardrails (at least one terminal state, no orphan states, no self-approval).

#### Scenario: Routing configured without engineering
- **WHEN** the admin sets a custom form to route to a role-restricted picker selection
- **THEN** submitted requests snapshot approvers per that rule and flow through the standard approvals queue

#### Scenario: Invalid status model rejected
- **WHEN** the admin tries to publish a status model with an unreachable state
- **THEN** publish is refused with a message naming the problem

### Requirement: Core forms editable within metadata bounds
The builder SHALL open core forms (Leave, WFH, Visitor, IT) for relabeling, reordering, validation and routing edits — published as new versions without redeploy. Structural changes requiring new field types SHALL be refused with an explanatory message.

#### Scenario: Core form relabeled
- **WHEN** the admin renames a Leave field label and publishes
- **THEN** the Leave form renders the new label for new requests, with no code change
