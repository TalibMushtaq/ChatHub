import { describe, it, expect, vi, beforeEach } from "vitest";
import { deleteAttachment } from "../../../../src/services/attachment/deleteAttachment";
import { createMockS3Service, resetMockS3Service } from "../../../mocks/s3";
import { prismaMock, resetPrismaMock } from "../../../mocks/prisma";

describe("deleteAttachment", () => {
  const s3Service = createMockS3Service();

  beforeEach(() => {
    resetPrismaMock();
    resetMockS3Service(s3Service);
    vi.clearAllMocks();
  });

  it("should allow room admin to delete an attachment", async () => {
    prismaMock.attachment.findUnique.mockResolvedValue({
      id: "att-1",
      s3Key: "attachments/room/r1/uuid.jpg",
      filename: "photo.jpg",
      mimeType: "image/jpeg",
      size: 1024,
      status: "ATTACHED",
      uploaderId: "u2",
      Message: {
        senderId: "u2",
        chatRoomId: "r1",
      },
    } as any);

    prismaMock.chatRoomMember.findUnique.mockResolvedValue({
      userId: "u1",
      chatRoomId: "r1",
      role: "ADMIN",
    } as any);

    prismaMock.attachment.delete.mockResolvedValue({} as any);

    const result = await deleteAttachment(s3Service, "att-1", "u1");

    expect(result.ok).toBe(true);
    expect(s3Service.deleteObject).toHaveBeenCalledOnce();
    expect(prismaMock.attachment.delete).toHaveBeenCalledOnce();
  });

  it("should succeed even if DB delete fails after S3 deletion", async () => {
    prismaMock.attachment.findUnique.mockResolvedValue({
      id: "att-1",
      s3Key: "attachments/dm/dc1/uuid.jpg",
      filename: "photo.jpg",
      mimeType: "image/jpeg",
      size: 1024,
      status: "PENDING",
      uploaderId: "u1",
      Message: null,
    } as any);

    prismaMock.attachment.delete.mockRejectedValue(
      new Error("DB connection lost"),
    );

    const result = await deleteAttachment(s3Service, "att-1", "u1");

    expect(result.ok).toBe(true);
    expect(s3Service.deleteObject).toHaveBeenCalledOnce();
  });

  it("should throw if S3 deletion fails", async () => {
    prismaMock.attachment.findUnique.mockResolvedValue({
      id: "att-1",
      s3Key: "attachments/dm/dc1/uuid.jpg",
      filename: "photo.jpg",
      mimeType: "image/jpeg",
      size: 1024,
      status: "PENDING",
      uploaderId: "u1",
      Message: null,
    } as any);

    s3Service.deleteObject.mockRejectedValue(new Error("S3 network error"));

    await expect(deleteAttachment(s3Service, "att-1", "u1")).rejects.toThrow(
      "Failed to delete attachment from storage",
    );
  });
});
