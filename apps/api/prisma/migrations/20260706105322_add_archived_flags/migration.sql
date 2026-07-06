-- AlterTable
ALTER TABLE "Department" ADD COLUMN     "archived" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Role" ADD COLUMN     "archived" BOOLEAN NOT NULL DEFAULT false;
