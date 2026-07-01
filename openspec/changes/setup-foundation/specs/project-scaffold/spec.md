## ADDED Requirements

### Requirement: Monorepo structure
The project SHALL be organized as a monorepo with separate frontend, backend, and shared-types packages.

#### Scenario: Packages present
- **WHEN** the repository is inspected
- **THEN** `apps/web`, `apps/api`, and `packages/shared` exist with their own package manifests

#### Scenario: Shared types are importable
- **WHEN** code in `apps/web` or `apps/api` imports a type from `packages/shared`
- **THEN** the import resolves and type-checks in both packages

### Requirement: Dockerized dev runtime
The system SHALL run end-to-end via Docker with the application and its datastores as containers.

#### Scenario: All services start
- **WHEN** `docker compose up` is run
- **THEN** `api`, `web`, `postgres`, and `redis` services start without errors

#### Scenario: Frontend reaches backend
- **WHEN** the web app loads in a browser
- **THEN** it successfully calls the API health-check endpoint and shows a healthy status
