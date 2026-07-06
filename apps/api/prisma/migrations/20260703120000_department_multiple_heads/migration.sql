-- CreateTable
CREATE TABLE "DepartmentHead" (
    "departmentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "DepartmentHead_pkey" PRIMARY KEY ("departmentId","userId")
);

-- CreateIndex
CREATE INDEX "DepartmentHead_userId_idx" ON "DepartmentHead"("userId");

-- Preserve existing single head assignments as one-member head sets
INSERT INTO "DepartmentHead" ("departmentId", "userId")
SELECT "id", "headUserId" FROM "Department" WHERE "headUserId" IS NOT NULL;

-- DropForeignKey
ALTER TABLE "Department" DROP CONSTRAINT "Department_headUserId_fkey";

-- DropIndex
DROP INDEX "Department_headUserId_idx";

-- AlterTable
ALTER TABLE "Department" DROP COLUMN "headUserId";

-- AddForeignKey
ALTER TABLE "DepartmentHead" ADD CONSTRAINT "DepartmentHead_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentHead" ADD CONSTRAINT "DepartmentHead_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
