## ADDED Requirements

### Requirement: Departments master
An Enterprise Admin SHALL create, edit, and list departments; activating an enterprise SHALL seed the default departments (IOT, Developer, HR, Admin & Management, Sales & Marketing, Other) which remain fully editable.

#### Scenario: New tenant gets seed departments
- **WHEN** a System Admin accepts an enterprise registration
- **THEN** the six default departments exist for that enterprise

#### Scenario: Admin creates a department
- **WHEN** the admin submits the department modal with a name and optional head
- **THEN** the department is created and appears in the card grid with its member count

### Requirement: Roles as permission bundles
Roles SHALL be named permission bundles; activating an enterprise SHALL seed the System roles (Employee, Project Manager, Tech Lead, HR Head, Process Head, IT Admin, Enterprise Admin) per the PRD §4.4 matrix, and admins SHALL create custom roles; System roles cannot be deleted.

#### Scenario: Custom role created
- **WHEN** the admin creates a role selecting a set of permissions
- **THEN** the role is available for assignment and shows the Custom badge in the roles table

#### Scenario: System role delete refused
- **WHEN** the admin attempts to delete a seeded System role
- **THEN** the delete is refused with an explanation

### Requirement: Projects master
An Enterprise Admin (or Project Manager) SHALL create and edit projects with a Project Manager, Tech Lead, and members; project assignments SHALL drive approver resolution in request forms.

#### Scenario: Project with PM and Tech Lead
- **WHEN** the admin creates a project assigning a PM, a Tech Lead, and members
- **THEN** the project lists in the table with those assignments and its status badge

### Requirement: Referential-integrity on master-data deletes
Deleting a department, role, project, or other master record SHALL be blocked while dependent records reference it; the UI SHALL explain the blockage and offer archive (or reassignment) instead. Edits SHALL always be allowed.

#### Scenario: Department with users cannot be deleted
- **WHEN** the admin deletes a department that has assigned users
- **THEN** the delete is refused, the reason names the dependency, and archive is offered

#### Scenario: Unreferenced master is deletable
- **WHEN** the admin deletes a department with no users or other references
- **THEN** the department is removed

#### Scenario: Archived master is hidden from new use
- **WHEN** a master record is archived
- **THEN** it no longer appears in pickers for new records while historical records keep displaying it

### Requirement: Org-structure mutations are audited
Every create, edit, archive, and delete of departments, roles, and projects SHALL be written to the immutable audit log.

#### Scenario: Role edit is logged
- **WHEN** the admin changes a role's permissions
- **THEN** an `AuditLog` entry records the actor, the role, and the before/after permission sets
