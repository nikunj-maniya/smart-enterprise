-- CreateTable
CREATE TABLE "SmartSearchConversation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT,
    "summary" TEXT,
    "summarizedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SmartSearchConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SmartSearchMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SmartSearchMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SmartSearchMemory" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SmartSearchMemory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SmartSearchConversation_tenantId_userId_updatedAt_idx" ON "SmartSearchConversation"("tenantId", "userId", "updatedAt");

-- CreateIndex
CREATE INDEX "SmartSearchMessage_conversationId_createdAt_idx" ON "SmartSearchMessage"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "SmartSearchMemory_tenantId_userId_idx" ON "SmartSearchMemory"("tenantId", "userId");

-- AddForeignKey
ALTER TABLE "SmartSearchConversation" ADD CONSTRAINT "SmartSearchConversation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmartSearchConversation" ADD CONSTRAINT "SmartSearchConversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmartSearchMessage" ADD CONSTRAINT "SmartSearchMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "SmartSearchConversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmartSearchMemory" ADD CONSTRAINT "SmartSearchMemory_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmartSearchMemory" ADD CONSTRAINT "SmartSearchMemory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
