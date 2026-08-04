import { Prisma } from "@prisma/client";
import { ApiError } from "../../lib/ApiError";
import { S3Service } from "../S3Service";

/**
 * Verify that all attachment IDs are valid for message creation.
 *
 * Checks (inside the provided transaction):
 * - Every attachment exists
 * - Every attachment is still PENDING
 * - Every attachment belongs to the sender (uploaderId)
 * - Every attachment's S3 object exists (via HeadObject)
 *
 * Returns the validated attachment records.
 *
 * Throws ApiError if any check fails, causing the outer transaction to rollback.
 */
export async function verifyAttachmentsForMessage(
  tx: Prisma.TransactionClient,
  s3Service: S3Service,
  attachmentIds: string[],
  uploaderId: string,
) {
  const attachments = await tx.attachment.findMany({
    where: { id: { in: attachmentIds } },
  });

  if (attachments.length !== attachmentIds.length) {
    throw new ApiError(
      "One or more attachments do not exist",
      400,
      "ATTACHMENT_NOT_FOUND",
    );
  }

  for (const att of attachments) {
    if (att.status !== "PENDING") {
      throw new ApiError(
        `Attachment ${att.id} has already been used`,
        400,
        "ATTACHMENT_ALREADY_USED",
      );
    }

    if (att.uploaderId !== uploaderId) {
      throw new ApiError(
        `Attachment ${att.id} does not belong to you`,
        403,
        "ATTACHMENT_OWNERSHIP",
      );
    }

    const exists = await s3Service.headObject(att.s3Key);
    if (!exists) {
      throw new ApiError(
        `Attachment ${att.id} object not found in storage`,
        400,
        "ATTACHMENT_OBJECT_MISSING",
      );
    }
  }

  return attachments;
}
