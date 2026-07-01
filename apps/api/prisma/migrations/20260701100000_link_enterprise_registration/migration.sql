-- AlterTable
ALTER TABLE "EnterpriseRegistration" ADD COLUMN     "tenantId" TEXT NOT NULL,
ADD COLUMN     "userId" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "EnterpriseRegistration_tenantId_key" ON "EnterpriseRegistration"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "EnterpriseRegistration_userId_key" ON "EnterpriseRegistration"("userId");

-- AddForeignKey
ALTER TABLE "EnterpriseRegistration" ADD CONSTRAINT "EnterpriseRegistration_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnterpriseRegistration" ADD CONSTRAINT "EnterpriseRegistration_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

