-- AlterEnum
-- Add MODERATOR between ADMIN and MEMBER so the existing OWNER/ADMIN/MEMBER
-- values keep their relative positions (a plain enum reorder would need a
-- type rebuild; adding a value is non-destructive).
ALTER TYPE "ChatRoomRole" ADD VALUE 'MODERATOR';

-- AlterTable
ALTER TABLE "ChatRoomMember" ADD COLUMN     "nickname" TEXT;
ALTER TABLE "ChatRoomMember" ADD COLUMN     "mutedUntil" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "RoomBan" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bannedById" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoomBan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RoomBan_roomId_userId_key" ON "RoomBan"("roomId", "userId");

-- CreateIndex
CREATE INDEX "RoomBan_roomId_idx" ON "RoomBan"("roomId");

-- CreateIndex
CREATE INDEX "RoomBan_userId_idx" ON "RoomBan"("userId");

-- AddForeignKey
ALTER TABLE "RoomBan" ADD CONSTRAINT "RoomBan_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "ChatRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomBan" ADD CONSTRAINT "RoomBan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomBan" ADD CONSTRAINT "RoomBan_bannedById_fkey" FOREIGN KEY ("bannedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;