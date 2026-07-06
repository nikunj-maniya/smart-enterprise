-- CreateTable
CREATE TABLE "RegistrationLink" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RegistrationLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RegistrationLink_tenantId_key" ON "RegistrationLink"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "RegistrationLink_tokenHash_key" ON "RegistrationLink"("tokenHash");

-- AddForeignKey
ALTER TABLE "RegistrationLink" ADD CONSTRAINT "RegistrationLink_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
