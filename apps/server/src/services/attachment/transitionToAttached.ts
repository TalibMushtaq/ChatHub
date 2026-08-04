import { Prisma } from "@prisma/client";

/**
 * Transition PENDING attachments to ATTACHED and link them to a message.
 *
 * Must be called inside a Prisma transaction after the Message has been created.
 */
export async function transitionAttachmentsToAttached(
  tx: Prisma.TransactionClient,
  attachmentIds: string[],
  messageId: string,
) {
  await tx.attachment.updateMany({
    where: { id: { in: attachmentIds } },
    data: {
      status: "ATTACHED",
      messageId,
    },
  });
}
