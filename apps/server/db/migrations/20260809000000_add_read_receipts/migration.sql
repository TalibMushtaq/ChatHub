-- CreateTable
CREATE TABLE "DirectChatReadReceipt" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "directChatId" TEXT NOT NULL,
    "lastReadMessageId" TEXT,
    "lastReadMessageCreatedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DirectChatReadReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatRoomReadReceipt" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "chatRoomId" TEXT NOT NULL,
    "lastReadMessageId" TEXT,
    "lastReadMessageCreatedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatRoomReadReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DirectChatReadReceipt_userId_directChatId_key" ON "DirectChatReadReceipt"("userId", "directChatId");

-- CreateIndex
CREATE INDEX "DirectChatReadReceipt_userId_idx" ON "DirectChatReadReceipt"("userId");

-- CreateIndex
CREATE INDEX "DirectChatReadReceipt_directChatId_idx" ON "DirectChatReadReceipt"("directChatId");

-- CreateIndex
CREATE UNIQUE INDEX "ChatRoomReadReceipt_userId_chatRoomId_key" ON "ChatRoomReadReceipt"("userId", "chatRoomId");

-- CreateIndex
CREATE INDEX "ChatRoomReadReceipt_userId_idx" ON "ChatRoomReadReceipt"("userId");

-- CreateIndex
CREATE INDEX "ChatRoomReadReceipt_chatRoomId_idx" ON "ChatRoomReadReceipt"("chatRoomId");

-- AddForeignKey
ALTER TABLE "DirectChatReadReceipt" ADD CONSTRAINT "DirectChatReadReceipt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectChatReadReceipt" ADD CONSTRAINT "DirectChatReadReceipt_directChatId_fkey" FOREIGN KEY ("directChatId") REFERENCES "DirectChat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectChatReadReceipt" ADD CONSTRAINT "DirectChatReadReceipt_lastReadMessageId_fkey" FOREIGN KEY ("lastReadMessageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatRoomReadReceipt" ADD CONSTRAINT "ChatRoomReadReceipt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatRoomReadReceipt" ADD CONSTRAINT "ChatRoomReadReceipt_chatRoomId_fkey" FOREIGN KEY ("chatRoomId") REFERENCES "ChatRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatRoomReadReceipt" ADD CONSTRAINT "ChatRoomReadReceipt_lastReadMessageId_fkey" FOREIGN KEY ("lastReadMessageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;
