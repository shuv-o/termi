-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'SERVERS_EXPORTED';
ALTER TYPE "AuditAction" ADD VALUE 'SERVERS_IMPORTED';
ALTER TYPE "AuditAction" ADD VALUE 'SNIPPET_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'SNIPPET_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'SNIPPET_DELETED';

-- CreateTable
CREATE TABLE "CommandSnippet" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "command" TEXT NOT NULL,
    "icon" TEXT,
    "runImmediately" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommandSnippet_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CommandSnippet_userId_idx" ON "CommandSnippet"("userId");

-- AddForeignKey
ALTER TABLE "CommandSnippet" ADD CONSTRAINT "CommandSnippet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
