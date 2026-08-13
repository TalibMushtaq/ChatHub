import { prisma } from "../../../db/prisma";
import { messageWithAttachmentsSelect } from "../../constants/direct-chat";
import type { MessageType } from "@prisma/client";
import { S3Service } from "../S3Service";
import { verifyAttachmentsForMessage } from "../attachment/verifyForMessage";
import { transitionAttachmentsToAttached } from "../attachment/transitionToAttached";
import { checkIdempotency, storeIdempotency } from "../idempotency";

/**
 * Send a message in a direct chat with full attachment support.
 *
 * Transaction flow:
 * 1. Check idempotency key (if provided)
 * 2. Verify attachments (if provided)
 * 3. Create Message
 * 4. Transition attachments to ATTACHED
 * 5. Update DirectChat.lastMessageAt
 * 6. Store idempotency key
 *
 * All steps are inside a Prisma transaction. If any step fails,
 * the entire transaction rolls back and no socket events are emitted.
 */
export async function sendMessage(
  directChatId: string,
  senderId: string,
  data: {
    content?: string;
    messageType: MessageType;
    attachmentIds?: string[];
    idempotencyKey?: string;
  },
  s3Service: S3Service,
) {
  const { content, messageType, attachmentIds, idempotencyKey } = data;

  // Step 1: Idempotency check (outside transaction, Redis is not transactional)
  if (idempotencyKey) {
    const existingMessageId = await checkIdempotency(senderId, idempotencyKey);
    if (existingMessageId) {
      const existing = await prisma.message.findUnique({
        where: { id: existingMessageId },
        select: messageWithAttachmentsSelect,
      });
      if (existing) {
        return existing;
      }
    }
  }

  // Steps 2-5: Prisma transaction
  const result = await prisma.$transaction(async (tx) => {
    // Verify attachments if present
    if (attachmentIds && attachmentIds.length > 0) {
      await verifyAttachmentsForMessage(tx, s3Service, attachmentIds, senderId);
    }

    const message = await tx.message.create({
      data: {
        content: content ?? null,
        senderId,
        directChatId,
        messageType,
      },
      select: messageWithAttachmentsSelect,
    });

    // Link attachments
    if (attachmentIds && attachmentIds.length > 0) {
      await transitionAttachmentsToAttached(tx, attachmentIds, message.id);
    }

    await tx.directChat.update({
      where: { id: directChatId },
      data: { lastMessageAt: new Date() },
    });

    return message;
  });

  // Step 6: Store idempotency key (after transaction succeeds)
  if (idempotencyKey) {
    await storeIdempotency(senderId, idempotencyKey, result.id);
  }

  return result;
}
