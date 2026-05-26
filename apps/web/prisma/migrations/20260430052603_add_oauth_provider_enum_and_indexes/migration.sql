-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "OAuthProvider" AS ENUM ('GOOGLE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Add updatedAt to OAuthAccount if missing, backfill nulls, ensure NOT NULL
ALTER TABLE "OAuthAccount" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3);
UPDATE "OAuthAccount" SET "updatedAt" = CURRENT_TIMESTAMP WHERE "updatedAt" IS NULL;
ALTER TABLE "OAuthAccount" ALTER COLUMN "updatedAt" SET NOT NULL;

-- Replace TEXT provider column with OAuthProvider enum — only if still text type
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'OAuthAccount'
      AND column_name = 'provider'
      AND udt_name = 'text'
  ) THEN
    ALTER TABLE "OAuthAccount" DROP COLUMN "provider";
    ALTER TABLE "OAuthAccount" ADD COLUMN "provider" "OAuthProvider" NOT NULL;
  END IF;
END $$;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "OAuthAccount_provider_providerAccountId_key" ON "OAuthAccount"("provider", "providerAccountId");
CREATE INDEX IF NOT EXISTS "User_passwordResetToken_idx" ON "User"("passwordResetToken");
