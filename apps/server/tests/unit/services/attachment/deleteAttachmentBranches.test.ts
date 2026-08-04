import { describe, it, expect, vi, beforeEach } from "vitest";
import { deleteAttachment } from "../../../../src/services/attachment/deleteAttachment";
import { createMockS3Service, resetMockS3Service } from "../../../mocks/s3";
import { prismaMock, resetPrismaMock } from "../../../mocks/prisma";
import { ApiError } from "../../../../src/lib/ApiError";

describe("deleteAttachment - branches", () => {
  const s3Service = createMockS3Service();

  beforeEach(() => {
    resetPrismaMock();
    resetMockS3Service(s3Service);
    vi.clearAllMocks();
  });

  it("should reject deletion of non-existent attachment", async () => {
    prismaMock.attachment.findUnique.mockResolvedValue(null);

    await expect(
      deleteAttachment(s3Service, "att-1", "u1"),
    ).rejects.toThrow("Attachment not found");
  });

  it("should reject PENDING attachment deletion by non-uploader", async () => {
    prismaMock.attachment.findUnique.mockResolvedValue({
      id: "att-1",
      s3Key: "attachments/dm/dc1/uuid.jpg",
      filename: "photo.jpg",
      mimeType: "image/jpeg",
      size: 1024,
      status: "PENDING",
      uploaderId: "u2",
      Message: null,
    } as any);

    await expect(
      deleteAttachment(s3Service, "att-1", "u1"),
    ).rejects.toThrow("You do not have permission to delete this attachment");
  });

  it("should reject room attachment deletion by non-admin non-sender", async () => {
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
      role: "MEMBER",
    } as any);

    await expect(
      deleteAttachment(s3Service, "att-1", "u1"),
    ).rejects.toThrow("You do not have permission to delete this attachment");
  });
});
