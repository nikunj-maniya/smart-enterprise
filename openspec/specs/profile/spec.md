# profile Specification

## Purpose
TBD - created by archiving change org-masters. Update Purpose after archive.
## Requirements
### Requirement: Profile self-service
Every logged-in user SHALL view and edit their own profile (full name, phone, job title, location) from the Profile page; email, roles, and departments SHALL remain admin-managed and read-only there.

#### Scenario: User updates personal info
- **WHEN** a user edits their name and job title and saves
- **THEN** the changes persist and the header/avatar reflects the new name

#### Scenario: Restricted fields are read-only
- **WHEN** a user opens their profile
- **THEN** email, roles, and departments are displayed but not editable

### Requirement: Change password from profile
A user SHALL change their own password from the Profile page with new-password and confirmation fields validated per the platform password policy.

#### Scenario: Successful password change
- **WHEN** a user submits a valid new password with matching confirmation
- **THEN** the password is re-hashed and saved, and the next login requires the new password

#### Scenario: Mismatched confirmation refused
- **WHEN** the confirmation does not match the new password
- **THEN** the change is refused with an inline validation message

