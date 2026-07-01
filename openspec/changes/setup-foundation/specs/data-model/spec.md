## ADDED Requirements

### Requirement: Tenant data isolation
Every tenant-scoped table SHALL carry a non-null `tenant_id`, and the schema SHALL model the entities defined in PRD §12.

#### Scenario: tenant_id present on tenant-scoped tables
- **WHEN** the Prisma schema is reviewed
- **THEN** every tenant-scoped entity has a non-null `tenant_id` column

#### Scenario: Migration runs clean
- **WHEN** `prisma migrate` is run against the Dockerized Postgres
- **THEN** the migration completes without error and all §12 entities exist

### Requirement: Form field value storage
The system SHALL store form answers as a hybrid of a canonical JSONB payload plus promoted typed columns; the generic `RequestFieldValue` EAV table SHALL NOT be used.

#### Scenario: Canonical payload
- **WHEN** a request record is created
- **THEN** all form answers are stored in a `Request.payload` JSONB column

#### Scenario: Promoted columns for cross-cutting queries
- **WHEN** a Leave/WFH request is stored
- **THEN** `start_date`, `end_date`, `total_days`, `half_day_count`, `leave_type_id`, `department_id`, and `project_id` are also written to typed, indexed columns

### Requirement: Bootstrap System Admin seed
The system SHALL seed a single platform System Admin account so the first enterprise registrations can be reviewed.

#### Scenario: Seed creates the admin
- **WHEN** the seed runs
- **THEN** a System Admin account `systemadmin@smartenterprise.com` exists with its password stored hashed

#### Scenario: Force change on first login
- **WHEN** the seeded System Admin logs in for the first time
- **THEN** the system requires the password to be changed before any other action
