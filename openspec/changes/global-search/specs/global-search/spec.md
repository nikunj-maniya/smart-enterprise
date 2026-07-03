## ADDED Requirements

### Requirement: Search overlay
The app SHALL provide a global search overlay opened from the topbar trigger or keyboard shortcut and closed with Esc, showing empty, no-results, and result states with icon + title + subtitle rows, matching the design.

#### Scenario: Open and dismiss
- **WHEN** the user presses the search shortcut and then Esc
- **THEN** the overlay opens focused on the input and closes without navigation

#### Scenario: No results state
- **WHEN** the user searches a term matching nothing they may see
- **THEN** the overlay shows the no-results state

### Requirement: Role-scoped results
Search SHALL return only entities the caller is authorized to see: tenant users get their own requests plus the enterprise's users, projects, and departments per their roles; a System Admin gets enterprises, registrations, and platform users.

#### Scenario: Employee finds own request, not others'
- **WHEN** an employee searches a term matching their own request and a colleague's request
- **THEN** only the employee's own request is returned

#### Scenario: System Admin finds an enterprise
- **WHEN** a System Admin searches an enterprise name
- **THEN** the matching enterprise appears with its status

### Requirement: Tenant isolation in search
Search for a tenant user SHALL never return records from another enterprise.

#### Scenario: Cross-tenant name yields nothing
- **WHEN** a tenant user searches the exact name of another enterprise's user or project
- **THEN** no cross-tenant record is returned

### Requirement: Deep-link navigation
Selecting a search result SHALL navigate to the screen that owns the record, opening its detail where one exists.

#### Scenario: Result opens owning screen
- **WHEN** the user selects a project result
- **THEN** the app navigates to the Projects page with that project in view
