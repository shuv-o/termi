/*
  Warnings:

  - Added the required column `updatedAt` to the `OAuthAccount` table without a default value. This is not possible if the table is not empty.
  - Changed the type of `provider` on the `OAuthAccount` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "OAuthProvider" AS ENUM ('GOOGLE');

-- AlterTable
ALTER TABLE "OAuthAccount" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
DROP COLUMN "provider",
ADD COLUMN     "provider" "OAuthProvider" NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "OAuthAccount_provider_providerAccountId_key" ON "OAuthAccount"("provider", "providerAccountId");

-- CreateIndex
CREATE INDEX "User_passwordResetToken_idx" ON "User"("passwordResetToken");
