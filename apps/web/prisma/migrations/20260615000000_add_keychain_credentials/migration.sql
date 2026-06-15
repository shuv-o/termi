-- CreateTable
CREATE TABLE "KeychainCredential" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password" TEXT,
    "privateKey" TEXT,
    "passphrase" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KeychainCredential_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KeychainCredential_userId_idx" ON "KeychainCredential"("userId");

-- AddForeignKey
ALTER TABLE "KeychainCredential" ADD CONSTRAINT "KeychainCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
