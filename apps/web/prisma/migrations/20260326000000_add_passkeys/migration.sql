-- AlterTable
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "passkeyEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE IF NOT EXISTS "Passkey" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Passkey',
    "credentialID" TEXT NOT NULL,
    "credentialPublicKey" BYTEA NOT NULL,
    "counter" BIGINT NOT NULL DEFAULT 0,
    "deviceType" TEXT NOT NULL,
    "backedUp" BOOLEAN NOT NULL DEFAULT false,
    "transports" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),
    CONSTRAINT "Passkey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Passkey_credentialID_key" ON "Passkey"("credentialID");
CREATE INDEX IF NOT EXISTS "Passkey_userId_idx" ON "Passkey"("userId");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "Passkey" ADD CONSTRAINT "Passkey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'PASSKEY_REGISTERED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'PASSKEY_REMOVED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'PASSKEY_USED';
