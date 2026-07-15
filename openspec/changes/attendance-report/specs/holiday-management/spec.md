# holiday-management

## ADDED Requirements

### Requirement: Holiday master CRUD
Holders of the `manage_holidays` permission (seeded on the HR Head and Enterprise Admin System roles) SHALL create, update, and delete company holidays for their tenant. A holiday SHALL have a valid calendar date (`YYYY-MM-DD`) and a name (1–100 characters); at most one holiday SHALL exist per tenant per date. Weekend dates SHALL be accepted but have no effect on working-day math. Holiday create, update, and delete SHALL be audit-logged.

#### Scenario: HR Head creates a holiday
- **WHEN** an HR Head posts a valid date and name
- **THEN** the holiday is created (201) and appears in the tenant's holiday list

#### Scenario: Duplicate date refused
- **WHEN** a holiday is created or moved onto a date that already has one in the tenant
- **THEN** the API responds 409

#### Scenario: Unauthorized management refused
- **WHEN** a user without `manage_holidays` attempts to create, update, or delete a holiday
- **THEN** the API responds 403

### Requirement: Holiday visibility
Any authenticated tenant user SHALL list their tenant's holidays by year, sorted by date ascending.

#### Scenario: Employee lists holidays
- **WHEN** an Employee requests `GET /holidays?year=2026`
- **THEN** the tenant's 2026 holidays are returned sorted by date

### Requirement: Holidays reduce working days
A tenant holiday falling on a weekday SHALL be excluded from the working-day baseline used by attendance reporting; Saturdays and Sundays SHALL always be excluded regardless of holidays.

#### Scenario: Weekday holiday excluded from baseline
- **WHEN** a month contains one tenant holiday on a weekday
- **THEN** that month's `workingDays` is one less than its weekday count

#### Scenario: Weekend holiday is a no-op
- **WHEN** a tenant holiday falls on a Saturday or Sunday
- **THEN** the month's `workingDays` is unchanged
