## ADDED Requirements

### Requirement: Request dashboards
Authorized roles SHALL get dashboards summarizing request volumes, approval turnaround, and absence trends, scoped by the same visibility rules that govern the underlying data.

#### Scenario: HR views turnaround trends
- **WHEN** an HR user opens the reporting dashboard
- **THEN** request counts and approval turnaround render for their tenant, respecting role visibility

### Requirement: CSV/Excel export
Authorized roles SHALL export any report/list view they can see to CSV or Excel; exports contain only rows and fields the exporter is allowed to view.

#### Scenario: Export respects visibility
- **WHEN** a Management user exports the absence report
- **THEN** the file contains availability-level fields only — no reason/context columns

### Requirement: PWA baseline
The web app SHALL be installable as a PWA with an app manifest and a basic offline shell for previously loaded views.

#### Scenario: User installs the app
- **WHEN** a user installs the PWA and reopens it offline
- **THEN** the shell loads and clearly indicates that live data requires a connection
