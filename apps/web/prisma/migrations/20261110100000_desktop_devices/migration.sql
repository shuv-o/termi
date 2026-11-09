-- Desktop app: connect to your own servers from this computer.
ALTER TYPE "AuditAction" ADD VALUE 'DEVICE_REGISTERED';
ALTER TABLE "Server" ADD COLUMN "connectFrom" TEXT NOT NULL DEFAULT 'server';

CREATE TABLE "Device" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "keyId" TEXT NOT NULL,
    "encKey" JSONB NOT NULL,
    "sigKey" JSONB NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Device_sessionId_key" ON "Device"("sessionId");
CREATE UNIQUE INDEX "Device_keyId_key" ON "Device"("keyId");
CREATE INDEX "Device_userId_idx" ON "Device"("userId");
ALTER TABLE "Device" ADD CONSTRAINT "Device_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
