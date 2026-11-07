-- Audit action for revealing a keychain secret (step-up protected).
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'KEYCHAIN_REVEALED';
