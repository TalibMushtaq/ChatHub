import { prisma } from "../../../db/prisma";
import { S3Service } from "../S3Service";
import { PRESIGN_GET_EXPIRY_SECONDS } from "../../constants/attachment";
import { ApiError } from "../../lib/ApiError";

/**
 * Get an attachment with authorization check and generate a presigned GET URL.
 *
 * Authorization rules:
 * - Room messages: user must be a member of the room
 * - DM messages: user must be a participant in the direct chat
 * - PENDING attachments: only the uploader may access
 */
export async function getAttachmentWithAccessCheck(
  s3Service: S3Service,
  attachmentId: string,
  userId: string,
) {
  const attachment = await prisma.attachment.findUnique({
    where: { id: attachmentId },
    include: {
      Message: {
        select: {
          chatRoomId: true,
          directChatId: true,
        },
      },
    },
  });

  if (!attachment) {
    throw new ApiError("Attachment not found", 404, "ATTACHMENT_NOT_FOUND");
  }

  // PENDING attachments are only accessible by the uploader
  if (attachment.status === "PENDING") {
    if (attachment.uploaderId !== userId) {
      throw new ApiError(
        "You do not have access to this attachment",
        403,
        "ATTACHMENT_ACCESS_DENIED",
      );
    }
  } else {
    // ATTACHED attachments require room/DM membership
    const message = attachment.Message;
    if (message?.chatRoomId) {
      const membership = await prisma.chatRoomMember.findUnique({
        where: {
          userId_chatRoomId: {
            userId,
            chatRoomId: message.chatRoomId,
          },
        },
      });
      if (!membership) {
        throw new ApiError(
          "You do not have access to this attachment",
          403,
          "ATTACHMENT_ACCESS_DENIED",
        );
      }
    } else if (message?.directChatId) {
      const chat = await prisma.directChat.findUnique({
        where: { id: message.directChatId },
      });
      if (!chat || (chat.user1Id !== userId && chat.user2Id !== userId)) {
        throw new ApiError(
          "You do not have access to this attachment",
          403,
          "ATTACHMENT_ACCESS_DENIED",
        );
      }
    }
  }

  const downloadUrl = await s3Service.generatePresignedGetUrl(
    attachment.s3Key,
    PRESIGN_GET_EXPIRY_SECONDS,
  );

  return {
    attachment: {
      id: attachment.id,
      filename: attachment.filename,
      mimeType: attachment.mimeType,
      size: attachment.size,
      width: attachment.width,
      height: attachment.height,
      thumbnailKey: attachment.thumbnailKey,
    },
    downloadUrl,
  };
}
