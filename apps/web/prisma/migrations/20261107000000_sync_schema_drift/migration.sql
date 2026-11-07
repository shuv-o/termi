-- Schema changes that reached schema.prisma without a migration (Telnet,
-- server sharing/invitations, recordings, benchmark history, tunnel sessions,
-- webhook alerts, and their audit actions). Databases built only from
-- migrations — every Docker install — were missing all of them.
--
-- Every statement is idempotent: databases that already have these objects
-- (synced with `prisma db push`) apply this as a no-op.

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "WebhookPlatform" AS ENUM ('SLACK', 'DISCORD', 'GENERIC');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "TunnelKind" AS ENUM ('HTTP_PROXY', 'BRIDGE_SCRIPT', 'ELECTRON_LOCAL');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'GROUP_BROADCAST_RUN';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'SERVER_INVITE_SENT';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'SERVER_INVITE_ACCEPTED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'SERVER_INVITE_DECLINED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'SERVER_SHARE_REVOKED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'TUNNEL_OPENED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'TUNNEL_CLOSED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'RECORDING_SAVED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'RECORDING_DELETED';

-- AlterEnum
ALTER TYPE "Protocol" ADD VALUE IF NOT EXISTS 'TELNET';

-- AlterTable
ALTER TABLE "ServerMonitorConfig" ADD COLUMN IF NOT EXISTS "webhookEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "webhookPlatform" "WebhookPlatform",
ADD COLUMN IF NOT EXISTS "webhookUrl" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "BenchmarkRun" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "cpuScore" INTEGER NOT NULL,
    "ramScore" INTEGER NOT NULL,
    "diskScore" INTEGER NOT NULL,
    "networkScore" INTEGER NOT NULL,
    "overallScore" INTEGER NOT NULL,
    "cpuSingleMBps" INTEGER,
    "cpuMultiMBps" INTEGER,
    "ramWriteMBps" INTEGER,
    "ramReadMBps" INTEGER,
    "diskWriteMBps" INTEGER,
    "diskReadMBps" INTEGER,
    "pingMs" DOUBLE PRECISION,
    "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BenchmarkRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Recording" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "serverId" TEXT,
    "serverName" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "durationSec" INTEGER NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Recording_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "TunnelSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "serverId" TEXT,
    "serverName" TEXT NOT NULL,
    "remoteHost" TEXT NOT NULL,
    "remotePort" INTEGER NOT NULL,
    "kind" "TunnelKind" NOT NULL,
    "localPort" INTEGER,
    "electronId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "TunnelSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ServerInvitation" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "inviterId" TEXT NOT NULL,
    "inviteeEmail" TEXT NOT NULL,
    "permissions" TEXT NOT NULL DEFAULT 'manage',
    "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServerInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ServerShare" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "sharedWithId" TEXT NOT NULL,
    "permissions" TEXT NOT NULL DEFAULT 'manage',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServerShare_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BenchmarkRun_serverId_runAt_idx" ON "BenchmarkRun"("serverId", "runAt");
CREATE INDEX IF NOT EXISTS "Recording_userId_createdAt_idx" ON "Recording"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "TunnelSession_userId_closedAt_idx" ON "TunnelSession"("userId", "closedAt");
CREATE UNIQUE INDEX IF NOT EXISTS "ServerInvitation_token_key" ON "ServerInvitation"("token");
CREATE INDEX IF NOT EXISTS "ServerInvitation_token_idx" ON "ServerInvitation"("token");
CREATE INDEX IF NOT EXISTS "ServerInvitation_inviterId_idx" ON "ServerInvitation"("inviterId");
CREATE INDEX IF NOT EXISTS "ServerInvitation_inviteeEmail_idx" ON "ServerInvitation"("inviteeEmail");
CREATE INDEX IF NOT EXISTS "ServerInvitation_serverId_idx" ON "ServerInvitation"("serverId");
CREATE INDEX IF NOT EXISTS "ServerShare_ownerId_idx" ON "ServerShare"("ownerId");
CREATE INDEX IF NOT EXISTS "ServerShare_sharedWithId_idx" ON "ServerShare"("sharedWithId");
CREATE UNIQUE INDEX IF NOT EXISTS "ServerShare_serverId_sharedWithId_key" ON "ServerShare"("serverId", "sharedWithId");

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "BenchmarkRun" ADD CONSTRAINT "BenchmarkRun_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "Recording" ADD CONSTRAINT "Recording_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "Recording" ADD CONSTRAINT "Recording_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "TunnelSession" ADD CONSTRAINT "TunnelSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "TunnelSession" ADD CONSTRAINT "TunnelSession_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "ServerInvitation" ADD CONSTRAINT "ServerInvitation_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "ServerInvitation" ADD CONSTRAINT "ServerInvitation_inviterId_fkey" FOREIGN KEY ("inviterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "ServerShare" ADD CONSTRAINT "ServerShare_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "ServerShare" ADD CONSTRAINT "ServerShare_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "ServerShare" ADD CONSTRAINT "ServerShare_sharedWithId_fkey" FOREIGN KEY ("sharedWithId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
