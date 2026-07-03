## ADDED Requirements

### Requirement: Shared month calendar
The absence calendar SHALL render a Sun–Sat month grid where each day stacks color-coded chips per absent person, multi-day absences render as continuous spans, days show a count badge (e.g. "5 away"), and overflow collapses to "+N more" with a day-detail listing everyone away with type and dates.

#### Scenario: Concurrent absences stack
- **WHEN** several people are away on the same day
- **THEN** the day cell stacks their chips, shows the day count, and overflow beyond the cell cap becomes "+N more" opening the day detail

### Requirement: Filters and agenda view
The calendar SHALL filter by department, team/project, absence type, and person, and SHALL offer a list/agenda alternative to the month grid.

#### Scenario: Filtered planning view
- **WHEN** a viewer filters by project and switches to agenda view
- **THEN** only matching absences appear, listed chronologically

### Requirement: HR Absences entry point
The HR Head SHALL get the Absences screen: on-leave-today/WFH-today/awaiting-sign-off stats, the calendar, and away-this-week and by-project side panels — with full detail per the visibility rules.

#### Scenario: HR plans the week
- **WHEN** an HR Head opens Absences
- **THEN** the stats, calendar, and both side panels render from approved absences across the tenant

### Requirement: Admin calendar with concurrency warnings
The Enterprise Admin SHALL get the Absence Calendar with an over-concurrent-cap warning panel listing days where absences exceed the configured cap, naming those away; reasons stay hidden per the Management-level visibility rules.

#### Scenario: Over-cap day is flagged
- **WHEN** approved absences on a day exceed the tenant's concurrent-absence cap
- **THEN** the warning panel lists that day and the people away, and the day is visually flagged in the grid
