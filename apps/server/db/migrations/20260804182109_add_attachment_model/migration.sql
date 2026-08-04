-- CreateEnum
CREATE TYPE "AttachmentStatus" AS ENUM ('PENDING', 'ATTACHED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "MessageType" ADD VALUE 'IMAGE';
ALTER TYPE "MessageType" ADD VALUE 'VIDEO';
ALTER TYPE "MessageType" ADD VALUE 'AUDIO';
ALTER TYPE "MessageType" ADD VALUE 'VOICE';
ALTER TYPE "MessageType" ADD VALUE 'SYSTEM';

-- DropForeignKey
ALTER TABLE "ChatRoomMember" DROP CONSTRAINT "ChatRoomMember_chatRoomId_fkey";

-- DropForeignKey
ALTER TABLE "ChatRoomMember" DROP CONSTRAINT "ChatRoomMember_userId_fkey";

-- DropForeignKey
ALTER TABLE "DirectChat" DROP CONSTRAINT "DirectChat_user1Id_fkey";

-- DropForeignKey
ALTER TABLE "DirectChat" DROP CONSTRAINT "DirectChat_user2Id_fkey";

-- DropForeignKey
ALTER TABLE "Message" DROP CONSTRAINT "Message_chatRoomId_fkey";

-- DropForeignKey
ALTER TABLE "Message" DROP CONSTRAINT "Message_directChatId_fkey";

-- DropForeignKey
ALTER TABLE "Message" DROP CONSTRAINT "Message_senderId_fkey";

-- AlterTable
ALTER TABLE "ChatRoom" ADD COLUMN     "lastMessageAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL,
    "messageId" TEXT,
    "uploaderId" TEXT NOT NULL,
    "s3Key" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "duration" INTEGER,
    "thumbnailKey" TEXT,
    "status" "AttachmentStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Attachment_s3Key_key" ON "Attachment"("s3Key");

-- CreateIndex
CREATE INDEX "Attachment_messageId_idx" ON "Attachment"("messageId");

-- CreateIndex
CREATE INDEX "Attachment_uploaderId_status_idx" ON "Attachment"("uploaderId", "status");

-- CreateIndex
CREATE INDEX "ChatRoom_createdBy_idx" ON "ChatRoom"("createdBy");

-- CreateIndex
CREATE INDEX "DirectChat_user1Id_idx" ON "DirectChat"("user1Id");

-- CreateIndex
CREATE INDEX "DirectChat_user2Id_idx" ON "DirectChat"("user2Id");

-- CreateIndex
CREATE INDEX "RoomInvitation_roomId_idx" ON "RoomInvitation"("roomId");

-- CreateIndex
CREATE INDEX "RoomInvitation_invitedUserId_idx" ON "RoomInvitation"("invitedUserId");

-- CreateIndex
CREATE INDEX "RoomJoinLink_roomId_idx" ON "RoomJoinLink"("roomId");

-- CreateIndex
CREATE INDEX "RoomJoinLink_createdById_idx" ON "RoomJoinLink"("createdById");

-- CreateIndex
CREATE INDEX "RoomJoinRequest_roomId_idx" ON "RoomJoinRequest"("roomId");

-- CreateIndex
CREATE INDEX "RoomJoinRequest_userId_idx" ON "RoomJoinRequest"("userId");

-- AddForeignKey
ALTER TABLE "ChatRoomMember" ADD CONSTRAINT "ChatRoomMember_chatRoomId_fkey" FOREIGN KEY ("chatRoomId") REFERENCES "ChatRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatRoomMember" ADD CONSTRAINT "ChatRoomMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_chatRoomId_fkey" FOREIGN KEY ("chatRoomId") REFERENCES "ChatRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_directChatId_fkey" FOREIGN KEY ("directChatId") REFERENCES "DirectChat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectChat" ADD CONSTRAINT "DirectChat_user1Id_fkey" FOREIGN KEY ("user1Id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectChat" ADD CONSTRAINT "DirectChat_user2Id_fkey" FOREIGN KEY ("user2Id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: migrate existing file messages into Attachment records
-- Extracts the S3 key from fileUrl (handles both full URLs and raw keys)
INSERT INTO "Attachment" ("id", "messageId", "uploaderId", "s3Key", "filename", "mimeType", "size", "status", "createdAt")
SELECT
  gen_random_uuid()::text,
  m."id",
  m."senderId",
  COALESCE(
    -- If fileUrl contains a protocol, extract path after domain
    CASE
      WHEN m."fileUri" ~ '^https?://' THEN
        regexp_replace(m."fileUri", '^https?://[^/]+/', '')
      ELSE m."fileUri"
    END,
    'legacy/' || m."id"
  ),
  COALESCE(m."fileName", 'unknown'),
  'application/octet-stream',
  COALESCE(m."fileSize", 0),
  'ATTACHED',
  m."createdAt"
FROM "Message" m
WHERE m."fileUri" IS NOT NULL;
