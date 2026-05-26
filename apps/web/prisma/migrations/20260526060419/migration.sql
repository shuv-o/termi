-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'USER_PASSWORD_RESET_REQUESTED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'USER_PASSWORD_RESET';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'USER_ENCRYPTION_SETUP';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'USER_ENCRYPTION_KEY_RESET';

-- CreateTable
CREATE TABLE IF NOT EXISTS "PersistentSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "serverName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PersistentSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "PersistentSession_sessionId_key" ON "PersistentSession"("sessionId");
CREATE INDEX IF NOT EXISTS "PersistentSession_userId_idx" ON "PersistentSession"("userId");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "PersistentSession" ADD CONSTRAINT "PersistentSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
