-- CreateIndex
-- My Requests query path: requests filtered by requester.
CREATE INDEX "Request_requesterId_idx" ON "Request"("requesterId");

-- CreateIndex
-- Approvals-queue query path: an approver's rows, optionally filtered by decision (pending/decided).
CREATE INDEX "RequestApprover_approverId_decision_idx" ON "RequestApprover"("approverId", "decision");

-- Rollback (reversible):
--   DROP INDEX "RequestApprover_approverId_decision_idx";
--   DROP INDEX "Request_requesterId_idx";
