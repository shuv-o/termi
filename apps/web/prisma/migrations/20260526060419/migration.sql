-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'USER_PASSWORD_RESET_REQUESTED';
ALTER TYPE "AuditAction" ADD VALUE 'USER_PASSWORD_RESET';
ALTER TYPE "AuditAction" ADD VALUE 'USER_ENCRYPTION_SETUP';
ALTER TYPE "AuditAction" ADD VALUE 'USER_ENCRYPTION_KEY_RESET';

-- CreateTable
CREATE TABLE "PersistentSession" (
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
CREATE UNIQUE INDEX "PersistentSession_sessionId_key" ON "PersistentSession"("sessionId");

-- CreateIndex
CREATE INDEX "PersistentSession_userId_idx" ON "PersistentSession"("userId");

-- AddForeignKey
ALTER TABLE "PersistentSession" ADD CONSTRAINT "PersistentSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
