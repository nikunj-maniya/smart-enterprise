## ADDED Requirements

### Requirement: Per-user notification preferences
A user SHALL tune which notification types they receive per channel from their Profile page, within what tenant policy allows; mandatory notification types SHALL NOT be disableable.

#### Scenario: User mutes an optional type
- **WHEN** a user turns off an optional notification type for a channel and saves
- **THEN** subsequent notifications of that type skip that channel for that user

#### Scenario: Mandatory types cannot be muted
- **WHEN** a notification type is marked mandatory by tenant policy
- **THEN** its toggle is disabled and delivery continues regardless of preferences
