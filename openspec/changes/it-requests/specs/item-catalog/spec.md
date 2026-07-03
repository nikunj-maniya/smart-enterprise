## ADDED Requirements

### Requirement: Tenant item catalogs
The system SHALL maintain per-tenant software and hardware item catalogs, seeded on tenant activation from the PRD §7.4 defaults (13 software items, 27 hardware items), powering the IT form's item pickers.

#### Scenario: New tenant gets default catalogs
- **WHEN** an enterprise is activated
- **THEN** its software and hardware catalogs are seeded with the PRD default items, active

### Requirement: Enterprise Admin catalog CRUD
An Enterprise Admin SHALL add, rename, and archive catalog items. An item referenced by any existing request SHALL NOT be deleted; the UI SHALL explain the blockage and offer archive instead. Archived items disappear from pickers but keep historical requests readable.

#### Scenario: Item added
- **WHEN** an Enterprise Admin adds "YubiKey" to the hardware catalog
- **THEN** it immediately appears in the hardware item picker for new requests

#### Scenario: Referenced item archive-only
- **WHEN** an Enterprise Admin tries to delete an item referenced by past requests
- **THEN** deletion is refused with an explanation and an archive option; archiving hides it from new requests while past requests still display it

#### Scenario: Catalog changes audit-logged
- **WHEN** any catalog item is added, renamed, or archived
- **THEN** an immutable audit entry records the actor, item, and before/after values
