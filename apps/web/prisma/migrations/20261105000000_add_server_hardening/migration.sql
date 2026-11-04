-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'SERVER_HARDENED';
ALTER TYPE "AuditAction" ADD VALUE 'SERVER_HARDENING_FAILED';

-- CreateTable
CREATE TABLE "ServerHardeningRun" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "options" JSONB NOT NULL,
    "steps" JSONB NOT NULL DEFAULT '[]',
    "pendingSecret" TEXT,
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "ServerHardeningRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ServerHardeningRun_serverId_createdAt_idx" ON "ServerHardeningRun"("serverId", "createdAt");

-- AddForeignKey
ALTER TABLE "ServerHardeningRun" ADD CONSTRAINT "ServerHardeningRun_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;
