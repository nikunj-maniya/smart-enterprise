# org-structure

## MODIFIED Requirements

### Requirement: Roles as permission bundles
Roles SHALL be named permission bundles; activating an enterprise SHALL seed the System roles (Employee, Project Manager, Tech Lead, HR Head, Process Head, IT Admin, Enterprise Admin, Finance) per the PRD §4.4 matrix, and admins SHALL create custom roles; System roles cannot be deleted. The Finance role SHALL carry the `view_attendance_report` permission (also granted to Enterprise Admin); the `manage_holidays` permission SHALL be granted to HR Head and Enterprise Admin. Tenants activated before the Finance role existed SHALL be backfilled with it and with the new permission grants.

#### Scenario: Custom role created
- **WHEN** the admin creates a role selecting a set of permissions
- **THEN** the role is available for assignment and shows the Custom badge in the roles table

#### Scenario: System role delete refused
- **WHEN** the admin attempts to delete a seeded System role
- **THEN** the delete is refused with an explanation

#### Scenario: Finance role seeded and backfilled
- **WHEN** an enterprise is activated, or an existing active tenant is migrated
- **THEN** the tenant has a Finance System role carrying `view_attendance_report`, and its HR Head and Enterprise Admin roles carry `manage_holidays`
