## ADDED Requirements

### Requirement: Visitor signature capture
The visitor flow SHALL capture the visitor's signature at check-in and store it in object storage (MinIO) behind signed, non-public URLs, linked to the visitor record together with the privacy-policy consent.

#### Scenario: Signature stored on check-in
- **WHEN** a visitor signs at check-in
- **THEN** the signature image is written to object storage, referenced from the visitor record, and retrievable only via signed URLs by authorized roles

#### Scenario: Consent retained with the record
- **WHEN** an authorized role opens a checked-in visitor's record
- **THEN** the consent acknowledgement and signature are both available per the tenant's retention policy
