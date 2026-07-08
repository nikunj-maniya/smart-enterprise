-- AlterTable
-- Backfill existing rows with CURRENT_TIMESTAMP for the new required columns;
-- updatedAt keeps no DB-level default going forward (Prisma's @updatedAt sets it on writes).
ALTER TABLE "FormDefinition" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
