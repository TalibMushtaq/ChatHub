import { describe, it, expect, vi, beforeEach } from "vitest";
import { deleteAttachment } from "../../../../src/services/attachment/deleteAttachment";
import { createMockS3Service, resetMockS3Service } from "../../../mocks/s3";
import { prismaMock, resetPrismaMock } from "../../../mocks/prisma";

function createAttachmentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "att-1",
    s3Key: "attachments/dm/dc1/uuid.jpg",
    filename: "photo.jpg",
    mimeType: "image/jpeg",
    size: 1024,
    status: "ATTACHED",
    uploaderId: "u1",
    Message: { senderId: "u1", chatRoomId: null },
    ...overrides,
  } as any;
}

describe("deleteAttachment - direct chat and orphan branches", () => {
  const s3Service = createMockS3Service();

  beforeEach(() => {
    resetPrismaMock();
    resetMockS3Service(s3Service);
    vi.clearAllMocks();
  });

  it("should let the sender delete a DM attachment without a membership lookup", async () => {
    prismaMock.attachment.findUnique.mockResolvedValue(createAttachmentRow());
    prismaMock.attachment.delete.mockResolvedValue({} as any);

    const result = await deleteAttachment(s3Service, "att-1", "u1");

    expect(result.ok).toBe(true);
    expect(prismaMock.chatRoomMember.findUnique).not.toHaveBeenCalled();
    expect(s3Service.deleteObject).toHaveBeenCalledWith(
      "attachments/dm/dc1/uuid.jpg",
    );
  });

  it("should reject a non-sender deleting a DM attachment", async () => {
    prismaMock.attachment.findUnique.mockResolvedValue(
      createAttachmentRow({ Message: { senderId: "u2", chatRoomId: null } }),
    );

    await expect(
      deleteAttachment(s3Service, "att-1", "u1"),
    ).rejects.toMatchObject({
      statusCode: 403,
      code: "ATTACHMENT_DELETE_DENIED",
    });
    expect(s3Service.deleteObject).not.toHaveBeenCalled();
  });

  it("should let a room owner delete another member's attachment", async () => {
    prismaMock.attachment.findUnique.mockResolvedValue(
      createAttachmentRow({ Message: { senderId: "u2", chatRoomId: "r1" } }),
    );
    prismaMock.chatRoomMember.findUnique.mockResolvedValue({
      userId: "u1",
      chatRoomId: "r1",
      role: "OWNER",
    } as any);
    prismaMock.attachment.delete.mockResolvedValue({} as any);

    const result = await deleteAttachment(s3Service, "att-1", "u1");

    expect(result.ok).toBe(true);
  });

  it("should delete an ATTACHED attachment whose message row is missing", async () => {
    prismaMock.attachment.findUnique.mockResolvedValue(
      createAttachmentRow({ Message: null, uploaderId: "u2" }),
    );
    prismaMock.attachment.delete.mockResolvedValue({} as any);

    const result = await deleteAttachment(s3Service, "att-1", "u1");

    expect(result.ok).toBe(true);
    expect(prismaMock.attachment.delete).toHaveBeenCalledOnce();
  });
});
