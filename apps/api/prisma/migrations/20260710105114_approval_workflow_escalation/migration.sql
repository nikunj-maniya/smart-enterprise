-- AlterTable
ALTER TABLE "RequestApprover" ADD COLUMN     "escalatedAt" TIMESTAMP(3),
ADD COLUMN     "escalatedFromId" TEXT,
ADD COLUMN     "escalationCause" TEXT;

-- CreateTable
CREATE TABLE "EscalationRule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "fromContext" TEXT NOT NULL,
    "toRoleId" TEXT NOT NULL,
    "actionWindowHours" INTEGER NOT NULL DEFAULT 48,

    CONSTRAINT "EscalationRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EscalationRule_tenantId_idx" ON "EscalationRule"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "EscalationRule_tenantId_fromContext_key" ON "EscalationRule"("tenantId", "fromContext");

-- AddForeignKey
ALTER TABLE "EscalationRule" ADD CONSTRAINT "EscalationRule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EscalationRule" ADD CONSTRAINT "EscalationRule_toRoleId_fkey" FOREIGN KEY ("toRoleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
