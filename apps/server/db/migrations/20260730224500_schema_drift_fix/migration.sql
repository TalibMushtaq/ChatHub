-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RoomInvitation_roomId_invitedUserId_status_key" ON "RoomInvitation"("roomId", "invitedUserId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "RoomJoinRequest_roomId_userId_status_key" ON "RoomJoinRequest"("roomId", "userId", "status");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
