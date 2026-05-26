-- AlterTable
ALTER TABLE "Server" ADD COLUMN IF NOT EXISTS "rdpSecurity" TEXT DEFAULT 'any';
