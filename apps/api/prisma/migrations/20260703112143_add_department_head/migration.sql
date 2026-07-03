-- AlterTable
ALTER TABLE "Department" ADD COLUMN     "headUserId" TEXT;

-- CreateIndex
CREATE INDEX "Department_headUserId_idx" ON "Department"("headUserId");

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_headUserId_fkey" FOREIGN KEY ("headUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
