## ADDED Requirements

### Requirement: Role-union sidebar navigation
The sidebar SHALL show the union of the menu sections of every role the logged-in user holds, with no workspace/persona switcher.

#### Scenario: Multi-role user sees combined navigation
- **WHEN** a user holding both System Admin and Enterprise Admin roles logs in
- **THEN** the sidebar shows both the Platform/System sections and the Organization/Configuration sections at once

#### Scenario: Single-role user sees only their sections
- **WHEN** a user holding only the Employee role logs in
- **THEN** the sidebar shows only the employee Workspace section and no admin sections

### Requirement: Enterprise Admin console access
The Organization (Users, Departments, Roles, Projects) and Configuration pages SHALL be reachable only by users holding the Enterprise Admin role of an active enterprise, and every page SHALL operate strictly on that enterprise's data.

#### Scenario: Enterprise Admin reaches the console
- **WHEN** the admin of an active enterprise logs in
- **THEN** the sidebar shows the Organization and Configuration sections and each page lists only that enterprise's records

#### Scenario: Non-admin is denied
- **WHEN** a user without the Enterprise Admin role calls an org-master API or opens an admin page
- **THEN** the request is refused
