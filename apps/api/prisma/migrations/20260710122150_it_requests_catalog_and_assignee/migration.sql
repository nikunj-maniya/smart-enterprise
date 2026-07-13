-- AlterTable
ALTER TABLE "Request" ADD COLUMN     "itAssigneeId" TEXT;

-- CreateTable
CREATE TABLE "ItemCatalog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "archived" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ItemCatalog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ItemCatalog_tenantId_type_idx" ON "ItemCatalog"("tenantId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "ItemCatalog_tenantId_type_name_key" ON "ItemCatalog"("tenantId", "type", "name");

-- AddForeignKey
ALTER TABLE "ItemCatalog" ADD CONSTRAINT "ItemCatalog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
