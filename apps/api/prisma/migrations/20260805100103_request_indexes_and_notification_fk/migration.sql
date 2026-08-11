-- DropIndex
DROP INDEX "AuditLog_tenantId_idx";

-- DropIndex
DROP INDEX "Request_requesterId_idx";

-- DropIndex
DROP INDEX "Request_tenantId_idx";

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_at_idx" ON "AuditLog"("tenantId", "at");

-- CreateIndex
CREATE INDEX "AuditLog_at_idx" ON "AuditLog"("at");

-- CreateIndex
CREATE INDEX "Request_tenantId_status_createdAt_idx" ON "Request"("tenantId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Request_requesterId_status_createdAt_idx" ON "Request"("requesterId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Request_tenantId_createdAt_idx" ON "Request"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "RequestApprover_requestId_idx" ON "RequestApprover"("requestId");

-- CreateIndex
CREATE INDEX "RequestStatusHistory_requestId_idx" ON "RequestStatusHistory"("requestId");

-- Data cleanup: Notification.userId was never a real foreign key, so deleting a user (see
-- deleteOrgUser) left their notifications as silent orphans instead of being blocked or
-- cascaded. Remove the ones that already exist before the constraint below would reject them.
DELETE FROM "Notification" WHERE "userId" NOT IN (SELECT "id" FROM "User");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
