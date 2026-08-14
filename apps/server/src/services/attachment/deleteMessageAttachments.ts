import type { S3Service } from "../S3Service";
import { deleteAttachment } from "./deleteAttachment";
import { createLogger } from "../../lib/logger";

const log = createLogger("deleteMessageAttachments");

/**
 * Best-effort purge of a deleted message's attachments (S3 object + DB row).
 *
 * Called after the message soft-delete commits. Failures are logged and
 * swallowed so an S3 outage never blocks the message delete; a leftover file
 * is an acceptable orphan (the message marker hides it from the UI).
 */
export async function deleteMessageAttachments(
  s3Service: S3Service | null,
  attachmentIds: string[],
  userId: string,
): Promise<void> {
  if (!s3Service || attachmentIds.length === 0) return;
  for (const attachmentId of attachmentIds) {
    try {
      await deleteAttachment(s3Service, attachmentId, userId);
    } catch (err) {
      log.error("Failed to delete attachment during message delete", err, {
        attachmentId,
      });
    }
  }
}
