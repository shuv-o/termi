-- "Passkey only" accounts: refuse password sign-in.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "passwordLoginDisabled" BOOLEAN NOT NULL DEFAULT false;

ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'USER_PASSWORD_LOGIN_TOGGLED';
