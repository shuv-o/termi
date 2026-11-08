-- App lock after inactivity
ALTER TABLE "Session" ADD COLUMN "lockedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "lockAfterMinutes" INTEGER;
