-- CreateTable
CREATE TABLE "PlatformSettings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "forcePasswordChangeOnFirstLogin" BOOLEAN NOT NULL DEFAULT true,
    "allowPublicRegistration" BOOLEAN NOT NULL DEFAULT true,
    "notifyOnNewRegistration" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "PlatformSettings_pkey" PRIMARY KEY ("id")
);
