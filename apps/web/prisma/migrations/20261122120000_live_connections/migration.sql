-- Active connections: what each gateway reports as open right now.
ALTER TYPE "AuditAction" ADD VALUE 'CONNECTION_CLOSED_BY_USER';

CREATE TABLE "GatewayInstance" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT,
    "lastReportAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "GatewayInstance_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "GatewayInstance_expiresAt_idx" ON "GatewayInstance"("expiresAt");

CREATE TABLE "LiveConnection" (
    "id" TEXT NOT NULL,
    "gatewayId" TEXT NOT NULL,
    "connId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sid" TEXT,
    "kind" TEXT NOT NULL,
    "protocol" TEXT NOT NULL,
    "serverId" TEXT,
    "sessionId" TEXT,
    "attached" BOOLEAN NOT NULL,
    "guests" INTEGER NOT NULL DEFAULT 0,
    "detail" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "lastActivityAt" TIMESTAMP(3) NOT NULL,
    "closeRequestedAt" TIMESTAMP(3),
    CONSTRAINT "LiveConnection_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "LiveConnection_gatewayId_connId_key" ON "LiveConnection"("gatewayId", "connId");
CREATE INDEX "LiveConnection_userId_idx" ON "LiveConnection"("userId");
ALTER TABLE "LiveConnection" ADD CONSTRAINT "LiveConnection_gatewayId_fkey" FOREIGN KEY ("gatewayId") REFERENCES "GatewayInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
