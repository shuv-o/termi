-- AlterTable
ALTER TABLE "Server" ADD COLUMN "jumpServerId" TEXT;

-- CreateIndex
CREATE INDEX "Server_jumpServerId_idx" ON "Server"("jumpServerId");

-- AddForeignKey
ALTER TABLE "Server" ADD CONSTRAINT "Server_jumpServerId_fkey" FOREIGN KEY ("jumpServerId") REFERENCES "Server"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
