## ADDED Requirements

### Requirement: Requester sees own requests only
An ordinary employee SHALL see only their own requests (with live status) and SHALL never see another employee's requests in any list, search, or detail endpoint.

#### Scenario: Employee cannot read others' requests
- **WHEN** an employee requests a list or a detail of a request they neither submitted nor approve
- **THEN** the server excludes it from lists and refuses the detail

### Requirement: Assigned approvers see full detail
A user SHALL see the full detail (including reason/context) of exactly those requests routed to them as an approver.

#### Scenario: Approver opens a routed request
- **WHEN** an assigned approver opens a request awaiting or past their decision
- **THEN** all fields including reason/context are visible

### Requirement: Pending requests are private
While a request is pending, it SHALL be visible only to the requester and its assigned approvers — not to Management, PM/TL at large, or other employees.

#### Scenario: Management cannot see pending requests
- **WHEN** a Management-role user queries requests or the calendar
- **THEN** pending requests are absent from every response

### Requirement: Approved absences are role-gated
On approval, Leave/WFH requests SHALL surface as absences with detail gated by role: PM/Tech Lead see their project members' absences; Management sees availability only (person, dates, type — reason/context hidden); HR sees full detail.

#### Scenario: Management sees availability only
- **WHEN** a Management-role user views an approved absence
- **THEN** person, dates, and type are shown while reason/context fields are omitted from the API response itself

#### Scenario: HR sees full detail
- **WHEN** an HR-role user views an approved absence
- **THEN** the full request detail including reason/context is available

#### Scenario: PM scope is their projects
- **WHEN** a PM/Tech Lead views absences
- **THEN** only absences of members of their projects appear

### Requirement: Server-side enforcement
Visibility rules SHALL be enforced in the API's data layer on every request list, detail, search, and calendar endpoint — never by client-side filtering alone.

#### Scenario: Hidden fields never leave the server
- **WHEN** any role queries an endpoint beyond its visibility grant
- **THEN** the response omits the rows/fields at the server; no client filtering is relied on
