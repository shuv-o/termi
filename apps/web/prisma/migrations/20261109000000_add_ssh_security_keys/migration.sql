-- FIDO2 security keys as SSH keys (webauthn-sk-ecdsa)
ALTER TYPE "AuditAction" ADD VALUE 'SSH_SECURITY_KEY_ADDED';
ALTER TYPE "AuditAction" ADD VALUE 'SSH_SECURITY_KEY_REMOVED';

CREATE TABLE "SshSecurityKey" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "publicKey" TEXT NOT NULL,
    "rpId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),
    CONSTRAINT "SshSecurityKey_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SshSecurityKey_credentialId_key" ON "SshSecurityKey"("credentialId");
CREATE INDEX "SshSecurityKey_userId_idx" ON "SshSecurityKey"("userId");
ALTER TABLE "SshSecurityKey" ADD CONSTRAINT "SshSecurityKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Server" ADD COLUMN "securityKeyId" TEXT;
ALTER TABLE "Server" ADD CONSTRAINT "Server_securityKeyId_fkey" FOREIGN KEY ("securityKeyId") REFERENCES "SshSecurityKey"("id") ON DELETE SET NULL ON UPDATE CASCADE;
