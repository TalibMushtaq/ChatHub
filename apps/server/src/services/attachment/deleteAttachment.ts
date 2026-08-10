import { prisma } from "../../../db/prisma";
import { S3Service } from "../S3Service";
import { ApiError } from "../../lib/ApiError";
import { createLogger } from "../../lib/logger";

const log = createLogger("deleteAttachment");

/**
 * Delete an attachment.
 *
 * Authorization:
 * - PENDING attachments: only the uploader may delete
 * - ATTACHED attachments: only the message sender or a room admin may delete
 *
 * Recovery strategy:
 * 1. Delete the S3 object first.
 * 2. If S3 deletion succeeds, delete the DB row.
 * 3. If DB deletion fails, the S3 object is already gone. Log the error and
 *    report the partial failure via `orphanedRecord` so callers can surface
 *    it (the DB row can be cleaned up asynchronously later).
 * 4. If S3 deletion fails, do not delete the DB row. Return an error
 *    so the caller can retry or schedule async cleanup.
 */
export async function deleteAttachment(
  s3Service: S3Service,
  attachmentId: string,
  userId: string,
) {
  const attachment = await prisma.attachment.findUnique({
    where: { id: attachmentId },
    include: {
      Message: {
        select: {
          senderId: true,
          chatRoomId: true,
        },
      },
    },
  });

  if (!attachment) {
    throw new ApiError("Attachment not found", 404, "ATTACHMENT_NOT_FOUND");
  }

  // Authorization check
  if (attachment.status === "PENDING") {
    if (attachment.uploaderId !== userId) {
      throw new ApiError(
        "You do not have permission to delete this attachment",
        403,
        "ATTACHMENT_DELETE_DENIED",
      );
    }
  } else if (attachment.Message) {
    const isSender = attachment.Message.senderId === userId;
    let isAdmin = false;
    if (attachment.Message.chatRoomId) {
      const membership = await prisma.chatRoomMember.findUnique({
        where: {
          userId_chatRoomId: {
            userId,
            chatRoomId: attachment.Message.chatRoomId,
          },
        },
      });
      isAdmin = membership?.role === "OWNER" || membership?.role === "ADMIN";
    }
    if (!isSender && !isAdmin) {
      throw new ApiError(
        "You do not have permission to delete this attachment",
        403,
        "ATTACHMENT_DELETE_DENIED",
      );
    }
  } else if (attachment.uploaderId !== userId) {
    // Default-deny: an attachment with no linked message is only reachable
    // by the uploader.
    throw new ApiError(
      "You do not have permission to delete this attachment",
      403,
      "ATTACHMENT_DELETE_DENIED",
    );
  }

  // Step 1: Delete S3 object
  try {
    await s3Service.deleteObject(attachment.s3Key);
  } catch (err: unknown) {
    log.error("S3 delete failed", err, {
      attachmentId,
      s3Key: attachment.s3Key,
    });
    throw new ApiError(
      "Failed to delete attachment from storage. Please retry.",
      500,
      "S3_DELETE_FAILED",
    );
  }

  // Step 2: Delete DB row
  try {
    await prisma.attachment.delete({ where: { id: attachmentId } });
  } catch (err: unknown) {
    log.error("DB delete failed after S3 deletion", err, { attachmentId });
    // S3 object is already gone, so the delete cannot be retried as a whole.
    // The orphaned DB row is reported to the caller instead of being hidden.
    return { ok: true, orphanedRecord: true };
  }

  return { ok: true, orphanedRecord: false };
}
