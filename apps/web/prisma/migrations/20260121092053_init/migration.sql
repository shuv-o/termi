-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "Protocol" AS ENUM ('SSH', 'SCP', 'RDP', 'VNC');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "ConnectionStatus" AS ENUM ('CONNECTING', 'CONNECTED', 'DISCONNECTED', 'FAILED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "AuditAction" AS ENUM ('USER_REGISTER', 'USER_LOGIN', 'USER_LOGOUT', 'USER_LOGIN_FAILED', 'USER_2FA_ENABLED', 'USER_2FA_DISABLED', 'USER_PASSWORD_CHANGED', 'USER_MASTER_KEY_SET', 'USER_MASTER_KEY_REMOVED', 'SESSION_CREATED', 'SESSION_REVOKED', 'SESSION_EXPIRED', 'SERVER_CREATED', 'SERVER_UPDATED', 'SERVER_DELETED', 'CONNECTION_STARTED', 'CONNECTION_ENDED', 'CONNECTION_FAILED', 'GROUP_CREATED', 'GROUP_UPDATED', 'GROUP_DELETED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "totpSecret" TEXT,
    "totpEnabled" BOOLEAN NOT NULL DEFAULT false,
    "masterKeyHash" TEXT,
    "masterKeySalt" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastLoginAt" TIMESTAMP(3),
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "deviceInfo" TEXT NOT NULL,
    "ipAddress" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastActiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isRevoked" BOOLEAN NOT NULL DEFAULT false,
    "revokedAt" TIMESTAMP(3),
    "revokedReason" TEXT,
    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ServerGroup" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT,
    "icon" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ServerGroup_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Server" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "groupId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "tags" TEXT[],
    "color" TEXT,
    "icon" TEXT,
    "host" TEXT NOT NULL,
    "port" INTEGER NOT NULL,
    "protocol" "Protocol" NOT NULL,
    "username" TEXT NOT NULL,
    "password" TEXT,
    "privateKey" TEXT,
    "passphrase" TEXT,
    "notes" TEXT,
    "sshOptions" JSONB,
    "displayWidth" INTEGER DEFAULT 1920,
    "displayHeight" INTEGER DEFAULT 1080,
    "colorDepth" INTEGER DEFAULT 24,
    "isFavorite" BOOLEAN NOT NULL DEFAULT false,
    "lastUsedAt" TIMESTAMP(3),
    "useCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Server_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Connection" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "protocol" "Protocol" NOT NULL,
    "status" "ConnectionStatus" NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "bytesIn" BIGINT NOT NULL DEFAULT 0,
    "bytesOut" BIGINT NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    CONSTRAINT "Connection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" "AuditAction" NOT NULL,
    "resource" TEXT,
    "details" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email");
CREATE INDEX IF NOT EXISTS "User_email_idx" ON "User"("email");
CREATE UNIQUE INDEX IF NOT EXISTS "Session_tokenHash_key" ON "Session"("tokenHash");
CREATE INDEX IF NOT EXISTS "Session_userId_idx" ON "Session"("userId");
CREATE INDEX IF NOT EXISTS "Session_tokenHash_idx" ON "Session"("tokenHash");
CREATE INDEX IF NOT EXISTS "Session_expiresAt_idx" ON "Session"("expiresAt");
CREATE INDEX IF NOT EXISTS "ServerGroup_userId_idx" ON "ServerGroup"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "ServerGroup_userId_name_key" ON "ServerGroup"("userId", "name");
CREATE INDEX IF NOT EXISTS "Server_userId_idx" ON "Server"("userId");
CREATE INDEX IF NOT EXISTS "Server_groupId_idx" ON "Server"("groupId");
CREATE INDEX IF NOT EXISTS "Server_protocol_idx" ON "Server"("protocol");
CREATE INDEX IF NOT EXISTS "Server_isFavorite_idx" ON "Server"("isFavorite");
CREATE INDEX IF NOT EXISTS "Connection_serverId_idx" ON "Connection"("serverId");
CREATE INDEX IF NOT EXISTS "Connection_sessionId_idx" ON "Connection"("sessionId");
CREATE INDEX IF NOT EXISTS "Connection_startedAt_idx" ON "Connection"("startedAt");
CREATE INDEX IF NOT EXISTS "AuditLog_userId_idx" ON "AuditLog"("userId");
CREATE INDEX IF NOT EXISTS "AuditLog_action_idx" ON "AuditLog"("action");
CREATE INDEX IF NOT EXISTS "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ServerGroup" ADD CONSTRAINT "ServerGroup_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "Server" ADD CONSTRAINT "Server_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "Server" ADD CONSTRAINT "Server_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "ServerGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "Connection" ADD CONSTRAINT "Connection_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
