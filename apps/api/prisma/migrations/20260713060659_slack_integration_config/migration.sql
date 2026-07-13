-- CreateTable
CREATE TABLE "SlackConfig" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'disconnected',
    "workspaceName" TEXT,
    "slackTeamId" TEXT,
    "defaultChannel" TEXT,
    "botTokenEncrypted" TEXT,
    "signingSecretEncrypted" TEXT,
    "lastErrorMessage" TEXT,
    "notifyApproversOnNewRequest" BOOLEAN NOT NULL DEFAULT true,
    "notifyRequesterOnDecision" BOOLEAN NOT NULL DEFAULT true,
    "notifyRequesterOnStatusChange" BOOLEAN NOT NULL DEFAULT true,
    "digestEnabled" BOOLEAN NOT NULL DEFAULT false,
    "digestChannel" TEXT,
    "digestTime" TEXT,
    "lastDigestSentDate" TEXT,
    "reminderEnabled" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SlackConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SlackConfig_tenantId_key" ON "SlackConfig"("tenantId");

-- CreateIndex
CREATE INDEX "SlackConfig_slackTeamId_idx" ON "SlackConfig"("slackTeamId");

-- AddForeignKey
ALTER TABLE "SlackConfig" ADD CONSTRAINT "SlackConfig_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
