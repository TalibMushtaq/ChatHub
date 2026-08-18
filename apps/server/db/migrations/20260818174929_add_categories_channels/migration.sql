-- CreateEnum
CREATE TYPE "ChannelType" AS ENUM ('TEXT', 'VOICE', 'ANNOUNCEMENT', 'FORUM');

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "channelId" TEXT;

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Channel" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "categoryId" TEXT,
    "name" TEXT NOT NULL,
    "topic" TEXT,
    "type" "ChannelType" NOT NULL DEFAULT 'TEXT',
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Channel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Category_roomId_position_idx" ON "Category"("roomId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "Category_roomId_name_key" ON "Category"("roomId", "name");

-- CreateIndex
CREATE INDEX "Channel_roomId_position_idx" ON "Channel"("roomId", "position");

-- CreateIndex
CREATE INDEX "Channel_categoryId_idx" ON "Channel"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "Channel_roomId_name_key" ON "Channel"("roomId", "name");

-- CreateIndex
CREATE INDEX "Message_channelId_createdAt_idx" ON "Message"("channelId", "createdAt");

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "ChatRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Channel" ADD CONSTRAINT "Channel_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "ChatRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Channel" ADD CONSTRAINT "Channel_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Backfill: every existing Room gets GENERAL → #general, and all of its
-- messages are moved into that channel. All statements are guarded so the
-- migration is idempotent and can be re-run on a partially-migrated database
-- (a resumable/verifiable path for large datasets; see scripts/verify-channel-backfill.ts).
-- ---------------------------------------------------------------------------

-- 1. One GENERAL category per room that does not already have one.
INSERT INTO "Category" ("id", "roomId", "name", "position", "createdAt", "updatedAt")
SELECT 'gencat-' || c."id", c."id", 'GENERAL', 0, NOW(), NOW()
FROM "ChatRoom" c
WHERE NOT EXISTS (
  SELECT 1 FROM "Category" cat WHERE cat."roomId" = c."id"
);

-- 2. One #general text channel per room (linked to its GENERAL category) that
--    does not already have one.
INSERT INTO "Channel" ("id", "roomId", "categoryId", "name", "topic", "type", "position", "createdAt", "updatedAt")
SELECT 'genchan-' || cat."roomId", cat."roomId", cat."id", 'general', NULL, 'TEXT', 0, NOW(), NOW()
FROM "Category" cat
WHERE cat."name" = 'GENERAL'
AND NOT EXISTS (
  SELECT 1 FROM "Channel" ch WHERE ch."roomId" = cat."roomId" AND ch."name" = 'general'
);

-- 3. Point every room message that has no channel yet at its room's #general
--    channel. DM messages (chatRoomId IS NULL) are left untouched.
UPDATE "Message" m
SET "channelId" = ch."id"
FROM "Channel" ch
WHERE ch."roomId" = m."chatRoomId"
  AND ch."name" = 'general'
  AND m."channelId" IS NULL
  AND m."chatRoomId" IS NOT NULL;
