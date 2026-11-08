-- SSH host key pinning (known_hosts per server)
ALTER TABLE "Server" ADD COLUMN "hostKeyFingerprint" TEXT,
ADD COLUMN "hostKeyType" TEXT,
ADD COLUMN "hostKeyTrustedAt" TIMESTAMP(3);

ALTER TYPE "AuditAction" ADD VALUE 'SERVER_HOST_KEY_TRUSTED';
ALTER TYPE "AuditAction" ADD VALUE 'SERVER_HOST_KEY_MISMATCH';
