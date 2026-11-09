-- Per-user look and layout, and the first-run setup marker.
ALTER TABLE "User" ADD COLUMN "appearance" JSONB;
ALTER TABLE "User" ADD COLUMN "onboardedAt" TIMESTAMP(3);

-- People who already use Termi aren't sent through first-run setup.
UPDATE "User" SET "onboardedAt" = CURRENT_TIMESTAMP;
