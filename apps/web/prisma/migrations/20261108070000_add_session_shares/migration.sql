-- Shared live terminal sessions
ALTER TYPE "AuditAction" ADD VALUE 'SESSION_SHARED';
ALTER TYPE "AuditAction" ADD VALUE 'SESSION_JOINED';

CREATE TABLE "SessionShare" (
    "id" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SessionShare_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SessionShare_codeHash_key" ON "SessionShare"("codeHash");
CREATE INDEX "SessionShare_ownerId_idx" ON "SessionShare"("ownerId");
