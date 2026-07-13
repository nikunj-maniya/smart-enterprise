-- global-search (design.md): pg_trgm GIN indexes on the name/title columns searched via
-- Prisma's `contains + insensitive` (compiles to ILIKE) so those scans stay indexed at scale.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "User_name_trgm_idx" ON "User" USING GIN (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "User_email_trgm_idx" ON "User" USING GIN (email gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Project_name_trgm_idx" ON "Project" USING GIN (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Department_name_trgm_idx" ON "Department" USING GIN (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Tenant_name_trgm_idx" ON "Tenant" USING GIN (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "EnterpriseRegistration_companyName_trgm_idx" ON "EnterpriseRegistration" USING GIN ("companyName" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "EnterpriseRegistration_contactName_trgm_idx" ON "EnterpriseRegistration" USING GIN ("contactName" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "EnterpriseRegistration_contactEmail_trgm_idx" ON "EnterpriseRegistration" USING GIN ("contactEmail" gin_trgm_ops);
