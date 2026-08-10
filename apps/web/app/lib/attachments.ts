import { api } from "./api";

/** Upload context accepted by the presign endpoint. */
export type AttachmentContext = "dm" | "room";

export interface UploadedAttachments {
  attachmentIds: string[];
  /** Message type derived from the first file, matching the server enum. */
  messageType: string;
}

const DEFAULT_MIME = "application/octet-stream";

/**
 * Presign-and-upload flow shared by every composer: ask the API for a
 * presigned PUT per file, upload straight to S3, and report the ids so the
 * caller can attach them to a message.
 */
export async function uploadAttachments(
  context: AttachmentContext,
  contextId: string,
  files: FileList,
): Promise<UploadedAttachments> {
  const attachmentIds: string[] = [];

  for (const file of Array.from(files)) {
    const presignRes = await api.post("/attachments/presign", {
      context,
      contextId,
      filename: file.name,
      mimeType: file.type || DEFAULT_MIME,
      size: file.size,
    });

    const { presignedUrl, attachmentId } = presignRes.data;

    const uploadRes = await fetch(presignedUrl, {
      method: "PUT",
      body: file,
      headers: { "Content-Type": file.type || DEFAULT_MIME },
    });
    if (!uploadRes.ok) {
      throw new Error(`Upload of ${file.name} failed (${uploadRes.status})`);
    }

    attachmentIds.push(attachmentId);
  }

  return { attachmentIds, messageType: messageTypeFor(files[0]) };
}

function messageTypeFor(file: File | undefined): string {
  if (file?.type.startsWith("image/")) return "IMAGE";
  if (file?.type.startsWith("video/")) return "VIDEO";
  if (file?.type.startsWith("audio/")) return "AUDIO";
  return "FILE";
}
