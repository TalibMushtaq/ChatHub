import { prisma } from "../../../db/prisma";
import { messageCreateSelect } from "../../constants/direct-chat";

/**
 * Send a text message in a direct chat.
 *
 * Creates the message and bumps lastMessageAt atomically in a transaction
 * so the inbox ordering stays consistent.
 *
 * Returns the created message with the exact original field selection.
 */
export async function sendMessage(
  directChatId: string,
  senderId: string,
  content: string,
) {
  // Transaction guarantees that lastMessageAt is updated atomically with
  // the message creation, so the inbox ordering never shows stale data.
  const result = await prisma.$transaction(async (tx) => {
    const message = await tx.message.create({
      data: {
        content,
        senderId,
        directChatId,
        messageType: "TEXT",
      },
      select: messageCreateSelect,
    });

    await tx.directChat.update({
      where: { id: directChatId },
      data: { lastMessageAt: new Date() },
    });

    return message;
  });

  return result;
}
