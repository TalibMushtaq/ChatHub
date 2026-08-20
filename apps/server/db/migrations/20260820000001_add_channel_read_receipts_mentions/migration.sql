-- CreateTable
CREATE TABLE "ChannelReadReceipt" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "lastReadMessageId" TEXT,
    "lastReadMessageCreatedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChannelReadReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageMention" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "channelId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageMention_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChannelReadReceipt_userId_channelId_key" ON "ChannelReadReceipt"("userId", "channelId");

-- CreateIndex
CREATE INDEX "ChannelReadReceipt_userId_idx" ON "ChannelReadReceipt"("userId");

-- CreateIndex
CREATE INDEX "ChannelReadReceipt_channelId_idx" ON "ChannelReadReceipt"("channelId");

-- CreateIndex
CREATE UNIQUE INDEX "MessageMention_messageId_userId_key" ON "MessageMention"("messageId", "userId");

-- CreateIndex
CREATE INDEX "MessageMention_userId_channelId_idx" ON "MessageMention"("userId", "channelId");

-- CreateIndex
CREATE INDEX "MessageMention_channelId_idx" ON "MessageMention"("channelId");

-- CreateIndex
CREATE INDEX "MessageMention_roomId_idx" ON "MessageMention"("roomId");

-- AddForeignKey
ALTER TABLE "ChannelReadReceipt" ADD CONSTRAINT "ChannelReadReceipt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelReadReceipt" ADD CONSTRAINT "ChannelReadReceipt_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelReadReceipt" ADD CONSTRAINT "ChannelReadReceipt_lastReadMessageId_fkey" FOREIGN KEY ("lastReadMessageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageMention" ADD CONSTRAINT "MessageMention_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageMention" ADD CONSTRAINT "MessageMention_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageMention" ADD CONSTRAINT "MessageMention_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Backfill: seed a per-channel read cursor for every user who already has a
-- room-level cursor, using their existing room cursor as the starting point.
-- Idempotent: skips users/channels that already have a channel receipt, so a
-- partially-applied migration can be re-run safely.
-- ---------------------------------------------------------------------------
INSERT INTO "ChannelReadReceipt" ("id", "userId", "channelId", "lastReadMessageId", "lastReadMessageCreatedAt", "updatedAt")
SELECT
  'chlrr-' || r."userId" || '-' || ch."id",
  r."userId",
  ch."id",
  r."lastReadMessageId",
  r."lastReadMessageCreatedAt",
  NOW()
FROM "ChatRoomReadReceipt" r
JOIN "Channel" ch ON ch."roomId" = r."chatRoomId"
WHERE r."lastReadMessageId" IS NOT NULL
AND NOT EXISTS (
  SELECT 1 FROM "ChannelReadReceipt" cr
  WHERE cr."userId" = r."userId" AND cr."channelId" = ch."id"
);