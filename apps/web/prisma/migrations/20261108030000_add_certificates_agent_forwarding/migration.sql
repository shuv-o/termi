-- SSH user certificates and agent forwarding
ALTER TABLE "Server" ADD COLUMN "certificate" TEXT,
ADD COLUMN "agentForwarding" TEXT NOT NULL DEFAULT 'off',
ADD COLUMN "agentKeychainIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "KeychainCredential" ADD COLUMN "certificate" TEXT;
